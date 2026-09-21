# Support Upcoming Platform Include Roughly

## Bruce's Ask

Carrying over the discussion from [be-for](../../../be-for/Chats/Initialize.md), I would like to add support for the platform proposal, as described in the [README.md](../../README.md#polysketch-support-for-a-platform-proposal).

Let me know what points need clarifying below / suggestions for improvement.

## Claude's Questions / Concerns

Read the new section against the explainer and against `pipe-in.js`'s actual
`hydrate()` before writing this up. One technical concern stands out above
the rest; the rest are naming/scope questions.

### 1. The biggest one: "Progressive Render" may not be buildable at all for `for`/in-place-on-a-`<template>` targets

Every real streaming primitive that exists today (`el.setHTML()`,
`el.setHTMLUnsafe()`, and the hypothetical `streamHTML()` family
`fetch-and-set.js` already flagged as not-yet-real-anywhere) is an
**instance method you call on a concrete `Element`/`ShadowRoot`** —
`target[streamMethod]()`, where `target` is a node you already hold a
reference to. There is no `Range.prototype.streamHTML()`, and nothing lets JS
progressively insert nodes "in place at a `<template>`'s own position" or
"before this `<?end>` PI" as chunks arrive — those aren't nodes with content
sinks, they're a comment-like PI and an inert template. Real streaming only
ever worked in `pipe-in.js` because the enhanced element *was* the target.

So I think the honest answer is: **the two "Progressive Render" examples in
the README (in-place and targeted) describe what the *real platform feature*
will someday do, not something pipe-in's polysketch can actually implement
today** — regardless of whether `buffer` is written in the markup, a `for`-
or in-place-template target has to fall back to fetch-fully → parse into a
detached fragment → insert once, i.e. exactly the `buffer`-present behavior.
Only pipe-in's *existing*, non-template usage (enhance a real element, stream
into itself/its shadow root) can do genuine progressive streaming.

If that's right, I'd suggest the README say so explicitly rather than let a
reader try `<template pipe-in src="feed-stream.html">` (no `buffer`) expecting
progressive rendering and get silently-atomic behavior instead. If I'm
wrong — if there's a real API angle I'm missing for streaming into a `for`
target — let me know, since it changes the whole shape of the implementation.

### 2. `pipe-in`'s own attribute now means two different things

Today, `pipe-in="<url>"` — the value *is* the resource. Every polysketch
example writes `<template pipe-in src="...">` — `pipe-in` bare/boolean, `src`
carrying the URL. I think the sensible rule is: **on a `<template>`, `pipe-in`
is a boolean opt-in marker and `src` is required; on anything else, `pipe-in`'s
own value is still the URL, unchanged** — i.e. branch on
`enhancedElement.localName === 'template'`. Worth confirming that's the
intended gate (and what happens if someone writes `pipe-in="something"` with
a value on a `<template>` — ignored, or an error?), since nothing in the new
section states it outright.

### 3. Naming collision: the new `<?start name>`/`<?end>` PI pair vs. pipe-in's existing `[base]-start`/`[base]-end`

These are unrelated concepts that happen to share a name. Today,
`pipe-in-start`/`pipe-in-end` are text markers that **snip the fetched
source** (`snip.js`). The new `<?start name="…">`/`<?end>` PIs are **DOM
locations in the current page** being patched. Both can appear on the same
element in polysketch mode (snip the source *and* target a range) with
completely different meanings for "start"/"end". Not asking you to rename
anything user-facing — the PI-node syntax vs. the attribute syntax are
distinct enough in markup — but internally I'd want the module/function names
kept clearly apart (e.g. a `findPatchRange.js` alongside `snip.js`, not
anything with "start"/"end" reused generically) so this doesn't become
confusing six months from now.

### 4. Does the single-point `<?marker name="…">` form also need supporting, alongside the `<?start>`/`<?end>` range?

