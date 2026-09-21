// @ts-check
/** @import {Actions, PAP, AllProps, AP} from './types/pipe-in/types' */;
/** @import {RoundaboutOptions} from './types/roundabout/types' */;
/** @import {ElementEnhancementGateway, SpawnContext} from './types/assign-gingerly/types' */;
/** @import {EMC} from './types/mount-observer/types' */;
/** @import {RAConfig} from './types/roundabout/types' */;

/**
 * @typedef {{
 *   chunks: string[],
 *   done: boolean,
 *   listeners: Set<ReadableStreamDefaultController<string>>,
 *   storageKey: string
 * }} InflightEntry
 */

/**
 * Module-level map of in-flight shared streams keyed by storage key.
 * Entries exist only while a stream is actively being fetched/broadcast.
 * @type {Map<string, InflightEntry>}
 */
const inflight = new Map();

/**
 * @implements {Actions}
 */
class PipeIn {

    /**
     * @this {AllProps & Actions}
     * @param {Element & ElementEnhancementGateway} enhancedElement 
     * @param {SpawnContext} ctx 
     * @param {PAP} initVals 
     */
    constructor(enhancedElement, ctx, initVals){
        this.init(this, enhancedElement, ctx, initVals);
    }

    /**
     * @param {AllProps} self 
     * @param {Element & ElementEnhancementGateway} enhancedElement 
     * @param {SpawnContext} ctx 
     * @param {PAP} initVals 
     */
    async init(self, enhancedElement, ctx, initVals){
        const {customData} = /** @type {EMC<any, AllProps, Element, RAConfig<AllProps, Actions>>} */ (ctx.emc);
        /**
         * @type {RoundaboutOptions}
         */
        const raOptions = {
            ...customData,
            vm: self,
            initialPropVals: {
                enhancedElement,
                ...customData?.defaultPropVals,
                ...initVals
            }
        };
        (await import('roundabout-lib/roundabout.js')).roundabout(raOptions);
    }

