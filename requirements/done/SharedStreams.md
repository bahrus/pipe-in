# Shared Streams

---

## Backdrop

I first checked for the feasibility of this requirement:

>  I'm preparing to make a second attempt at addressing the "memoization" requirement, which could change in name, so let's look at it with a fresh mind.  Here's a query I have before I start anything...

> What is the feasibility that while one instance is piping in content into one element, suppose we have the accumulatingChunks and another instance appears with the same exact storage key, is there an elegant way to start another stream or something that starts with the accumlatedChunks, then pipes in the chunks from the other stream?

to which Kiro replied:

## Kiro preliminary thoughts

Good question. You're asking: can a second instance that arrives mid-stream "catch up" by replaying the chunks accumulated so far, then seamlessly continue with the live stream from that point forward?

**Yes, it's feasible.** The Streams API gives you the primitives. Here's the shape:

### The core idea

The first instance maintains a shared state object keyed by the storage key:

```js
// Module-level shared state
const inflight = new Map(); // storageKey → { chunks: string[], done: boolean, listeners: Set<ReadableStreamController> }
```

When the first instance starts streaming, it registers itself in `inflight` and pushes each chunk into `chunks[]` while also forwarding to any attached listeners.

When the second instance arrives and finds the same key in `inflight`:

1. Create a new `ReadableStream` whose `start()` callback immediately enqueues all existing `chunks[]` (the replay/catch-up)
2. Then register its controller in `listeners` so that subsequent chunks from the first instance's accumulator are also pushed to it in real-time
3. When the first instance's stream completes, it signals all listeners to close

```js
function createCatchUpStream(entry) {
    return new ReadableStream({
        start(controller) {
            // Replay everything accumulated so far
            for (const chunk of entry.chunks) {
                controller.enqueue(chunk);
            }
            if (entry.done) {
                controller.close();
            } else {
                // Subscribe to future chunks
                entry.listeners.add(controller);
            }
        },
        cancel() {
            entry.listeners.delete(this.controller);
        }
    });
}
```

The first instance's accumulator transform becomes a broadcaster:

```js
const accumulatorTransform = new TransformStream({
    transform(chunk, controller) {
        entry.chunks.push(chunk);
        // Forward to the primary stream
        controller.enqueue(chunk);
        // Broadcast to all catch-up subscribers
        for (const listener of entry.listeners) {
            listener.enqueue(chunk);
        }
    },
    flush() {
        entry.done = true;
        for (const listener of entry.listeners) {
            listener.close();
        }
    }
});
```

### The elegant part

The second instance then just pipes its catch-up stream through its own transform chain (snipping, URL rewriting, etc. — though if the storage key matches, those transforms are identical) into its own writable sink. From its perspective, it's just consuming a `ReadableStream<string>` — it doesn't know or care that part of it is a replay and part is live.

### Considerations

1. **Transform duplication:** The first instance already applied snipping + URL rewriting before accumulating. So the chunks in `entry.chunks` are post-transform. The second instance can pipe them directly into its writable sink without re-transforming. This is actually simpler — the catch-up stream is already "cooked."

2. **Shadow DOM / target setup:** The second instance still needs to set up its own shadow root, `<div part="content">`, and writable sink independently. Only the content stream is shared.

3. **Timing edge cases:** If the second instance appears after the first has already completed (`entry.done === true`), it's equivalent to the lazy template approach — just replay all chunks and close. No real-time subscription needed.

4. **Memory:** The chunks array stays in memory until all subscribers are done and the `inflight` entry is cleaned up. For the "completed" case, you'd transition to the sessionStorage/lazy-getter approach and delete the inflight entry.

### Is it worth it vs. the simpler template clone?

The streaming catch-up approach is more **progressive** — the second instance starts rendering immediately as chunks arrive, giving the user visible incremental content. The template clone approach is simpler but requires waiting for the full download to complete before the second instance gets anything.

**Where streaming catch-up wins:** Large documents (like the HTML spec) where you want both instances to show progressive content. The second instance might appear 2 seconds into a 10-second download — with catch-up, it gets those first 2 seconds of content immediately, then continues in lock-step.

**Where template clone wins:** Small component templates where the full download is sub-second and progressive rendering doesn't matter. Cloning is simpler, fewer moving parts.

### My take

It's absolutely feasible and the implementation is clean (~40 lines for the inflight map + broadcaster + catch-up stream factory). Whether it's worth it depends on whether the primary use case is large documents (streaming catch-up wins) or small component templates (lazy clone wins). You could support both — use the streaming approach while the first fetch is in-flight, then transition to the lazy template getter once it completes.

Want me to draft a requirements doc for this, or would you rather discuss the naming/scope further first?

## Human Ask

The Lazy Parsing required a standard storage key for a stream, based on the parameters that currently matter:

```js
const storageKey = `pipe-in:${resolvedUrl}|${start || ''}|${end || ''}|${injectBase ? 'base' : ''}`;
```

We should introduce another attribute / property [base]-share that maps to a boolean "share" property.

When set, this is a second scenario where the accumulating string is needed while streaming.

We need to maintain some sort of a (weak) map look up based on the storage key that points to in progress streams and/or already parsed templates, so that should a second instance of this pipe-in element adorn another element with the same calculated storage key, even if "share" isn't set, it hooks into the stream, if in progress.  If finished, the original sharing instance should have stored the string in sessionStorage, and parsed it on an as needed basis.

Ideally, the logic to "catch up" might be something loaded dynamically via dynamic import, as it seems like the code is significant, and wouldn't be needed all that often.

