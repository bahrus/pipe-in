# pipe-in ( ⇥ )

[![Demo Video](https://img.youtube.com/vi/qq7Bfwm1m_Q/0.jpg)](https://www.youtube.com/watch?v=qq7Bfwm1m_Q)

Attribute-based wrapper around the browser's [partial update support](https://developer.chrome.com/blog/declarative-partial-updates).

Canonical attribute

```html
<article 
    pipe-in=https://link.springer.com/article/10.1007/s00300-003-0563-3 pipe-in-shadowrootmode=open>
    <span slot="AdInsert"><a href="https://www.target.com/b/pedialax/-/N-55lp4">Pedia-Lax</a></span>    
</article>
```

For well controlled environments, for example within a carefully managed custom element registry, where namespace clashes are easy to avoid:  

```html
<article 
    ⇥=https://link.springer.com/article/10.1007/s00300-003-0563-3 ⇥-shadowrootmode=open>
    <span slot="AdInsert"><a href="https://www.target.com/b/pedialax/-/N-55lp4">Pedia-Lax</a></span>    
</article>
```

In what follows, we will refer to the "base".  In the examples above, the base is pipe-in and ⇥ respectively.

## Defaults

As the article linked to above indicates, there are quite a number of choices we can make as far as streaming in content.

The following table indicates the default values and how to override.

|Name|Default|Override|
|----|-------|--------|
|Method|streamHTML|`[base]-method=streamHTML \| streamReplaceWithHTML \| streamBeforeHTML \| streamPrependHTML \| streamAppendHTML \| streamAfterHTML \| streamHTMLUnsafe \| streamReplaceWithHTMLUnsafe \| streamBeforeHTMLUnsafe \| streamPrependHTMLUnsafe \| streamAppendHTMLUnsafe \| streamAfterHTMLUnsafe` |
|Sanitizer|[Default](https://developer.mozilla.org/en-US/docs/Web/API/HTML_Sanitizer_API/Default_sanitizer_configuration)|`[base]-sanitizer='{"elements": ["em", "i", "b", "strong"]}'`|
|Script support|No support|`[base]-run-scripts`|
|Shadow root mode|None|`[base]-shadowrootmode=open \| closed`|
|URL rewriting|Off|`[base]-base`|
|Cache policy|default|`[base]-cache=default \| no-store \| reload \| no-cache \| force-cache \| only-if-cached`|
|Stream sharing|Enabled|`[base]-no-share` (disables sharing)|

Note: The default sanitizer (used by `streamHTML` and other non-`Unsafe` methods) strips elements like `<link>`, `<img>`, `<script>`, and `<style>`. If you need these elements preserved, use one of the `*Unsafe` methods or pass a custom sanitizer configuration.


## Security

Allowing attributes to specify such things as "run scripts", or specifying allowed elements is a potential xss security concern.  Even utilizing unsafe methods must be constrained. To mitigate that risk, these options are only allowed if:

1. The URL is a **same-origin path** (starts with `/`), or
2. The URL is a **bare specifier** with a mapping in an import map

Cross-origin absolute URLs (starting with `http://` or `https://`) are restricted to the default `streamHTML` method with the default sanitizer and no script execution.

```html
<script type=importmap>
{
    "imports": {
        "springer/": "https://link.springer.com/"
    }
}
</script>
<article 
    ⇥=springer/article/10.1007/s00300-003-0563-3 
    ⇥-shadowrootmode=open>
    <span slot="AdInsert"><a href="https://www.target.com/b/pedialax/-/N-55lp4">Pedia-Lax</a></span>    
</article>
```

### Cross-origin constraints

All fetches performed by pipe-in use the standard Fetch API and are therefore subject to CORS. A cross-origin URL will only succeed if the remote server responds with appropriate `Access-Control-Allow-Origin` headers. This means untrusted third-party endpoints cannot be silently injected — the remote must explicitly opt in to being consumed.

For same-origin URLs no additional configuration is needed.

### Content Security Policy

pipe-in respects the page's Content-Security-Policy. In particular:

- **`connect-src`** governs which origins pipe-in may fetch from. If a URL is not permitted by the active CSP, the fetch will be blocked by the browser before any content reaches the page.
- **`script-src`** applies when `[base]-run-scripts` is used. Even if the import-map gate allows script execution, CSP can independently block inline or remote scripts that don't match the policy.
- **`style-src`** applies to any inline styles present in the streamed content.

A recommended baseline policy for pages using pipe-in:

```
Content-Security-Policy: connect-src 'self' https://trusted.example.com; script-src 'self'; style-src 'self' 'unsafe-inline'
```

This layers defense-in-depth on top of the import-map gate: even if an attacker could influence markup attributes, the browser-enforced CSP limits where content can be loaded from and whether scripts can execute.

### CORS proxies for cross-origin content

Many useful HTML sources (documentation sites, CMSs, third-party APIs) don't serve CORS headers. When you control the target server, the fix is to add `Access-Control-Allow-Origin` there. When you don't, a CORS proxy can relay the request and attach the required headers.

**Recommended: Cloudflare Worker (self-hosted)**

A [Cloudflare Worker](https://workers.cloudflare.com/) is the best option for most deployments. The free tier provides 100,000 requests/day, there's no server to manage, latency is low thanks to Cloudflare's edge network, and you maintain full control over allowed origins.

[cloudflare-cors-anywhere](https://github.com/Zibri/cloudflare-cors-anywhere) is a minimal, ready-to-deploy Worker (~30 lines) you can deploy with `wrangler publish`. Usage:

```
https://your-worker.your-subdomain.workers.dev/?https://example.com/content.html
```

You can lock it down by adding an origin allowlist so only your site can call the proxy.

**Alternatives:**

- [cors-anywhere](https://github.com/Rob--W/cors-anywhere) — The original Node.js CORS proxy. Self-host on any Node environment (Heroku, Fly.io, a VPS). More infrastructure to manage, but full flexibility. The public demo at `cors-anywhere.herokuapp.com` is rate-limited and not suitable for production.
- [corsproxy.io](https://corsproxy.io/) — Free hosted service, no setup required. Convenient for prototyping, but you're trusting a third party with your traffic and uptime.

**Usage with pipe-in:**

```html
<script type=importmap>
{
    "imports": {
        "proxied/": "https://your-worker.workers.dev/?"
    }
}
</script>
<article pipe-in="proxied/https://example.com/article.html">
    <p>Loading...</p>
</article>
```

Note: Because the URL above uses a bare specifier mapped through an import map, the security constraints on sanitizer/script overrides are also satisfied.

## URL rewriting

When `[base]-base` is present, pipe-in rewrites relative URLs (`href`, `src`, `action`, `poster`, and `url()` in inline styles) in the streamed HTML to absolute URLs, using the directory of the fetch URL as the base. The URL rewriting module (`rewrite-urls.js`) is only loaded when `[base]-base` is present.

Note: `<base>` elements don't work inside shadow roots per the HTML spec, so pipe-in uses a streaming `TransformStream` to rewrite URLs on the fly as content is piped in. This same approach works for light DOM streaming as well.

```html
<article pipe-in=/demo/partials/sample.html
         pipe-in-base
         pipe-in-method=streamHTMLUnsafe>
    <p>Loading...</p>
</article>
```

Relative links in `sample.html` like `href="styles.css"` and `src="icon.svg"` will be resolved to `/demo/partials/styles.css` and `/demo/partials/icon.svg` respectively.

Typically you'll want `streamHTMLUnsafe` when using `[base]-base`, since the default sanitizer strips elements like `<link>` and `<img>` that are often present in content with relative URLs.

### Combined with shadow DOM

If `[base]-shadowrootmode` and `[base]-base` are both present, pipe-in will:

1. Attach a shadow root with the specified mode
2. Insert a `<div part="content">` as the streaming target
3. Rewrite relative URLs in the streamed HTML to absolute URLs
4. Stream the rewritten content into the div

This gives the consumer a `::part(content)` CSS hook for styling from outside the shadow DOM.

```html
<article pipe-in=/demo/partials/sample.html
         pipe-in-shadowrootmode=open
         pipe-in-base
         pipe-in-method=streamHTMLUnsafe>
    <p>Loading...</p>
</article>
```

## Piping state

pipe-in sets attributes on the enhanced element to indicate the current state of the content fetch. This enables CSS-based loading indicators and accessible feedback.

### Attributes set

| Attribute | Values | Purpose |
|-----------|--------|---------|
| `aria-busy` | `true` (during loading/streaming), removed on complete/error | Standard ARIA attribute for assistive technologies |
| `[base]-state` | `loading` \| `streaming` \| `complete` \| `error` | Fine-grained CSS hook for styling each phase |

### State transitions

1. **`loading`** — Fetch has been initiated, waiting for response
2. **`streaming`** — First chunk received, content is being piped in
3. **`complete`** — All content has been streamed successfully
4. **`error`** — Fetch or streaming failed

### Example CSS

```css
[pipe-in-state="loading"] {
    opacity: 0.5;
}
[pipe-in-state="streaming"] {
    /* content is appearing progressively */
}
[pipe-in-state="complete"] {
    opacity: 1;
}
[pipe-in-state="error"] {
    border: 1px solid red;
}

/* Or using aria-busy for simpler loading/done toggle */
[aria-busy="true"] {
    background: url('spinner.gif') no-repeat center;
}
```

## Support for snipping

When importing a full HTML page or a large fragment, you often only need a specific portion. The `[base]-start` and `[base]-end` attributes let you extract a slice of the streamed content. Both are optional and can be used independently or together:

- **`[base]-start`** — Content before this marker is discarded. The marker itself and everything after it is kept.
- **`[base]-end`** — Content from this marker onward is discarded. Only content before it is kept.

When both are present, only the content between start (inclusive) and end (exclusive) is emitted.

Snipping runs before URL rewriting, so markers match the original source HTML.

```html
<article pipe-in=/demo/partials/sample.html
         pipe-in-shadowrootmode=open
         pipe-in-start="<body"
         pipe-in-end="</body>"
         pipe-in-base
         pipe-in-method=streamHTMLUnsafe>
    <p>Loading...</p>
</article>
```

## Shared streams

By default, pipe-in deduplicates fetches for identical URLs (with matching snip/rewrite parameters). When multiple elements share the same computed storage key, only one performs the actual fetch — others join the in-progress stream or use the cached result.

### How it works

1. The first instance to call `hydrate` registers itself as the source stream in a module-level inflight map
2. While streaming, it broadcasts each chunk to any late-joining subscribers
3. A second instance arriving mid-stream catches up by replaying all accumulated chunks, then receives live chunks going forward
4. After the source stream completes, the accumulated HTML is persisted to `sessionStorage`
5. Any instance arriving after completion reads directly from `sessionStorage` — no network request needed

### Opting out

Add `[base]-no-share` to disable sharing entirely for a given element. It won't register as a source, won't join existing streams, and won't read from `sessionStorage`. Each `no-share` instance always performs its own independent fetch.

```html
<article pipe-in=/content.html pipe-in-no-share>
    <p>Loading...</p>
</article>
```

### Storage key

The deduplication key incorporates the resolved URL plus the transform parameters that affect output:

```
pipe-in:{resolvedUrl}|{start}|{end}|{base}
```

Two elements with the same URL but different snip markers or one with URL rewriting and one without will not share streams — their outputs would differ.

## Custom element template handoff

When pipe-in is used on a custom element (any tag with a dash in its name) that contains a `<script type="precede">` child, pipe-in will automatically coordinate with custom element features like [templ-maker](https://github.com/bahrus/templ-maker) to provide a template for the element's definition.

### How it works

1. Before fetching, pipe-in checks if the enhanced element has a `<script type="precede">` in its light DOM
2. If found, pipe-in accumulates the final transformed HTML (after snipping, URL rewriting, etc.) into a string while streaming
3. After streaming completes, pipe-in creates a `<template>` element, sets its `innerHTML` to the accumulated string, and attaches it to the script element via `Symbol.for('pipe-in:template')`
4. pipe-in then flips the script's `type` from `precede` to `cede`, which triggers [mount-observer](https://github.com/bahrus/mount-observer#custom-element-definition-cede-scripts) to proceed with custom element registration.

### Usage

```html
<hello-world pipe-in=my-package/hello-world.html
             pipe-in-shadowrootmode=open
             pipe-in-base
             pipe-in-method=streamHTMLUnsafe>
    <script type="precede" data-extends="el-maker"></script>
</hello-world>
```

The first `<hello-world>` instance fetches and streams the HTML, then hands the template to templ-maker via the `precede` → `cede` flip. Once the custom element is defined, subsequent instances get their content from the element's own lifecycle — no `pipe-in` attribute needed:

```html
<hello-world></hello-world>
```

### The `precede` protocol

The `type="precede"` convention is a generic coordination mechanism. Any feature that needs to wait for pipe-in to finish streaming before it activates can use this pattern:

- The script sits inert (browsers ignore scripts with unknown types)
- pipe-in attaches a template at `scriptEl[Symbol.for('pipe-in:template')]`
- pipe-in flips `type` to `cede`, triggering whatever mount-observer or mutation-based logic is watching for that type

This keeps coupling at the markup level — pipe-in doesn't import or reference templ-maker, and templ-maker doesn't import pipe-in.

## Events

pipe-in dispatches standard events on the enhanced element:

| Event | When | Bubbles |
|-------|------|---------|
| `load` | Content has been successfully streamed into the DOM | No |
| `error` | Fetch or streaming failed | No |

```js
const article = document.querySelector('article[pipe-in]');
article.addEventListener('load', () => {
    // Content is ready — safe to query the shadow DOM, etc.
});
article.addEventListener('error', () => {
    // Handle failure
});
```

## Viewing Demos Locally

1. Install git
2. Fork/clone this repo
3. Install node.js
4. Open command window to folder where you cloned this repo
5. > git submodule add https://github.com/bahrus/types.git types
6. > git submodule update --init --recursive
7. > npm install
8. > npm run serve
9. Open http://localhost:8000/demo/ in a modern browser

## Running Tests

```
> npm run test
```