    /**
     * Fetches HTML from the configured URL and streams it into the enhanced element.
     * @param {AP} self
     * @returns {import('./types/pipe-in/types').ProPAP}
     */
    async hydrate(self){
        const { enhancedElement, url } = self;
        // "Polysketch" support for a <template> target — README, "Polysketch
        // support for a platform proposal" — a different attribute
        // vocabulary (`${base}-for`/`${base}-buffer`, not the platform's own
        // bare `for`/`src`/`buffer`; see emc.mjs for why that matters — it's
        // not just naming, current browsers actively mishandle the literal
        // names) and a different insertion model (target a
        // <?marker>/<?start>…<?end> elsewhere in the document, not "self").
        if(enhancedElement.localName === 'template'){
            return this.#hydrateTemplate(self);
        }

        const { method, sanitizer, runScripts, shadowrootmode, injectBase, start, end, startExclusive, endExclusive, cache, noShare } = self;

        const stateAttr = this.#getStateAttr(enhancedElement);

        // Resolve the URL - check if it's a bare specifier via import map.
        // Shared with gist-in via fetch-and-set.js, so both packages resolve
        // and gate URLs identically.
        const { resolveUrl, isOverrideTrusted } = await import('pipe-in/fetch-and-set.js');
        const resolvedUrl = resolveUrl(url);

        // Validate and resolve the fetch cache policy
        const cachePolicy = this.#resolveCachePolicy(cache);

        // Security gate: runScripts, sanitizer overrides, and unsafe methods
        // require the URL to be either a bare specifier (mapped through import map)
        // or a same-origin URL (absolute path starting with /).
        const isUnsafeMethod = method.includes('Unsafe');
        const wantsOverride = runScripts || sanitizer !== undefined || isUnsafeMethod;
        if (!isOverrideTrusted(url, wantsOverride)) {
            console.warn(
                `[pipe-in] Security: "${method}" with runScripts=${runScripts} ` +
                `requires a bare specifier URL mapped via import map or a same-origin path. ` +
                `URL "${url}" is not permitted.`
            );
            return /** @type {PAP} */ ({resolved: false});
        }

        // Set loading state
        this.#setState(enhancedElement, stateAttr, 'loading');

        // Compute the storage key for sharing and sessionStorage
        const storageKey = `pipe-in:${resolvedUrl}|${start || ''}|${end || ''}|${injectBase ? 'base' : ''}`;

        // Check if we can join an existing shared stream or use sessionStorage
        if (!noShare) {
            const existingEntry = inflight.get(storageKey);
            if (existingEntry) {
                // Another instance is actively streaming — catch up
                return this.#joinStream(existingEntry, self, stateAttr);
            }
            // Check if a completed result exists in sessionStorage
            try {
                const stored = sessionStorage.getItem(storageKey);
                if (stored) {
                    return this.#hydrateFromString(stored, self, stateAttr);
                }
            } catch (e) {
                // sessionStorage unavailable — proceed with fetch
            }
        }

        // Eagerly detect precede script for template handoff
        // (only on custom elements — tags with a dash)
        const precedeScript = enhancedElement.localName.includes('-')
            ? enhancedElement.querySelector('script[type="precede"]')
            : null;

        // Register in the inflight map if sharing is active
        /** @type {InflightEntry | null} */
        let entry = null;
        if (!noShare) {
            entry = {
                chunks: [],
                done: false,
                listeners: new Set(),
                storageKey
            };
            inflight.set(storageKey, entry);
        }

        try {
            // Determine the streaming target
            let target = /** @type {any} */ (enhancedElement);
            if (shadowrootmode) {
                const shadow = enhancedElement.attachShadow({ mode: shadowrootmode });
                target = shadow;
            }

            const response = await fetch(resolvedUrl, { cache: cachePolicy });
            if (!response.ok) {
                throw new Error(`Fetch failed: ${response.status} ${response.statusText}`);
            }

            // Build options for the streaming method
            /** @type {any} */
            const options = {};
            if (sanitizer !== undefined) {
                options.sanitizer = new Sanitizer(/** @type {any} */ (sanitizer));
            }
            if (runScripts) {
                options.runScripts = true;
            }

            // Get the streaming writable sink from the target element
            const streamMethod = /** @type {string} */ (method);
            if (typeof target[streamMethod] !== 'function') {
                throw new Error(`Method "${streamMethod}" is not supported on the target element.`);
            }

            const writableSink = target[streamMethod](options);

            // Accumulated chunks for the precede-only path (when noShare is set)
            /** @type {string[]} */
            const accumulatedChunks = [];

            // Pipe the response body through a text decoder into the writable sink,
            // optionally snipping between start/end markers and rewriting relative URLs
            if (response.body) {
                let stream = response.body.pipeThrough(new TextDecoderStream());

                // Transition to streaming state once first chunk arrives
                let streamingStateSet = false;
                const stateTransform = new TransformStream({
                    transform: (chunk, controller) => {
                        if (!streamingStateSet) {
                            this.#setState(enhancedElement, stateAttr, 'streaming');
                            streamingStateSet = true;
                        }
                        controller.enqueue(chunk);
                    }
                });
                stream = stream.pipeThrough(stateTransform);

                if (start || end) {
                    const {snipTransform} = await import('pipe-in/snip.js');
                    stream = stream.pipeThrough(snipTransform(start, end, { startExclusive, endExclusive }));
                }
                if (injectBase) {
                    // Derive a proper absolute base URL
                    const absolute = resolvedUrl.startsWith('http') 
                        ? resolvedUrl 
                        : location.origin + resolvedUrl;
                    const urlObj = new URL(absolute);
                    // Use directory of the path, fall back to origin root
                    const pathDir = urlObj.pathname.substring(0, urlObj.pathname.lastIndexOf('/') + 1);
                    const baseHref = urlObj.origin + pathDir;
                    const {rewriteUrlsTransform} = await import('pipe-in/rewrite-urls.js');
                    stream = stream.pipeThrough(rewriteUrlsTransform(baseHref));
                }

                // Broadcaster transform: accumulates chunks and broadcasts to listeners
                // Active when sharing is enabled OR a precede script needs the string
                if (entry || precedeScript) {
                    const e = entry;
                    const broadcasterTransform = new TransformStream({
                        transform(chunk, controller) {
                            accumulatedChunks.push(chunk);
                            if (e) {
                                e.chunks.push(chunk);
                                for (const listener of e.listeners) {
                                    listener.enqueue(chunk);
                                }
                            }
                            controller.enqueue(chunk);
                        },
                        flush() {
                            if (e) {
                                e.done = true;
                                for (const listener of e.listeners) {
                                    listener.close();
                                }
                            }
                        }
                    });
                    stream = stream.pipeThrough(broadcasterTransform);
                }

                await stream.pipeTo(writableSink);
            }

            // Finalize sharing: persist to sessionStorage and clean up inflight entry
            if (entry) {
                const html = entry.chunks.join('');
                inflight.delete(storageKey);

                try {
                    sessionStorage.setItem(storageKey, html);
                } catch (e) {
                    // sessionStorage unavailable — content was already streamed
                    console.warn('[pipe-in] sessionStorage unavailable for shared stream persistence.');
                }

                // Hand off lazy template getter to precede script
                if (precedeScript) {
                    this.#attachLazyTemplate(precedeScript, storageKey, html);
                }
            } else if (precedeScript) {
                // No sharing (noShare set) but precede script needs the template
                const html = accumulatedChunks.join('');
                this.#attachLazyTemplate(precedeScript, storageKey, html);
            }

            // Set complete state and dispatch load event
            this.#setState(enhancedElement, stateAttr, 'complete');
            enhancedElement.dispatchEvent(new Event('load'));

            return /** @type {PAP} */ ({resolved: true});
        } catch (e) {
            console.error(`[pipe-in] Error streaming content from "${url}":`, e);

            // Clean up inflight entry on error
            if (entry) {
                entry.done = true;
                for (const listener of entry.listeners) {
                    listener.close();
                }
                inflight.delete(storageKey);
            }

            // Set error state and dispatch error event
            this.#setState(enhancedElement, stateAttr, 'error');
            enhancedElement.dispatchEvent(new Event('error'));
            return /** @type {PAP} */ ({resolved: false});
        }
    }

