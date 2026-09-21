# Snip End: Inclusive/Exclusive Option

## Bruce's Ask

Split off from [`Chats/done/SupportUpcomingPlatformIncludeRoughly.md`](../done/SupportUpcomingPlatformIncludeRoughly.md).

`pipe-in-end`'s snip semantics are exclusive by design — the end marker
itself is discarded from the extracted output. Confirmed (code + a live
test) that this is invisible for the README's own
`pipe-in-end="</body>"` example, since `<body>`/`</body>` get stripped by
HTML fragment parsing either way, with or without the closing tag present.
But for an end marker that *is* itself real, surviving content — snipping to
`</table>`, `</section>`, or similar — exclusive-end means the extracted
fragment comes out missing that closing tag, which would visibly differ from
an inclusive-end result.

The number of dependencies on pipe-in is [currently 0](https://www.npmjs.com/package/pipe-in?activeTab=dependents) so I don't think we should be concerned at all about backwards compatibility.

We should change the default for pipe-in-start and pipe-in-end to be inclusive.

~~Add an opt-in way to make `pipe-in-end` inclusive instead of exclusive.
**Default must stay exclusive** — today's documented, tested behavior — so
nothing existing changes for anyone not using the new opt-in.~~

To override the defaults, add attributes  pipe-in-end-exclusive and/or pipe-in-start-exclusive. 

Please implement this, and update README.md with the change, and adjust unit tests as necessary and add the implementation notes below.

## Notes carried over from the parent conversation

- Current implementation: `snip.js`'s `snipTransform(start, end)`. `end` is
  exclusive by design — see its own doc comment
  (`@param {string} [end] - Marker string to stop snipping at (exclusive)`)
  and the code itself (`buffer.slice(0, idx)` — everything *up to* the match;
  the match text is never enqueued).
- `start` is already inclusive (the start marker itself is kept, from that
  point onward) — unchanged, not in scope here; this item is about `end` only.
- A natural, minimal shape: a boolean-style attribute, e.g.
  `pipe-in-end-inclusive`, mirroring the existing `${base}-xxx` boolean
  convention already used for `${base}-buffer`/`${base}-run-scripts`/etc.
  Absent (default) → exclusive, current behavior. Present → the end marker
  text itself is appended to the emitted output before stopping.

## Claude's Implementation Notes

Done as specified — both markers inclusive by default, `-exclusive` opt-out
per marker, no compatibility shim. `npm test` green — **2/2** (the buffer-path
polysketch test from the parent conversation, plus a new one for this).

### `snip.js`

`snipTransform(start, end, opts)` gains a third parameter,
`{startExclusive, endExclusive}`, both `false` by default:

- **Start:** was always `buffer.slice(idx)` (keep from the marker onward,
  marker included — this *was* already the only behavior, i.e. inclusive).
  Now `buffer.slice(startExclusive ? idx + start.length : idx)` — the new
  `startExclusive` path is what actually adds a capability that didn't exist
  before (excluding the start marker's own text was simply not possible
  previously).
- **End:** was always `buffer.slice(0, idx)` (stop before the marker — this
  *was* the only, exclusive-only behavior). Now
  `buffer.slice(0, endExclusive ? idx : idx + end.length)` — `endExclusive`
  restores exactly the old, only-ever-available behavior; the new default
  (`endExclusive` absent) is the behavior change.

The partial-match buffering logic (holding back `marker.length - 1` characters
across chunk boundaries, for both the not-yet-found-start and
not-yet-found-end cases) is unaffected — that's about not losing a marker
split across two network chunks, orthogonal to whether the marker ends up
included in the output once found.

### Threaded through both call sites

- **`fetch-and-set.js`** — `fetchText`/`fetchAndSet` both gained
  `startExclusive?`/`endExclusive?` on their options object, passed straight
  through to `snipTransform`. This is the path `gist-in` and this session's
  new polysketch `pipe-in-buffer` mode both use, though neither currently
  exposes `start`/`end` via their own attributes at all — so today this only
  has an observable effect via `pipe-in.js`'s classic path, below, but any
  future caller of `fetchText` gets the new default and the opt-out for free.
- **`pipe-in.js`** — classic `hydrate()` now destructures `startExclusive`/
  `endExclusive` from `self` alongside the existing `start`/`end`, and passes
  `{ startExclusive, endExclusive }` into the `snipTransform` call.
- **`emc.mjs`** — two new `withAttrs` entries,
  `startExclusive: '${base}-start-exclusive'` and
  `endExclusive: '${base}-end-exclusive'`, both `{instanceOf: 'Boolean'}` —
  same pattern as the existing `${base}-buffer`/`${base}-run-scripts`
  booleans. `emc.json`/`⇥.json` regenerated via `npm run build`.

### Tests — new, since none existed for snip at all before this session

**`tests/SnipInclusiveExclusive.html` + `.spec.mjs`** (new) — calls
`fetch-and-set.js`'s `fetchText` directly against a small static fixture
(`tests/fixtures/snip-fixture.html`:
`PREFIX-TEXT[[START]]MIDDLE-CONTENT[[END]]SUFFIX-TEXT`), deliberately
*bypassing* `<template>`/`streamHTML` entirely — the classic streaming path
still throws in unflagged Chromium (unrelated, pre-existing, expected; see the
parent conversation), so it can't be used to verify this. Covers: default
(both inclusive), `startExclusive` alone, `endExclusive` alone, both together,
and start-only/end-only (no counterpart marker) at their new defaults. All six
combinations match exactly. One self-inflicted bug caught before it shipped:
my first draft of the test page's intro paragraph contained the literal text
`` `<template>` `` — unescaped in real HTML (not Markdown), the browser
parsed that as an actual opening `<template>` tag, silently swallowing the
rest of the page's body (including `#target`) into its inert `.content`
fragment. Fixed by rewording rather than escaping, and re-verified.

### README

"Support for snipping" section rewritten: the inclusive/exclusive table, the
`-exclusive` attributes, and a note on the existing `pipe-in-end="</body>"`
example — it still works, but (as found in the parent conversation) the
inclusive/exclusive distinction is moot for that *specific* example, since
`<body>`/`</body>` are stripped by fragment parsing regardless; reworded to
point at `</table>`-style markers as the case where the default actually
matters.
