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
        const { enhancedElement, url, method, sanitizer, runScripts, shadowrootmode } = self;

        // Resolve the URL - check if it's a bare specifier via import map
        const resolvedUrl = this.#resolveUrl(url);
        const isBareSpecifier = resolvedUrl !== url;

        // Security gate: runScripts, sanitizer overrides, and unsafe methods
        // require the URL to be a bare specifier mapped through an import map
        const isUnsafeMethod = method.includes('Unsafe');
        if (!isBareSpecifier && (runScripts || sanitizer !== undefined || isUnsafeMethod)) {
            console.warn(
                `[pipe-in] Security: "${method}" with runScripts=${runScripts} ` +
                `requires a bare specifier URL mapped via import map. ` +
                `URL "${url}" is not a bare specifier.`
            );
            return /** @type {PAP} */ ({resolved: false});
        }

        try {
            // If shadowrootmode is specified, attach a shadow root first
            let target = /** @type {Element} */ (enhancedElement);
            if (shadowrootmode) {
                const shadow = enhancedElement.attachShadow({ mode: shadowrootmode });
                target = /** @type {any} */ (shadow);
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
            if (typeof /** @type {any} */ (target)[streamMethod] !== 'function') {
                throw new Error(`Method "${streamMethod}" is not supported on the target element.`);
            }

            const writableSink = /** @type {any} */ (target)[streamMethod](options);

            // Pipe the response body through a text decoder into the writable sink
            if (response.body) {
                await response.body
                    .pipeThrough(new TextDecoderStream())
                    .pipeTo(writableSink);
            }

            return /** @type {PAP} */ ({resolved: true});
        } catch (e) {
            console.error(`[pipe-in] Error streaming content from "${url}":`, e);
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
}

export { PipeIn };
