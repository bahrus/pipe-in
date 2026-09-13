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
 * methods, and verified against a real, current browser (a locally installed
 * Chromium reporting itself as Chrome/153) — they don't exist yet, anywhere.
 * `setHTML` / `setHTMLUnsafe` do, right now, and were verified here to: (a)
 * apply the built-in default sanitizer when called with no options — same
 * "safe by default" behavior pipe-in documents — and (b) work perfectly on a
 * fully detached element, never inserted into any document. Both matter for
 * gist-in's one-shot "swap a marker for fetched content" use case.
 */

/**
 * Fetches `url` and returns its (optionally start/end-snipped) text.
 * @param {string} url
 * @param {{cache?: RequestCache, start?: string, end?: string}} [opts]
 * @returns {Promise<string>}
 */
export async function fetchText(url, opts = {}) {
    const { cache = 'default', start, end } = opts;
    const response = await fetch(url, { cache });
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
