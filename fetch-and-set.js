// @ts-check

/**
 * fetch-and-set.js — fetch (optionally start/end-snipped) HTML and write it
 * into a target via the real, currently-shipping HTML Sanitizer API
 * (`Element.prototype.setHTML` / `setHTMLUnsafe`), applying the same
 * default-safe-sanitizer behavior pipe-in's own non-`Unsafe` methods
 * document. Factored out for reuse by other packages (`gist-in`) that need
 * pipe-in's fetch/snip/sanitize behavior against a one-shot target rather
 * than a live, progressively-growing element.
 *
 * Why this instead of `pipe-in.js`'s own `target[method]()` (`streamHTML`
 * etc.)? Those are the Declarative Partial Updates proposal's streaming
 * methods. Verified against plain, unflagged Chromium (Chrome/153, what
 * Playwright bundles here) they're absent — but they're real and callable in
 * Chrome Canary (155.x) with `--enable-experimental-web-platform-features`
 * set, and on the public roadmap for stable Chrome around version 155
 * (~Oct 2026, per chromestatus.com/roadmap — subject to slipping). So this
 * module's job isn't "the only real option" so much as "the one that also
 * works in a browser without the flag." `setHTML` / `setHTMLUnsafe` need no
 * flag at all and were verified here to: (a) apply the built-in default
 * sanitizer when called with no options — same "safe by default" behavior
 * pipe-in documents — and (b) work perfectly on a
 * fully detached element, never inserted into any document. Both matter for
 * gist-in's one-shot "swap a marker for fetched content" use case.
 */

/**
 * Resolves `url` the same way `pipe-in.js`'s own `hydrate()` does: an
 * absolute (`http(s)://`) or same-origin (`/…`) URL is returned unchanged;
 * anything else is tried as a bare specifier via `import.meta.resolve`,
 * falling back to the original string if that fails (a genuine relative
 * path, or a specifier with no import-map entry).
 * @param {string} url
 * @returns {string}
 */
export function resolveUrl(url) {
    if (url.startsWith('http://') || url.startsWith('https://') || url.startsWith('/')) {
        return url;
    }
    try {
        return import.meta.resolve(url);
    } catch {
        return url;
    }
}

/**
 * The same security gate `pipe-in.js`'s own `hydrate()` applies before
 * allowing an unsafe method and/or a custom sanitizer: permitted only when
 * `url` is a same-origin path (starts with `/`) or a bare specifier that
 * {@link resolveUrl} resolves to something *different* via the page's own
 * import map. A literal cross-origin absolute URL never gets either
 * override, no matter what's requested — that's what keeps an
 * attacker-influenced URL from smuggling in unsanitized content.
 *
 * Callers that have their own additional trusted-URL notion (gist-in's
 * `gist://` USL, whose real destination host is always the fixed
 * `gist.githubusercontent.com` CDN rather than anything attacker-steerable)
 * should check that themselves *before* falling back to this — it only knows
 * about the same-origin/import-map cases pipe-in itself recognizes.
 *
 * @param {string} url
 * @param {boolean} wantsOverride - true if an unsafe method and/or a custom sanitizer was requested
 * @returns {boolean} true if the override is permitted (or none was requested)
 */
export function isOverrideTrusted(url, wantsOverride) {
    if (!wantsOverride) return true;
    if (url.startsWith('/')) return true;
    if (url.startsWith('http://') || url.startsWith('https://')) return false;
    return resolveUrl(url) !== url;
}

/**
 * Fetches `url` and returns its (optionally start/end-snipped) text. `url` is
 * resolved via {@link resolveUrl} first, so a bare specifier mapped by the
 * page's import map works here exactly as it does for `import()` itself —
 * `fetch()` has no notion of import maps on its own.
 * @param {string} url
 * @param {{cache?: RequestCache, start?: string, end?: string}} [opts]
 * @returns {Promise<string>}
 */
export async function fetchText(url, opts = {}) {
    const { cache = 'default', start, end } = opts;
    const response = await fetch(resolveUrl(url), { cache });
    if (!response.ok) {
        throw new Error(`Fetch failed: ${response.status} ${response.statusText}`);
    }
    if (!response.body) return '';
    let stream = response.body.pipeThrough(new TextDecoderStream());

    if (start || end) {
        const { snipTransform } = await import('./snip.js');
        stream = stream.pipeThrough(snipTransform(start, end));
    }

    const reader = stream.getReader();
    let text = '';
    while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        text += value;
    }
    return text;
}

/**
 * Writes already-in-hand text (e.g. from `fifteenth`'s `get()`, or from
 * {@link fetchText}) into `target`, sanitized by default.
 * @param {any} target - anything exposing `setHTML`/`setHTMLUnsafe` (an
 *   Element or ShadowRoot)
 * @param {string} text
 * @param {{unsafe?: boolean, sanitizer?: any}} [opts]
 */
export function setInto(target, text, opts = {}) {
    const { unsafe = false, sanitizer } = opts;
    if (unsafe) {
        target.setHTMLUnsafe(text);
    } else if (sanitizer !== undefined) {
        target.setHTML(text, { sanitizer: new Sanitizer(/** @type {any} */ (sanitizer)) });
    } else {
        target.setHTML(text);
    }
}

/**
 * `fetchText` + `setInto` in one call — the common case.
 * @param {string} url
 * @param {any} target
 * @param {{
 *   unsafe?: boolean,
 *   sanitizer?: any,
 *   cache?: RequestCache,
 *   start?: string,
 *   end?: string,
 * }} [opts]
 */
export async function fetchAndSet(url, target, opts = {}) {
    const { unsafe, sanitizer, cache, start, end } = opts;
    const text = await fetchText(url, { cache, start, end });
    setInto(target, text, { unsafe, sanitizer });
}
