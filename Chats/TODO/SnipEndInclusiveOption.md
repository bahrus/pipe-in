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

The number of dependencies on pipe-in is [currently 0](https://www.npmjs.com/package/pipe-in?activeTab=dependents)so I don't think we should be concerned at all about backwards compatibility.

We should change the default for pipe-in-start and pipe-in-end to be inclusive.



Add an opt-in way to make `pipe-in-end` inclusive instead of exclusive.
**Default must stay exclusive** — today's documented, tested behavior — so
nothing existing changes for anyone not using the new opt-in.

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