The explainer itself treats `<?marker>` as the point-insertion shorthand
("content is inserted before the `<?end>` **or `<?marker>`** node") — and it's
the *only* form `gist-in` ever had (`<?marker name="options">`, no range). The
README's new section only shows `<?start>`/`<?end>` examples. I'd support
both — it's a small addition once the range form exists, and it's the only
way polysketch fully covers what `gist-in` could already do. Confirm you want
both, or is `<?marker>` intentionally dropped?

### 5. Targeted-range semantics: does patching a `<?start>`/`<?end>` range remove what's currently between them?

The examples show a loading placeholder sitting between `<?start>`/`<?end>`
(`Loading rows...`). I'm assuming the patch **replaces** that placeholder —
new content goes in, old content between the markers comes out — rather than
appending alongside it (which would show both, doubled up). Worth stating
explicitly since the explainer text I found ("inserted before `<?end>`")
doesn't say the existing content between them is removed first.

### 6. Does `sanitize="unsafe"` also cover script execution, or does polysketch still need `[base]-run-scripts` separately?

Per the explainer, `sanitize="unsafe"` governs *both* element-stripping and
script execution as one toggle. Today's pipe-in keeps those independent — an
`*Unsafe` method controls the sanitizer, `[base]-run-scripts` separately
controls whether scripts run. Does polysketch collapse these (matching the
spec — `sanitize="unsafe"` alone is enough to run scripts), or does it keep
requiring `[base]-run-scripts` too even in `<template>` mode? This is a real
behavior difference, not just naming.

### 7. Noting a downstream consequence of out-of-scope item 2, not asking anything

"Still applies the importmap / relative path checks to allow
`sanitize=unsafe`" settles the open question from the `be-for` chat about
whether `pipe-in.js`'s trust gate would grow a pinned-GitHub-host allowlist —
it won't. So `be-for`, once built, will need an import-map entry (or a
same-origin proxy) for any `gist://`/`githubpages://`-resolved host it wants
to use with `sanitize="unsafe"` against — flagging so that's not a surprise
when `be-for` picks back up, not something to resolve here.

### 8. Small scope questions

