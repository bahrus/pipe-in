# Coupling With Template Maker Custom Element Feature

---

## Human Ask

The [template-maker](https://github.com/bahrus/templ-maker) custom element feature has code like this currently:

```TypeScript
/**
 * Symbol key used to store the template on the custom element constructor.
 */
const templateSym = Symbol.for('templ-maker:template');
...

/**
 * TemplateMaker is a custom element feature that captures the initial DOM
 * fragment from a "seed" element (the first instance defined via a cede script),
 * stores it as a template on the constructor, and provides cloning/appending
 * capabilities to all subsequent instances.
 *
 * @implements {TemplateMakerProps}
 */
class TemplateMaker {
    /**
     * @param {Element} hostElement
     * @param {FeatureSpawnContext} ctx
     * @param {Partial<TemplateMakerProps>} [initVals]
     */
    constructor(hostElement, ctx, initVals) {
        this.#hostRef = new WeakRef(hostElement);
        const ctr = /** @type {any} */ (hostElement.constructor);
        const template = /** @type {HTMLTemplateElement | undefined} */ (ctr[templateSym]);
        if (template) {
            this.#clone = /** @type {DocumentFragment} */ (template.content.cloneNode(true));
            /** @type {any} */ (hostElement).clone = this.#clone;
        }
        ...
    }

    ...

        /**
     * Called once by assignFeatures after the getter is installed on the prototype.
     * Captures the seed element's DOM fragment and stores it as a template on the constructor.
     *
     * @param {Function} ctr - The custom element constructor
     * @param {import('./types/assign-gingerly/types').FeatureConfig} featureConfig
     * @param {string} key - The feature key
     */
    static onAssigned(ctr, featureConfig, key) {
        const seedRef = /** @type {WeakRef<HTMLScriptElement> | undefined} */ (
            /** @type {any} */ (ctr).seedRef
        );
        if (!seedRef) return;
        const scriptEl = seedRef.deref();
        if (!scriptEl) return;

        const parent = scriptEl.parentElement;
        if (!parent) return;

        const template = document.createElement('template');
        /** @type {TemplateSource} */
        let source;

        // Check for shadow root first
        const shadowRoot = parent.shadowRoot;
        if (shadowRoot) {
            source = 'shadow';
            // Clone shadow root contents into the template
            for (const node of Array.from(shadowRoot.childNodes)) {
                template.content.appendChild(node.cloneNode(true));
            }
            // Extract <style adopt> elements into adopted stylesheets
            const styleEls = template.content.querySelectorAll('style[adopt]');
            if (styleEls.length > 0) {
                const sheets = [];
                for (const styleEl of styleEls) {
                    const sheet = new CSSStyleSheet();
                    sheet.replaceSync(styleEl.textContent);
                    sheets.push(sheet);
                    styleEl.remove();
                }
                /** @type {any} */ (ctr)[adoptedSheetsSym] = sheets;
            }
        } else {
            source = 'light';
            // Clone children excluding the seed script element
            for (const node of Array.from(parent.childNodes)) {
                if (node === scriptEl) continue;
                template.content.appendChild(node.cloneNode(true));
            }
        }

        /** @type {any} */ (ctr)[templateSym] = template;
        /** @type {any} */ (ctr)[templateSourceSym] = source;
    }
}
```

I "own" that package so we can make changes to in in coordination with this one.

First we need to resolve a key timing issue:

