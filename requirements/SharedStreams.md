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