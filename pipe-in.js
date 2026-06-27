// @ts-check
/** @import {Actions, PAP, AllProps, AP} from './types/pipe-in/types' */;
/** @import {RoundaboutOptions} from './types/roundabout/types' */;
/** @import {ElementEnhancementGateway, SpawnContext} from './types/assign-gingerly/types' */;
/** @import {EMC} from './types/mount-observer/types' */;
/** @import {RAConfig} from './types/roundabout/types' */;

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
        const { enhancedElement, url, method, sanitizer, runScripts, shadowrootmode, injectBase, start, end } = self;

        const stateAttr = this.#getStateAttr(enhancedElement);

        // Resolve the URL - check if it's a bare specifier via import map
        const resolvedUrl = this.#resolveUrl(url);
        const isBareSpecifier = resolvedUrl !== url;

        // Security gate: runScripts, sanitizer overrides, and unsafe methods
        // require the URL to be either a bare specifier (mapped through import map)
        // or a same-origin URL (absolute path starting with /)
        const isUnsafeMethod = method.includes('Unsafe');
        const isSameOrigin = url.startsWith('/');
        if (!isBareSpecifier && !isSameOrigin && (runScripts || sanitizer !== undefined || isUnsafeMethod)) {
            console.warn(
                `[pipe-in] Security: "${method}" with runScripts=${runScripts} ` +
                `requires a bare specifier URL mapped via import map or a same-origin path. ` +
                `URL "${url}" is not permitted.`
            );
            return /** @type {PAP} */ ({resolved: false});
        }

        // Set loading state
        this.#setState(enhancedElement, stateAttr, 'loading');

        try {
            // Determine the streaming target
            let target = /** @type {any} */ (enhancedElement);
            if (shadowrootmode) {
                const shadow = enhancedElement.attachShadow({ mode: shadowrootmode });
                if (injectBase) {
                    const contentDiv = document.createElement('div');
                    contentDiv.setAttribute('part', 'content');
                    shadow.appendChild(contentDiv);
                    target = contentDiv;
                } else {
                    target = shadow;
                }
            }

            const response = await fetch(resolvedUrl);
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
                    stream = stream.pipeThrough(snipTransform(start, end));
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
                await stream.pipeTo(writableSink);
            }

            // Set complete state
            this.#setState(enhancedElement, stateAttr, 'complete');

            return /** @type {PAP} */ ({resolved: true});
        } catch (e) {
            console.error(`[pipe-in] Error streaming content from "${url}":`, e);
            // Set error state
            this.#setState(enhancedElement, stateAttr, 'error');
            return /** @type {PAP} */ ({resolved: false});
        }
    }

    /**
     * Resolves a URL, checking if it's a bare specifier by attempting
     * import.meta.resolve. If resolution changes the URL, it's a bare specifier.
     * @param {string} url
     * @returns {string}
     */
    #resolveUrl(url) {
        // If it's already an absolute URL, return as-is
        if (url.startsWith('http://') || url.startsWith('https://') || url.startsWith('/')) {
            return url;
        }
        // Try to resolve via import map
        try {
            const resolved = import.meta.resolve(url);
            return resolved;
        } catch {
            // If resolution fails, return original URL (relative path)
            return url;
        }
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
}

export { PipeIn };
