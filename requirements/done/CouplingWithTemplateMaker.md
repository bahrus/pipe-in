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

Instead of the html markup looking like this:

```html
<hello-world>
    <template shadowrootmode=open>
        Hi, there
    </template>
    <script type="cede" data-extends="el-maker"></script>
</hello>

...

<hello-world></hello-world>
```

It should look like this:

```html
<hello-world pipe-in=my-package/hello-world.html>
    <script type="precede" data-extends="el-maker"></script>
</hello>

...

<hello-world></hello-world>
```

So if:

1.  pipe-in adorns a tag with a dash
2.  Its light children has a script tag with type="precede"

Then:

1.  While streaming the content, maintain a string of the entire html download, after making all the other adjustments this package supports, like url reference rewriting, and snipping.
2.  When the stream completes, create a template element and set the innerHTML to that string.
3.  Pass the template into the script element with type="precede" with some key (what key should we use?  A symbol?)
4.  Change the type from precede to cede.


---

## Kiro Response

Good pattern. This cleanly separates concerns: pipe-in handles the fetch/stream/transform pipeline, and templ-maker handles the custom element registration lifecycle. The `precede` → `cede` type flip is a nice coordination primitive — it lets the script sit inert until pipe-in signals "content is ready."

### On the key for passing the template

A `Symbol.for(...)` is the right call. It gives you:

- Cross-module coordination without import coupling (both packages can independently call `Symbol.for('same-string')` and get the same symbol)
- No collision with user-land properties or other features
- Inspectable in devtools (symbols created with `Symbol.for` show their description)

I'd suggest: `Symbol.for('pipe-in:template')` — namespaced to pipe-in since pipe-in is the producer. The script element would then have:

```js
scriptEl[Symbol.for('pipe-in:template')] = template;
```

And templ-maker's `onAssigned` would check for it:

```js
const pipeInTemplate = scriptEl[Symbol.for('pipe-in:template')];
if (pipeInTemplate) {
    // Use it directly instead of scraping the DOM
    ctr[templateSym] = pipeInTemplate;
}
```

### On detecting the `precede` script

Two approaches to consider:

**A. pipe-in detects the script itself (your proposal):**
- After streaming completes, pipe-in queries `enhancedElement.querySelector('script[type="precede"]')`
- Attaches the template, flips type to `cede`
- Pro: self-contained in pipe-in, no external coordination needed
- Con: pipe-in now has awareness of a convention that lives in another package

**B. pipe-in just dispatches `load` and templ-maker reacts:**
- templ-maker listens for `load` on the host element (or uses a MutationObserver on the script type attribute)
- When it fires, templ-maker grabs the shadow root content and builds the template itself
- Pro: pipe-in stays ignorant of templ-maker's existence
- Con: templ-maker would need to know to listen for `load`, and the timing with `onAssigned` could be tricky

I think **option A is better** here because:
1. The `precede` type is a generic coordination protocol — any feature could use it, not just templ-maker
2. pipe-in already has the accumulated string in hand (especially with memoize), so building the template there avoids re-scraping the DOM
3. It keeps the coupling at the markup convention level (`type="precede"`) rather than at the code level

### On the "tag with a dash" check

You mention pipe-in should only do this when the enhanced element has a dash in its tag name (i.e., it's a custom element). That's a clean gate — `enhancedElement.localName.includes('-')`. This means pipe-in on a `<div>` or `<article>` just streams normally without the template handoff.

### Questions to resolve

1. **Multiple `precede` scripts?** Should pipe-in support more than one `<script type="precede">` child? Or is it always exactly one? (I'd assume one, but worth stating.)

2. **Shadow vs light DOM template:** The streamed content goes into a shadow root (when `shadowrootmode` is set). Should the template capture the shadow root content, the light DOM content, or both? I think it should capture whatever was streamed (the shadow content), since that's what subsequent instances need to clone.

3. **Timing with memoize:** When `memoize` is active, the first instance streams and builds the template. Subsequent instances clone from the memoize cache. Should the `precede` → `cede` flip happen for ALL instances, or only the first (seed) instance? I'd say only the first — subsequent `<hello-world>` elements won't even have the `precede` script in their light DOM.

4. **What about the string vs parsed template?** You said "create a template element and set innerHTML to that string." That works, but if we're already streaming into a shadow root, we could alternatively clone the shadow root's content into a template *after* streaming completes (avoiding a double-parse). However, the innerHTML approach is simpler and guarantees the template matches exactly what was streamed (post-transforms). I'd go with innerHTML from the accumulated string.

### Proposed implementation outline (pipe-in side)

```js
// In hydrate(), after stream.pipeTo(writableSink) completes:

// If enhanced element is a custom element and has a precede script, hand off the template
if (enhancedElement.localName.includes('-')) {
    const precedeScript = enhancedElement.querySelector('script[type="precede"]');
    if (precedeScript) {
        const template = document.createElement('template');
        template.innerHTML = accumulatedHtml; // the post-transform string
        precedeScript[Symbol.for('pipe-in:template')] = template;
        precedeScript.setAttribute('type', 'cede');
    }
}
```

This requires accumulating the final HTML string during streaming. We'd add a tee or a small TransformStream that collects chunks into an array and joins them at the end — only when a `precede` script is detected (or unconditionally if memoize is active, since we're already accumulating there).

### Open question back to you

Should the `precede` detection happen eagerly (before the fetch, to decide whether to accumulate the string) or lazily (always accumulate when streaming into a custom element, then check for `precede` after)? The lazy approach is simpler but wastes memory when there's no `precede` script. The eager approach is a single `querySelector` call before fetching — cheap and avoids unnecessary accumulation.

---

## Human Response I

```js
scriptEl[Symbol.for('pipe-in:template')] = template;
```

sounds good.

> 1. **Multiple `precede` scripts?** Should pipe-in support more than one `<script type="precede">` child? Or is it always exactly one? (I'd assume one, but worth stating.)

Just use querySelector to get the first one it finds

> 2. **Shadow vs light DOM template:** The streamed content goes into a shadow root (when `shadowrootmode` is set). Should the template capture the shadow root content, the light DOM content, or both? I think it should capture whatever was streamed (the shadow content), since that's what subsequent instances need to clone.

I think the template should be formed from the strings that get chunked into the DOM, but appending them into a side string while streaming.  It's actually cleaner to generate the template that way, because after it gets added to the ShadowDOM or light children, things could cause the DOM to change (like binding), which complicates the scraping of the template.

>  3. **Timing with memoize:**

Let's retrofit memoize after this functionality is implemented, and figure it out then.

> 4. **What about the string vs parsed template?**

Same thoughts as 2. above.

> Should the `precede` detection happen eagerly (before the fetch, to decide whether to accumulate the string) or lazily (always accumulate when streaming into a custom element, then check for `precede` after)? The lazy approach is simpler but wastes memory when there's no `precede` script. The eager approach is a single `querySelector` call before fetching — cheap and avoids unnecessary accumulation.

Let's go with the eager approach.






