# be-importing

---

## Human Ask

The pipe-in enhancement supports quite a few settings, and errs on the side of safety when it comes to security.

However, there are some scenarios where the settings will tend to follow a common pattern, so that it would be beneficial to provide a "short cut" for them.  Some of them already have package names I've previously registered in npm that handles specific scenarios.  I may update those packages to inherit from pipe-in.js with some of the artifacts that this requirement results in, just for completeness.  But importing a whole other package, including another import map entry just for these shortcuts seems a little overly complex.

Perhaps with time, we will see opportunities for those packages to need to override the behavior of pipe-in, in which case those packages will re-emerge in importance.

## Scenario 1:  Custom Element Definition Shortcut - be-importing ( 📥 )

This is what [be-importing](https://github.com/bahrus/be-importing) covers.

```html
<xtal-side-nav enh-be-importing=xtal-side-nav/xtal-side-nav.html>
    <section style='color:white'>
        <div>Menu Item 1</div>
        <div>Menu Item 2</div>
    </section>
</xtal-side-nav>
```

The settings that be-importing ( 📥 ) should assume:

1.  ShadowRootMode = open
2.  injectBase = true
3.  method = streamHTMLUnsafe
4.  pipe-in-start = <?start
5.  pipe-in-end = <?end>
6.  runScripts = true
7.  cache = default

Because many of these settings are boolean, I don't think they can be turned off when using attribute be-importing / 📥 .


---

## Kiro Response

This is a clean shortcut pattern. The EMC config system already supports this perfectly — it's just a second EMC with different `defaultPropVals` and a different `base`/`enhKey`. No inheritance or code duplication needed.

### Implementation approach

A `be-importing.json` (and companion `📥.json`) EMC config would point to the *same* `pipe-in/pipe-in.js` spawn module but with locked-in defaults:

```json
{
    "enhConfig": {
        "enhKey": "BeImporting",
        "spawn": "pipe-in/pipe-in.js",
        "withAttrs": {
            "base": "be-importing",
            "_base": { "mapsTo": "url", "instanceOf": "String" }
        }
    },
    "customData": {
        "weakRef": { "properties": ["enhancedElement"] },
        "actions": {
            "hydrate": { "ifAllOf": ["url", "enhancedElement"] }
        },
        "defaultPropVals": {
            "method": "streamHTMLUnsafe",
            "shadowrootmode": "open",
            "injectBase": true,
            "runScripts": true,
            "start": "<?start",
            "end": "<?end>",
            "cache": "default"
        }
    }
}
```

The key differences from the base pipe-in EMC:

1. **No `withAttrs` for the override settings** — they're baked into `defaultPropVals` and not exposed as attributes. This makes them non-overridable from markup (as you want).
2. **Same `spawn` module** — no code duplication. The PipeIn class doesn't care how it got its props.
3. **Different `base`** — so `be-importing=xtal-side-nav/xtal-side-nav.html` maps to `url`.

### On the snip markers `<?start` / `<?end>`

These are interesting — they look like XML processing instructions. A few notes:

- `<?start` doesn't include the closing `>`, which means the snip will include the `<?start` marker itself plus whatever follows until the next `>` (or beyond, since the snip is just a string match, not tag-aware). Is that intentional? The content between `<?start...>` and `<?end>` would be the template body.
- This is a nice convention for the HTML file to self-delineate its template region, e.g.:

```html
<!-- head content, meta, etc. -->
<?start>
<div>The actual template content</div>
<?end>
<!-- other stuff -->
```

- Since `<?...>` is treated as a comment by the HTML parser, it won't appear in the rendered DOM even if snipping doesn't fire. Good choice.

### On the attribute naming: `enh-be-importing` vs `be-importing`

In your example you used `enh-be-importing`. I assume that's the mount-observer/be-hive convention for enhancement attributes. The EMC base would just be `be-importing`, and be-hive prefixes it with `enh-` in the attribute? Or is the `base` literally `enh-be-importing`? Just want to confirm so the config is correct.

### What about the `precede` script?

Given that be-importing's use case is custom element definition, should the presence of `be-importing` on a custom element *imply* the precede handoff behavior? Currently, pipe-in checks for `<script type="precede">` in the light DOM. With be-importing, the user would still need to include that script tag:

```html
<xtal-side-nav be-importing=xtal-side-nav/xtal-side-nav.html>
    <script type="precede" data-extends="el-maker"></script>
    <section style='color:white'>...</section>
</xtal-side-nav>
```

That seems right — the precede script carries the `data-extends` metadata that tells templ-maker which base class to use. Separating that from the fetch config keeps concerns clean. But I wanted to confirm: is this how you envision it, or should be-importing somehow auto-inject the precede script?

### On future additional shortcuts

The pattern scales well. If you later want a `be-embedding` shortcut (for, say, a safe iframe-like inclusion without scripts), it's just another EMC JSON with different defaults. Same spawn module, different preset. No new packages needed unless behavior divergence warrants it.

### Ready to implement?

This is straightforward — just two JSON files (`be-importing.json` and `📥.json`) and corresponding `.mjs` generators. Want me to proceed, or are there adjustments to the defaults or naming first?

---

## Human Response I

> Implementation Approach

Please continue to use *.mjs files to generate the *.json and add more clauses to the package.json's npm build command.

> On the attribute naming: `enh-be-importing` vs `be-importing`

"base" is indeed just be-importing.  You're guessing is correct.  assign-gingerly/mount-observer will insist on the extra enh- which is discovered automatically.

> What about the `precede` script

Good catch.  Yes, our documentation in the README.md should show cede script.  What I put up above was based on copying and pasting an old approach.


