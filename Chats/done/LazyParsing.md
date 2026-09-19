# Lazy Parsing / Lower Memory Footprint

---

## Human Ask

The coupling with template maker has the following step:

```JavaScript
if (precedeScript) {
    const template = document.createElement('template');
    template.innerHTML = accumulatedChunks.join('');
    /** @type {any} */ (precedeScript)[Symbol.for('pipe-in:template')] = template;
    precedeScript.setAttribute('type', 'cede');
}
```

The (admittedly minor) problem is that this is parsing a potentially large string and storing it in RAM, based on the possibility that another instance of the custom element will appear that makes use of the template.  But that isn't at all guaranteed, and even if it does, it might not appear until much later in the application.  

I would like to instead propose either:

1.  Store the joined string in sessionStorage.
2.  Add a readonly lazy getter property to the precede script, with the same symbol key.  The getter would check if it has already parsed the template, and if so, return that.  If not, it would retrieve the string from session storage, parse it, and replace the lazy property with the template (or store it in a private variable and return the private variable template)

Or:

1.  Store the accumulatedChunks in indexedDB.
2.  Same as 2 above, but make the lazy getter return a promise to get the template. 

---

## Kiro Response

I like the direction here. You're right that eagerly parsing + holding a full DOM tree in memory "just in case" is wasteful for large templates that may never be cloned again. The lazy getter is an elegant solution — templ-maker's `onAssigned` would call it only when a second instance actually appears.

### Option A (sessionStorage) vs Option B (indexedDB)

| | sessionStorage | indexedDB |
|---|---|---|
| API | Synchronous | Async (Promise-based) |
| Size limit | ~5–10 MB total across all keys (browser-dependent) | Effectively unlimited (hundreds of MB+) |
| Lifetime | Tab session (cleared on close) | Persistent until explicitly deleted |
| Serialization | Strings only (already have a string) | Structured clone (strings work fine) |
| Blocking | Yes — synchronous reads block the main thread | No — async, non-blocking |

**My recommendation: Option A (sessionStorage) with a fallback.**

Here's why:

1. **Synchronous getter is much simpler for templ-maker.** If the getter returns a `Promise<HTMLTemplateElement>` instead of an `HTMLTemplateElement`, every consumer needs to be async-aware. templ-maker's `onAssigned` is currently synchronous. Making it async cascades complexity through the custom element registration path.

2. **The data fits comfortably.** A typical component template is 1–50 KB of HTML. Even with dozens of custom elements, you'd use a fraction of sessionStorage's capacity.

3. **Session lifetime is correct.** You don't want stale templates persisting across deploys. sessionStorage clears on tab close, which is exactly the right invalidation boundary for parsed component markup.

4. **No blocking concern in practice.** sessionStorage reads are synchronous and technically block, but reading a string < 100 KB from sessionStorage takes < 1ms. The subsequent `innerHTML` parse is the real cost, and that's the work we're deferring.

**When would you want indexedDB?** Only if you're dealing with truly massive templates (megabytes — think the HTML spec example) AND want cross-session caching. But for custom element templates, that's unlikely. If a specific use case demands it later, the getter pattern makes it easy to swap the backing store without changing the consumer API (just make the getter return a Promise at that point).

### Proposed implementation

```js
// In pipe-in.js, replacing the current template handoff:

if (precedeScript) {
    const html = accumulatedChunks.join('');
    const storageKey = `pipe-in:${resolvedUrl}`;
    
    // Store the raw HTML string in sessionStorage for lazy retrieval
    try {
        sessionStorage.setItem(storageKey, html);
    } catch (e) {
        // sessionStorage full or unavailable — fall back to in-memory
        console.warn('[pipe-in] sessionStorage unavailable, using in-memory template.');
    }

    // Define a lazy getter on the script element
    let cachedTemplate = null;
    Object.defineProperty(precedeScript, Symbol.for('pipe-in:template'), {
        get() {
            if (cachedTemplate) return cachedTemplate;
            const stored = sessionStorage.getItem(storageKey) ?? html;
            cachedTemplate = document.createElement('template');
            cachedTemplate.innerHTML = stored;
            return cachedTemplate;
        },
        configurable: true
    });

    precedeScript.setAttribute('type', 'cede');
}
```

### Key design decisions in this approach

1. **The getter is synchronous** — templ-maker can call it without awaiting.

2. **Fallback to in-memory string** — If sessionStorage is unavailable (private browsing in some browsers, quota exceeded), we keep `html` in closure as a fallback. Slightly worse memory profile but still functional.

3. **`configurable: true`** — Allows templ-maker or the element itself to later replace the property if it wants to (e.g., to explicitly null it out after cloning to release memory).

4. **Once parsed, stays parsed** — The `cachedTemplate` variable means we only parse once regardless of how many times the getter is called.

5. **Storage key includes resolved URL** — Ensures distinct templates for distinct components. If snipping/rewriting produce different results for the same URL, we'd need to include those in the key too (same approach as the memoize cache key discussion).

### Concern: storage key collisions with snipping

If two custom elements fetch the same URL but with different `start`/`end` markers, the storage key needs to differentiate them. I'd suggest:

```js
const storageKey = `pipe-in:${resolvedUrl}|${start || ''}|${end || ''}|${injectBase ? 'base' : ''}`;
```

### Open question

Should sessionStorage be cleaned up at any point? Options:

- **Never** — let the session end handle it (simplest, my preference)
- **After first getter access** — remove from storage once parsed into memory (saves storage but loses the ability to re-read if the template reference is lost)
- **On element disconnection** — if the seed element is removed from DOM, clean up its storage entry

I'd go with "never" — sessionStorage is scoped to the tab and auto-clears. Premature cleanup adds complexity for negligible benefit.