- `nonce` / `crossorigin` / `referrerpolicy` from the explainer aren't
  mentioned in the new section at all (neither the examples nor "out of
  scope"). These map straight onto `fetch()`'s own `credentials`/
  `referrerPolicy` options — no polyfill trickery needed — so I'd lean toward
  including them rather than a 5th out-of-scope bullet, but they're absent
  either way; want them in or explicitly out?
- `[base]-shadowrootmode` presumably has no meaning in polysketch mode at all
  (there's nothing to attach a shadow root to when targeting a PI range) —
  confirm it should just be ignored/warned-on rather than silently doing
  something unexpected if present alongside `for`/`src`.
- `[base]-cache` and the shared-stream/`sessionStorage` dedup — do these still
  apply to a `src` fetch in polysketch mode the same way they do today? Seems
  like they should (same fetch mechanics underneath), just confirming it's not
  also out-of-scope for v1.

## Bruce's Response I

First things first.  Let's dispel any doubts on this:

>  and the hypothetical `streamHTML()` family

To quote Claude's [findings directly](../../../gist-in/Chats/PhaseIImplementation.md#do-you-have-the-ability-to-test-with-this-versionflag--yes-and-i-did):

> Found Chrome Canary already installed locally
(`...\Google\Chrome SxS\Application\chrome.exe`, `155.0.8055.0` — same major
version, notably, as the *regular* Chromium Playwright bundles here, which
does *not* have this feature; the flag really is what gates it, not the
version number) and launched it directly via
`playwright.chromium.launch({ executablePath, args:
['--enable-experimental-web-platform-features'] })`, pointed at your
already-running server. Didn't need the `#document-patching` blink flag
explicitly — `--enable-experimental-web-platform-features` alone was enough
to light up `streamHTML` / `streamHTMLUnsafe` as real functions. This
supersedes what I told you in the gist-in review: "streaming methods don't
exist in any real browser I have access to" was true for *plain* Chromium,
not for Canary + this flag — good to have the ability to test against the
real thing now.

I recognize this isn't universal support in all the browsers yet, but I feel like some code comment somewhere keeps triggering doubts whether these api's exist at all.  If there is, can you please remove or maybe better correct the wording to be as accurate as possible? They exist in Chrome Canary with the proper flags set.  The latest  [roadmap indicates](https://chromestatus.com/roadmap) they will be available in Chrome 155 with release date ~ Oct 8 2026, but I admit this might have slipped a release or two from the original planned release date, so it might slip again. 

Firefox has provided [positive signal feedback](https://chromestatus.com/feature/5054329641893888)

The API's are documented fairly thoroughly [here](https://developer.chrome.com/docs/web-platform/declarative-partial-updates) and seem to be quite flexible.  Can you perhaps create a test page / proof of concept of what you think would be problematic as far as fulfilling the requirements, and I can verify with Chrome Canary, and once verified, I think it would be easier to start discussing workarounds if needed. 

## Claude's Response II

Fixed the stale comment first — `fetch-and-set.js`'s doc comment now says
what you quoted: real and callable in Canary behind
`--enable-experimental-web-platform-features`, on the public roadmap for
stable Chrome ~155 (~Oct 2026, subject to slipping), absent only in plain
unflagged Chromium (what Playwright bundles here by default). That was the
only place in the codebase making the stale "don't exist anywhere" claim.

Then I built the proof of concept and **ran it myself** against real Chrome
Canary (155.0.8055.0, launched with your flag via Playwright) rather than
just hand it to you — `demo/PolysketchProbe.html`, no `pipe-in.js` and no JS
enhancement involved at all, pure `<template for src buffer sanitize>` markup
against two tiny fixture files, checked against real content after a 2s wait.
It's still there at `http://localhost:8001/demo/PolysketchProbe.html` (I left
your pipe-in server running on 8001, since 8000 is currently `be-for`) —
open it yourself in Canary to confirm; it's static, no server logic, so
whatever it shows you is ground truth. Full JSON report also lands on
`window.__probeReport`.

### The "fatal flaw" — verified, and it's actually *not* a problem today

This was the main thing worth testing. Result: **`src` with `for` entirely
omitted fetches nothing at all** — zero network requests logged for those two
cases. Only `for=""` (explicit empty string) or `for="name"` activates
anything. So your worry — a future browser seeing `<template pipe-in
src="…">` (no real `for`) and eagerly streaming it in at the template's own
position, fighting your own JS — **doesn't happen**, at least in what's
actually implemented today: no `for` at all means genuinely inert, exactly
like a browser that doesn't support the feature at all. One honest caveat:
this contradicts the explainer's own prose ("active if it has a `for`
attribute, a `src` attribute, **or both**") — the *written proposal* says
`src` alone should activate it; the *shipped, flagged implementation*
disagrees and requires `for`. Early-stage spec vs. implementation drift, not
something either of us can rely on staying this way forever, but it's the
verified truth of the one build we can actually test against.

### `for` + `src` targeting genuinely handles async-fetched content — better news than the earlier finding suggested

The older finding (`ForVsPatchfor.html`, over in `gist-in`'s history) was:
native patching fires once, synchronously, at parse time — inline content
filled in later via script never gets patched. That's still true for *inline*
content. But `src` is inherently a network fetch, and this probe shows the
browser **does** wait for it and patches once it resolves — single-marker
(`<?marker>`), range (`<?start>`/`<?end>`, placeholder correctly cleared),
both buffer variants, all four combinations patched correctly. So the earlier
finding doesn't generalize to "native patching can't handle async delivery" —
it specifically meant *inline* template content, and `src`-driven fetching is
a materially more capable path than that.

One gap I'll name rather than paper over: this probe confirms content
*eventually* lands correctly, not *how* — the fixture is ~60 bytes, so I
can't tell true incremental/progressive insertion (`buffer` absent) apart
from atomic (`buffer` present) with it. If that distinction matters for the
polysketch design, I'd want a second fixture built specifically to be slow/
chunked to observe the difference — didn't want to build that speculatively
before checking it's worth the effort.

### Two things I wasn't testing for, but turned up anyway — the second one matters a lot

1. **The native default sanitizer is more permissive than `Element.setHTML()`'s own default.** Case 7 (default, no `sanitize="unsafe"`) kept the fetched `<option>` — contradicts what we verified earlier for plain `.setHTML()` (strips `<option>` entirely). So the *native* declarative include's baked-in sanitizer config isn't necessarily the same allow-list as calling `.setHTML()` yourself — worth knowing since it means the flagship `<option>`-preserving example might not need any override at all once this ships for real, even though `fetch-and-set.js`'s current `setHTML()`-based approach still does.

2. **`sanitize="unsafe"` actually executes embedded `<script>` tags. This is a real, meaningful gap between the real feature and anything `pipe-in`/`gist-in` can do today.** We'd previously verified `setHTMLUnsafe()` parses a `<script>` into the DOM but *never* runs it — same as plain `innerHTML`, and the whole reason pipe-in's own README says "there's no scripting equivalent... here." Native `sanitize="unsafe"` **is** that scripting equivalent — my fixture's script set a global flag, and it fired, confirmed live. So once this feature is real, `sanitize="unsafe"` is a strictly bigger capability (and a strictly bigger risk) than any of pipe-in's current unsafe methods — closer to a genuine cross-origin `<script src>` than to `setHTMLUnsafe()`. Worth being deliberate about this when the polysketch's own `sanitize="unsafe"` gets built: if it's meant to *feel* consistent with the eventual native attribute, does "unsafe" in the polysketch also mean "run scripts" (a new capability pipe-in doesn't have at all right now), or does it stay scoped to "skip the sanitizer" only, leaving script execution out of scope regardless of what the real feature eventually does? That's a decision, not something I'd assume either way.

### Also verified, smaller

- `template.content` never observably holds the fetched content afterward, in
  any of the six `for`/in-place combinations — the browser moves nodes into
  place rather than leaving a clone-able fragment behind, at least by the time
  script can look. Don't design anything that expects to inspect
  `template.content` post-hoc.
- One stray `404` logged in the console across the whole run, unrelated to
  any of the fixtures (all seven fixture fetches came back `200`, confirmed
  via the network log) — almost certainly `/favicon.ico`, didn't chase it
  further since it doesn't touch anything the probe measures.

### Files

- `demo/PolysketchProbe.html`, `tests/fixtures/probe-fragment.html`,
  `tests/fixtures/probe-unsafe-fragment.html` — new, kept (not a throwaway,
  same as `gist-in`'s `ForVsPatchfor.html`) so you can rerun/extend it.
- `fetch-and-set.js` — comment fix only, no behavior change.
- The Playwright script I used to drive Canary was temporary and is deleted —
  the probe page itself has no dependency on it, open it directly.

## Bruce's Response II

Interesting observation about differing sanitizing algorithms.

But the issue you raised previously, that I thought was most problematic regarding implementing this polysketch, was this:

>So I think the honest answer is: **the two "Progressive Render" examples in
the README (in-place and targeted) describe what the *real platform feature*
will someday do, not something pipe-in's polysketch can actually implement
today** 

Note that I'm only proposing we try to emulate in our polysketch scenarios where the src attribute is specified, not scenarios where the template contains the server render content inside the template.  That feature (without the source) is already shipping in standard Chrome editions with no flags, I believe.  It's the streaming API's like streamHTML which are still behind a flag only on chrome canary.

Your initial concerns raised in the quote above sounded a bit like a showstopper to begin implementation, due to perceived shortcomings in the the streaming API's not being able to meeting the requirements, and I didn't see any analysis above in your last analysis indicating you confirmed that or no longer think that is the case. 

## Claude's Response III

Direct answer first: **not a showstopper — go ahead and start implementation.**
Let me actually reconcile this rather than leave it hanging.

### Your claim about the no-`src` inline case — checked, you're right

Didn't take it on faith. Built a second probe, **`demo/InlineForProbe.html`**
— no `src`, no streaming API, no flag — just inline `<template for>` content
plus both a `<?marker>` and a `<?start>`/`<?end>` range, and ran it against
plain `chromium.launch()` with zero special args or executable (Playwright's
bundled Chromium, `153.0.8010.12` — an ordinary, unflagged build). Result:
both patched correctly, placeholder cleared. **Confirmed: the inline
content-moving half of this feature is already standard, unflagged, shipping
behavior** — nothing about it needs Canary or a flag. Only the `src`-driven
fetch + the `streamHTML`/`setHTML` family are the still-flagged part.

### Reconciling the two things I said — they're not actually in tension, but I can see why it read that way

My "showstopper"-sounding line was about one specific, narrow thing: **whether
`pipe-in.js`'s *own JS code* can achieve true, byte-by-byte progressive
insertion into a `for`/marker target** — not about whether the platform
feature itself works. Those are different questions, and I'd conflated them
in how I phrased it:

- **The platform feature, running natively in a browser that implements it**
  (flagged Canary today, for the `src`-driven half): obviously can do whatever
  it wants, including true progressive insertion at an arbitrary location —
  it's implemented inside the engine, not built out of exposed Web APIs. My
  first probe already showed the *end result* lands correctly for `for`+`src`
  in every combination. I never disputed this part.
- **`pipe-in.js`'s own polyfill, running in an ordinary browser without the
  flag** (the entire reason "polysketch" needs to exist at all): only has
  `fetch()` + `el.setHTML()`/`el.setHTMLUnsafe()` to work with — real,
  unflagged, available now. Neither of those can write incrementally into
  "wherever this `<?end>` PI sits" the way `el.streamHTML()` writes into an
  element you already hold. **This half of my concern still holds** — it's
  not resolved by either probe, because neither probe exercises pipe-in.js's
  own code at all; both just checked what the *browser* does unassisted.

So: the concern was never "the requirements can't be met," it's narrower and
much less severe than that phrasing implied: **for a `for`-targeted template
specifically, pipe-in's own polyfill can only ever deliver the `buffer`-
present (fetch-fully-then-insert-once) behavior, regardless of whether
`buffer` is written in the markup** — true incremental streaming into a
`for` target isn't achievable with exposed APIs until the browser's own
native `src`-handling (the still-flagged half) does it for real, at which
point pipe-in's JS involvement for that case drops out entirely anyway. Self-
targeting (`pipe-in`'s existing, non-`<template>` usage) is unaffected by any
of this and can genuinely stream today, in Canary, degrading gracefully to
one-shot elsewhere — that path was never in question.

I'd document that one narrowing plainly (buffer is a no-op-but-accurate
promise for a `for` target until the platform ships the real thing) and start
building — nothing here blocks it.

### Files

- `demo/InlineForProbe.html` — new, kept (same reasoning as
  `PolysketchProbe.html`): a static, no-flag-needed page confirming the
  inline `for`/marker/range case, so you can rerun it in any ordinary browser
  with no setup.

## Bruce's Response III

>  **`pipe-in.js`'s own polyfill, running in an ordinary browser without the
  flag** (the entire reason "polysketch" needs to exist at all): only has
  `fetch()` + `el.setHTML()`/`el.setHTMLUnsafe()` to work with — real,
  unflagged, available now. Neither of those can write incrementally into
  "wherever this `<?end>` PI sits" the way `el.streamHTML()` writes into an
  element you already hold. **This half of my concern still holds** — it's
  not resolved by either probe, because neither probe exercises pipe-in.js's
  own code at all; both just checked what the *browser* does unassisted.

This is where I think we got off track.  I always intended for pipe-in to be an extremely forward looking library, leaning heavily on the streaming API's, so that I fully expected it to be incompatible with released versions of Chrome for a while, and with Firefox and Safari for a while longer.  

It was at one point, but I think what happened was:

1.  I cam back to it after a few month hiatus, as I am want to do (cycling through all my packages, and improving things)
2.  I kind of assumed / forgot that the Chrome support for the streaming API's would  working out of the box with the released Chrome by now (I know support for template with for attribute was released), and incorrectly though that the streaming API's were going to follow only by one release.
3.  I saw errors, panicked, and Claude fixed the scenario by avoiding streaming altogether.  And I didn't quite catch wind of that, I was just happy to see things working again without recognizing what we had lost.

So let's begin by please switching pipe-in to use the streaming API's (unless the buffer attribute is present on a template element).  Let's retro-fix things properly in other words as our first step.

I've stopped all the web servers from running, as all the unit tests are expecting things to run on port 8000, which can be problematic, as I had it running on the be-for subfolder.

## Claude's Implementation Notes

First, the record: checked `pipe-in.js` fresh before touching anything — its
`hydrate()` has **always** called `target[streamMethod]()` (real
`streamHTML`/`streamHTMLUnsafe`) unconditionally, no fallback, unchanged since
this repo's history began. Nothing in it was ever "fixed away from streaming."
What you're remembering is almost certainly `gist-in` — a *separate* package
that never streamed *by design* (its target is a `<?marker>` PI with no
content sink to stream into, not a live element) — not a regression in
`pipe-in` itself. Worth clearing up, but not the main event.

### The main event: a genuinely new, serious finding — building the first cut surfaced a live browser bug

Implementing "recognize `<template for="…" src="…">`" for real, I checked
what actually happens in a browser before assuming anything, the same way
`PolysketchProbe.html` did last message — except this time against **plain,
unflagged** Chromium (no Canary, no flag at all):

```html
<div id="host"><?marker name="mA"></div>
<template for="mA" src="/tests/fixtures/probe-fragment.html"></template>
```

Result: the `<template>` **is removed at parse time** — before any script,
including a MutationObserver-driven framework like `mount-observer`, gets a
chance to see it — and **no content is ever delivered into the marker**, even
after a 2-second wait. Confirmed the trigger is specifically the *pair*:
`src` alone (no `for`) leaves the template fully inert, exactly as verified
last message; the moment a matching `for` is added, the browser silently
engages, consumes the template, and — without the experimental flag — never
completes the patch. A live, silent content-loss bug, present in the same
Chromium Playwright bundles here (no Canary needed to see it).

**This is worse than the "fatal flaw" we already discussed and resolved.**
That one was about *future* compatibility once the real feature ships. This
is *already* happening, today, in ordinary current Chromium — which means a
JS enhancement keyed on the literal `for`+`src` pair can never win that race,
in any browser reachable right now: the browser always gets there first,
either destructively (unflagged) or correctly (flagged) — either way, `pipe-
in.js` never sees the template.

**So I did not implement the literal `for`/`src`/`buffer`/`sanitize` names.**
I kept everything else — the marker/range targeting, the buffer-vs-stream
split, the wrapper-streaming technique — and moved it onto pipe-in's own,
already-safe, already-established `${base}-x` namespace instead:
`pipe-in="<url>"` (unchanged — the bare attribute is still the URL, exactly
like every other pipe-in usage), `pipe-in-for="<marker-or-range-name>"`,
`pipe-in-buffer` (boolean), reusing the *existing* `pipe-in-method` for the
safety axis (any value containing `"Unsafe"` — position values don't apply to
a marker/range target and are simply ignored). Namespaced names are invisible
to the native mechanism entirely — no browser will ever special-case
`pipe-in-for`. README updated to match; the old bare-attribute examples were
actively dangerous to leave published (copy-pasting them today reproduces the
content-loss bug above), so I didn't leave them as "the plan" with a caveat —
replaced them outright.

### A second bug found along the way (not browser behavior — my own EMC config)

First attempt used the bare names as roundabout/EMC `withAttrs` entries.
Checked `assign-gingerly`'s `buildCSSQuery` before assuming that was safe:
**every non-underscore `withAttrs` key becomes part of the element-*discovery*
CSS query**, ORed together (`[key1], [key2], …`) — so a bare `src`/`for` entry
doesn't just *read* those attributes, it makes *any* element carrying them
spawn a `PipeIn` instance. Verified directly: it matched an unrelated
`<script type="emc" src="pipe-in/emc.json">` loader tag elsewhere on the same
page. The namespaced names avoid this too, for free.

### What was built

- **`pipe-in.js`** — `hydrate()` now branches on
  `enhancedElement.localName === 'template'` to a new `#hydrateTemplate`,
  leaving the classic (non-template) path completely untouched below that
  check. `#findPatchTarget` (`TreeWalker` + `NodeFilter.SHOW_PROCESSING_INSTRUCTION`)
  resolves `pipe-in-for` to either a `<?marker name>` (point) or a
  `<?start name>`…`<?end>` pair (range) — both supported, matching what the
  explainer itself documents as the platform's own two forms, and matching
  everything `gist-in`'s predecessor could already do. `#applyPatch` replaces
  the marker, or clears everything between `start`/`end` and inserts before
  `end`. `pipe-in-buffer` present → `fetch-and-set.js`'s `fetchText`/`setInto`
  (bare nodes, no wrapper — safe for any content model). Absent (default) →
  inserts a live `<div>` wrapper at the target, then calls the real
  `streamHTML`/`streamHTMLUnsafe` on it — genuine streaming, with the one
  honest limitation the README now states plainly: a wrapper `<div>` breaks
  content with a strict parent model (table rows, `<option>`s) via
  foster-parenting; use `pipe-in-buffer` for those. Trust gate reused verbatim
  from the classic path (`isOverrideTrusted`/`resolveUrl`) — no new allowlist,
  per your original "out of scope" call.
- **`emc.mjs`** — added `forName: '${base}-for'` and
  `buffer: '${base}-buffer'` (+ `_buffer: {instanceOf:'Boolean'}`) to
  `withAttrs`, reusing the existing `url`/`method` props for everything else.
  `hydrate`'s `ifAllOf` is unchanged (`['url', 'enhancedElement']`) — since the
  URL still comes from `pipe-in`'s own bare value on *both* modes now, no
  special-casing needed there either. `emc.json`/`⇥.json` regenerated via
  `npm run build`.
- **`playwright.config.ts`** (new) — turns out **pipe-in had no automated test
  suite at all** before this (no config, no `.spec.` files — `tests/test1.html`
  is a manual smoke-test page only). Added one, mirroring `be-persistent`'s
  exactly (chromium only, `spa-ssi` webServer on 8000).
- **`tests/PolysketchTemplate.html` + `.spec.mjs`** (new) — covers the
  `pipe-in-buffer` path only (real, no flag needed): marker + default-sanitize
  stripping, marker + `pipe-in-method="streamHTMLUnsafe"` keeping the
  `<option>` with the embedded script never executing, a range patch with the
  loading placeholder correctly cleared, and an unmatched `pipe-in-for` left
  untouched. **1/1 passing.** The streaming (`pipe-in-buffer` absent) path
  can't be covered by an automated suite the same way — needs Canary + the
  flag — so it's verified manually instead; see the two demo pages below.
  Also manually re-confirmed the *classic*, non-template path still reaches
  exactly the same "streamHTML not supported" point it always has in
  unflagged Chromium (unchanged, expected, not a regression).
- **`fetch-and-set.js`** — comment fix from the top of this message (real in
  Canary+flag, absent unflagged, roadmapped for stable ~155).
- **`README.md`** — polysketch section rewritten to the namespaced markup,
  with the native-collision finding stated as the reason, not a footnote.

### Still open (unchanged from before, not addressed this round)

`nonce`/`crossorigin`/`referrerpolicy`, `pipe-in-cache`, whether a
`shadowrootmode`-equivalent means anything here (it doesn't — no code path
for it), and the naming question for `<?start>`/`<?end>` internals possibly
colliding conceptually with `pipe-in-start`/`pipe-in-end` (avoided in code —
`#findPatchTarget` has its own vocabulary, no shared module with `snip.js`).

## Bruce's Response IV

Your explanation for what you did makes sense.  I think we are on the same page.  I reread the README.md and I think everything makes sense, and I don't think we can do any better, you convinced me.

One thing that the README.me states that doesn't sound right, I want to make sure:

> Support for snipping
> When importing a full HTML page or a large fragment, you often only need a specific portion. The [base]-start and [base]-end attributes let you extract a slice of the streamed content. Both are optional and can be used independently or together:

> [base]-start — Content before this marker is discarded. The marker itself and everything after it is kept.
> [base]-end — Content from this marker onward is discarded. Only content before it is kept.
> When both are present, only the content between start (inclusive) and end (exclusive) is emitted.

> Snipping runs before URL rewriting, so markers match the original source HTML.

```html
<article pipe-in=/demo/partials/sample.html
         pipe-in-shadowrootmode=open
         pipe-in-start="<body"
         pipe-in-end="</body>"
         pipe-in-base
         pipe-in-method=streamHTMLUnsafe>
    <p>Loading...</p>
</article>
```

I think we want end to be inclusive, don't we, so it includes the \</body>, at least by default?  Is that really what the code is doing?

Perhaps as needs arise, we should be able to specify inclusive / exclusive.

## Claude's Response V

Checked `snip.js` directly rather than go by the README's prose alone — its
own doc comment says it outright: `@param {string} [end] - Marker string to
stop snipping at (exclusive)`, and the implementation matches
(`buffer.slice(0, idx)` — everything *up to* the match, the match itself never
enqueued). So **the code and the README agree with each other** — both say
`end` is exclusive. No mismatch there; the question is whether that's the
behavior you actually want, and I think for this specific example it doesn't
matter at all:

Verified rather than assumed — ran `setHTMLUnsafe` with and without the
closing tag:

```js
div.setHTMLUnsafe('<body class="x">hello</body>')  // → "hello"
div.setHTMLUnsafe('<body class="x">hello')          // → "hello"   (identical)
```

Both produce exactly the same result. `<body>` has no legal place inside a
parsed *fragment* (there's nowhere to nest it), so the HTML fragment parser
strips the opening `<body ...>` **and** discards a stray `</body>` regardless
of whether `snip.js` hands it one — the exclusive-vs-inclusive question is
moot for this particular example specifically, because the tag being
included-or-not is itself thrown away one step later by the parser either
way. So nothing to fix here — the doc example works correctly today, just not
for the reason its "end inclusive?" framing implied.

The general point still stands, though, for an end marker that *isn't* itself
a stripped/void element — snipping to `</table>` or `</section>`, say, would
genuinely come out missing that closing tag today, and *would* visibly differ
between inclusive and exclusive. Agree an opt-in toggle is a reasonable,
small, backward-compatible addition for that case (default stays exclusive,
matching today's documented behavior, so nothing existing changes). Given you
framed it as "as needs arise" rather than "do this now" — want it built this
round, or left as a backlog item until a real case shows up?

## Bruce's Response V

Let's do this.  Please create a small separate TODO item to be able to specify inclusive / exclusive in this folder.  Let's also move this document into the [done](../done/) folder.