Likewise, the additional logic needed to "share", if it is significant, could be loaded dynamically, but I suspect this setting will be set to true more often than not.  I'm even considering making it the reverse, somelike "noShare", so that the sharing mechanism is applied by default.

---

## Kiro Response

### On naming: `share` (opt-in) vs `no-share` (opt-out)

I like the idea of sharing by default. The common case is: if you're fetching the same URL with the same transforms, you want deduplication. The rare case is when you intentionally want isolated fetches (maybe for freshness, or because you're mutating the target after streaming and don't want side effects on timing).

**`[base]-no-share`** as the opt-out works well. It's a boolean attribute — presence means "skip the shared stream infrastructure, do your own fetch." Absence (the default) means "participate in sharing."

This also aligns with how the `precede` / template handoff already works — sharing naturally feeds into the lazy template getter. The first instance that streams with sharing enabled becomes the "source of truth" for that storage key.

### On the relationship between `share`, `precede`, and the inflight map

Currently we have two accumulation triggers:

1. **`precedeScript` exists** → accumulate for the lazy template getter
2. **`share` is active (default)** → accumulate for broadcasting to late joiners

These overlap significantly. If sharing is the default, then accumulation is *almost always* happening. The `precede` handoff just adds the extra step of attaching the lazy getter to the script element and flipping the type.

I'd unify them: **sharing always accumulates into the inflight map.** The `precede` logic is just an additional consumer of the accumulated result at the end. This avoids two separate accumulator transforms in the pipeline.

### Architecture sketch

```
Module-level:
┌─────────────────────────────────────────────────────┐
│ inflight: Map<storageKey, InflightEntry>             │
│                                                     │
│ InflightEntry {                                     │
│   chunks: string[]      // post-transform chunks    │
│   done: boolean                                     │
│   listeners: Set<ReadableStreamDefaultController>   │
│   storageKey: string                                │
│ }                                                   │
└─────────────────────────────────────────────────────┘

First instance (source):
  1. Compute storageKey
  2. Create InflightEntry, register in inflight map
  3. Add broadcaster TransformStream to pipeline
  4. On flush: entry.done = true, close listeners,
     store in sessionStorage, remove from inflight map
  5. If precedeScript: attach lazy getter, flip type

Second instance (joiner):
  1. Compute storageKey
  2. Check inflight map:
     a. Entry exists, not done → dynamic import catch-up module,
        create catch-up ReadableStream, pipe to own writable sink
     b. Entry exists, done (race condition) → same as (c)
     c. No entry → check sessionStorage, parse on demand
        (or just re-fetch if no-share was set on the source)
```

### On dynamic imports for the catch-up logic

Agreed — the catch-up stream factory (`createCatchUpStream`) and the subscriber management are only needed when a second instance arrives mid-flight. That's the minority case. Making it a dynamic import (`pipe-in/catch-up.js`) keeps the main `pipe-in.js` lean.

The sharing/broadcasting logic (the accumulator transform + inflight map registration) is lightweight enough (~15 lines) to live inline in `pipe-in.js`, since it runs for the default case.

### Module split

| Module | When loaded | Responsibility |
|--------|------------|----------------|
| `pipe-in.js` | Always | Core hydrate, inflight map, broadcaster transform, sessionStorage write |
| `pipe-in/catch-up.js` | Dynamic, when a second instance arrives mid-stream | `createCatchUpStream()`, subscriber lifecycle |
| `pipe-in/snip.js` | Dynamic, when `start`/`end` are set | Snip transform |
| `pipe-in/rewrite-urls.js` | Dynamic, when `injectBase` is set | URL rewriting transform |

### On the inflight map lifetime

The inflight map should use a regular `Map` (not `WeakMap`) because the keys are strings (storage keys), not objects. Entries should be removed from the map after:

1. The stream completes AND the string is persisted to sessionStorage
2. OR the stream errors (clean up so retries can proceed)

This means the map only holds entries for *actively streaming* operations. Once done, the sessionStorage + lazy getter path takes over. Memory pressure is bounded by the number of concurrent in-flight fetches, not the total number of pipe-in instances on the page.

### Concern: what if the second instance has different `method` or `shadowrootmode`?

The storage key captures `url + start + end + injectBase`. But two instances could share the same key yet differ in how they *insert* the content (different `method`, one with shadow DOM and one without). The shared stream provides the same text chunks — that's fine. Each instance independently sets up its own target (shadow root, writable sink, etc.) and pipes the shared stream into it. The content is the same; only the insertion point differs.

This is already how it works in the catch-up design — the stream is "cooked" (post-transform), and each consumer independently creates its writable sink.

### Concern: `no-share` on the source vs on the consumer

If the *first* instance sets `no-share`, it won't register in the inflight map or accumulate. A second instance with the same URL won't find anything to join — it'll do its own fetch. That's the intended behavior.

If a *second* instance sets `no-share`, it should skip the inflight map lookup and always fetch independently, even if a shared stream exists.

Both directions make sense. `no-share` means "I don't participate in sharing, period — neither as source nor as consumer."

### Summary of my recommendations

1. **Default to sharing** — use `[base]-no-share` as the opt-out
2. **Unify accumulation** — sharing and `precede` both consume the same inflight entry
3. **Dynamic import for catch-up** — `pipe-in/catch-up.js` loaded only when a joiner arrives mid-stream
4. **Inflight map is a regular `Map<string, InflightEntry>`** — entries are short-lived (active streams only)
5. **sessionStorage is the "completed" tier** — after stream finishes, inflight entry is removed, string goes to storage, lazy getter handles future consumers

Shall I proceed to implement this?