    /**
     * The `<template pipe-in="…url…" pipe-in-for="…" pipe-in-buffer
     * pipe-in-method="streamHTMLUnsafe">` "polysketch" path — README,
     * "Polysketch support for a platform proposal". Deliberately namespaced,
     * *not* the platform's own bare `for`/`src`/`buffer`/`sanitize` — see
     * emc.mjs for why (current Chromium, unflagged, already silently
     * mishandles the literal `for`+`src` pair). `pipe-in`/`⇥`'s own value is
     * still the URL here, exactly as everywhere else in this file; `method`
     * is the same prop the classic path uses, reused for its safety axis only
     * (`.includes('Unsafe')`) — position values (before/after/append/…)
     * don't apply to a marker/range target and are ignored.
     *
     * `pipe-in-for` names a `<?marker name="…">` or a `<?start name="…">`…
     * `<?end>` pair to patch — searched via `enhancedElement.getRootNode()`,
     * no hint attribute yet (a full walk every time; fine for a first cut).
     * Omitted or unmatched: warns and does nothing.
     *
     * `pipe-in-buffer` present → fetch fully, sanitize into a detached
     * scratch element, splice the resulting *bare* nodes in — no wrapper, so
     * this works regardless of the target's HTML content model (table rows
     * into a `<tbody>`, `<option>`s into a `<select>`, …). This is
     * `fetch-and-set.js` verbatim, the same one-shot path `gist-in` uses.
     *
     * `pipe-in-buffer` absent (default) → real, live streaming via
     * `streamHTML`/`streamHTMLUnsafe` — but those are instance methods on a
     * concrete element, and a `<?marker>`/`<?start>`/`<?end>` PI has no
     * content sink of its own to call them on. So this inserts a plain
     * `<div>` *wrapper* at the target first, then streams into that. Real,
     * live streaming, using only APIs that exist today — but it only works
     * for content whose parent context tolerates an extra wrapper `<div>`.
     * Content with a strict content model (table rows, `<option>`s, …) will
     * get foster-parented right back out of a generic wrapper — for that,
     * use `pipe-in-buffer` instead, which needs no wrapper at all. Needs a
     * browser where `streamHTML`/`streamHTMLUnsafe` are real (Canary +
     * `--enable-experimental-web-platform-features` today); throws a clear
     * error naming `pipe-in-buffer` as the fallback everywhere else, same as
     * `pipe-in`'s existing self-streaming path already did before this.
     *
     * @param {AP} self
     * @returns {import('./types/pipe-in/types').ProPAP}
     */
    async #hydrateTemplate(self){
        const { enhancedElement, url, forName, buffer, method } = /** @type {any} */ (self);
        const wantsUnsafe = typeof method === 'string' && method.includes('Unsafe');

