# Coupling With Template Maker Custom Element Feature

---

## Human Ask

The [template-maker](https://github.com/bahrus/templ-maker) custom element feature has code like this:

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
}
```