        const { resolveUrl, isOverrideTrusted, fetchText, setInto } = await import('pipe-in/fetch-and-set.js');

        // Same trust rule as pipe-in's own self-streaming path (same-origin
        // path, or a bare specifier mapped via the page's import map) — no
        // separate allowlist for this mode; a deliberate scope decision (see
        // the README's polysketch "out of scope" list).
        if(!isOverrideTrusted(url, wantsUnsafe)){
            console.warn(
                `[pipe-in] Security: an *Unsafe pipe-in-method requires a same-origin path ` +
                `or an import-map-mapped bare specifier. URL "${url}" is not permitted.`
            );
            return /** @type {PAP} */ ({resolved: false});
        }

        const root = /** @type {Document | ShadowRoot} */ (enhancedElement.getRootNode());
        const target = this.#findPatchTarget(root, forName);
        if(!target){
            console.warn(
                `[pipe-in] pipe-in-for="${forName || ''}" — no matching <?marker name="${forName}"> ` +
                `or <?start name="${forName}">…<?end> pair found.`
            );
            return /** @type {PAP} */ ({resolved: false});
        }

        try {
            if(buffer){
                const text = await fetchText(url);
                const scratch = document.createElement('div');
                setInto(scratch, text, { unsafe: wantsUnsafe });
                this.#applyPatch(target, Array.from(scratch.childNodes));
            } else {
                const wrapper = document.createElement('div');
                this.#applyPatch(target, [wrapper]);
                const streamMethod = wantsUnsafe ? 'streamHTMLUnsafe' : 'streamHTML';
                if(typeof /** @type {any} */ (wrapper)[streamMethod] !== 'function'){
                    throw new Error(
                        `Method "${streamMethod}" is not supported on the target — this browser doesn't ` +
                        `yet implement native HTML streaming; add the "pipe-in-buffer" attribute for a ` +
                        `one-shot fallback that works today.`
                    );
                }
                const resolvedUrl = resolveUrl(url);
                const response = await fetch(resolvedUrl);
                if(!response.ok) throw new Error(`Fetch failed: ${response.status} ${response.statusText}`);
                const writableSink = /** @type {any} */ (wrapper)[streamMethod]();
                if(response.body){
                    await response.body.pipeThrough(new TextDecoderStream()).pipeTo(writableSink);
                }
            }
        } catch(e) {
            console.error(`[pipe-in] Error patching content from "${url}":`, e);
            return /** @type {PAP} */ ({resolved: false});
        }

        enhancedElement.remove();
        enhancedElement.dispatchEvent(new Event('load'));
        return /** @type {PAP} */ ({resolved: true});
    }

    /**
     * @typedef {{type: 'marker', node: ProcessingInstruction} | {type: 'range', start: ProcessingInstruction, end: ProcessingInstruction}} PatchTarget
     */

    /**
     * Walks `root` for a `<?marker name="name">` (point insertion) or a
     * `<?start name="name">`…`<?end>` pair (range replacement) — the
     * platform's own PI vocabulary (`<?end>` itself carries no name; the
     * first `<?end>` following a matched `<?start>` closes it). `null` if
     * neither is found.
     * @param {Document | ShadowRoot} root
     * @param {string} name
     * @returns {PatchTarget | null}
     */
    #findPatchTarget(root, name){
        if(!name) return null;
        const walker = document.createTreeWalker(root, NodeFilter.SHOW_PROCESSING_INSTRUCTION);
        /** @type {ProcessingInstruction | null} */
        let node;
        /** @type {ProcessingInstruction | null} */
        let startNode = null;
        while((node = /** @type {ProcessingInstruction | null} */ (walker.nextNode()))){
            if(node.target === 'marker'){
                const m = /^name=(["'])(.*?)\1\s*$/.exec(node.data.trim());
                if(m && m[2] === name) return { type: 'marker', node };
            } else if(node.target === 'start'){
                const m = /^name=(["'])(.*?)\1\s*$/.exec(node.data.trim());
                if(m && m[2] === name) startNode = node;
            } else if(node.target === 'end' && startNode){
                return { type: 'range', start: startNode, end: node };
            }
        }
        return null;
    }

    /**
     * Replaces a marker with `nodes`, or clears everything currently between
     * a range's `start`/`end` and inserts `nodes` before `end`.
     * @param {PatchTarget} target
     * @param {Node[]} nodes
     */
    #applyPatch(target, nodes){
        if(target.type === 'marker'){
            target.node.replaceWith(...nodes);
            return;
        }
        let n = target.start.nextSibling;
        while(n && n !== target.end){
            const next = n.nextSibling;
            n.remove();
            n = next;
        }
        target.end.before(...nodes);
    }

    /**
     * Joins an in-flight shared stream by catching up with accumulated chunks
     * and subscribing to future chunks.
     * @param {InflightEntry} entry
     * @param {AP} self
     * @param {string} stateAttr
     * @returns {import('./types/pipe-in/types').ProPAP}
     */
    async #joinStream(entry, self, stateAttr) {
        const { enhancedElement, method, sanitizer, runScripts, shadowrootmode } = self;

        try {
            // Determine the streaming target
            let target = /** @type {any} */ (enhancedElement);
            if (shadowrootmode) {
                const shadow = enhancedElement.attachShadow({ mode: shadowrootmode });
                target = shadow;
            }

            // Build options for the streaming method
            /** @type {any} */
            const options = {};
            if (sanitizer !== undefined) {
                options.sanitizer = new Sanitizer(/** @type {any} */ (sanitizer));
            }
            if (runScripts) {
                options.runScripts = true;
            }

            // Get the streaming writable sink from the target element
            const streamMethod = /** @type {string} */ (method);
            if (typeof target[streamMethod] !== 'function') {
                throw new Error(`Method "${streamMethod}" is not supported on the target element.`);
            }

            const writableSink = target[streamMethod](options);

            // Dynamically load catch-up stream factory
            const { createCatchUpStream } = await import('pipe-in/catch-up.js');
            const stream = createCatchUpStream(entry);

            this.#setState(enhancedElement, stateAttr, 'streaming');

            await stream.pipeTo(writableSink);

            this.#setState(enhancedElement, stateAttr, 'complete');
            enhancedElement.dispatchEvent(new Event('load'));

            return /** @type {PAP} */ ({resolved: true});
        } catch (e) {
            console.error(`[pipe-in] Error joining shared stream:`, e);
            this.#setState(enhancedElement, stateAttr, 'error');
            enhancedElement.dispatchEvent(new Event('error'));
            return /** @type {PAP} */ ({resolved: false});
        }
    }

    /**
     * Hydrates an element from a pre-existing HTML string (from sessionStorage).
     * @param {string} html
     * @param {AP} self
     * @param {string} stateAttr
     * @returns {import('./types/pipe-in/types').ProPAP}
     */
    async #hydrateFromString(html, self, stateAttr) {
        const { enhancedElement, method, sanitizer, runScripts, shadowrootmode } = self;

        try {
            // Determine the streaming target
            let target = /** @type {any} */ (enhancedElement);
            if (shadowrootmode) {
                const shadow = enhancedElement.attachShadow({ mode: shadowrootmode });
                target = shadow;
            }

            // Build options for the streaming method
            /** @type {any} */
            const options = {};
            if (sanitizer !== undefined) {
                options.sanitizer = new Sanitizer(/** @type {any} */ (sanitizer));
            }
            if (runScripts) {
                options.runScripts = true;
            }

            // Get the streaming writable sink from the target element
            const streamMethod = /** @type {string} */ (method);
            if (typeof target[streamMethod] !== 'function') {
                throw new Error(`Method "${streamMethod}" is not supported on the target element.`);
            }

            const writableSink = target[streamMethod](options);

            // Create a simple ReadableStream from the string and pipe it
            const readableStream = new ReadableStream({
                start(controller) {
                    controller.enqueue(html);
                    controller.close();
                }
            });

            this.#setState(enhancedElement, stateAttr, 'streaming');
            await readableStream.pipeTo(writableSink);

            this.#setState(enhancedElement, stateAttr, 'complete');
            enhancedElement.dispatchEvent(new Event('load'));

            return /** @type {PAP} */ ({resolved: true});
        } catch (e) {
            console.error(`[pipe-in] Error hydrating from cached string:`, e);
            this.#setState(enhancedElement, stateAttr, 'error');
            enhancedElement.dispatchEvent(new Event('error'));
            return /** @type {PAP} */ ({resolved: false});
        }
    }

    /**
     * Attaches a lazy template getter to a precede script element
     * and flips its type to 'cede'.
     * @param {Element} precedeScript
     * @param {string} storageKey
     * @param {string} html
     */
    #attachLazyTemplate(precedeScript, storageKey, html) {
        /** @type {string | null} */
        let fallbackHtml = null;
        try {
            // Ensure it's in sessionStorage (may already be there from sharing path)
            if (!sessionStorage.getItem(storageKey)) {
                sessionStorage.setItem(storageKey, html);
            }
        } catch (e) {
            console.warn('[pipe-in] sessionStorage unavailable, using in-memory template.');
            fallbackHtml = html;
        }

        /** @type {HTMLTemplateElement | null} */
        let cachedTemplate = null;
        Object.defineProperty(precedeScript, Symbol.for('pipe-in:template'), {
            get() {
                if (cachedTemplate) return cachedTemplate;
                const stored = fallbackHtml ?? sessionStorage.getItem(storageKey) ?? '';
                cachedTemplate = document.createElement('template');
                cachedTemplate.innerHTML = stored;
                return cachedTemplate;
            },
            configurable: true
        });

        precedeScript.setAttribute('type', 'cede');
    }

    /**
     * Determines the state attribute name based on which base attribute is present.
     * Checks for the known base prefixes ('pipe-in' and '⇥') on the element.
     * @param {Element} el
     * @returns {string}
     */
    #getStateAttr(el) {
        if (el.hasAttribute('⇥')) return '⇥-state';
        return 'pipe-in-state';
    }

    /**
     * Sets the piping state on the enhanced element via both aria-busy 
     * and a custom state attribute for CSS targeting.
     * @param {Element} el
     * @param {string} stateAttr
     * @param {'loading' | 'streaming' | 'complete' | 'error'} state
     */
    #setState(el, stateAttr, state) {
        el.setAttribute(stateAttr, state);
        if (state === 'loading' || state === 'streaming') {
            el.setAttribute('aria-busy', 'true');
        } else {
            el.removeAttribute('aria-busy');
        }
    }

    /**
     * Validates and resolves the fetch cache policy.
     * @param {string} [value]
     * @returns {RequestCache}
     */
    #resolveCachePolicy(value) {
        if (!value) return 'default';
        const valid = ['default', 'no-store', 'reload', 'no-cache', 'force-cache', 'only-if-cached'];
        if (valid.includes(value)) return /** @type {RequestCache} */ (value);
        console.warn(`[pipe-in] Invalid cache policy "${value}". Using "default".`);
        return 'default';
    }
}

export { PipeIn, inflight };
