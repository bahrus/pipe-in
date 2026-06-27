# pipe-in ( ⇥ )

Attribute-based wrapper around the browser's [partial update support](https://developer.chrome.com/blog/declarative-partial-updates).

Canonical attribute

```html
<article pipe-in=https://link.springer.com/article/10.1007/s00300-003-0563-3 pipe-in-shadowrootmode=open>
    <span slot="AdInsert"><a href="https://www.target.com/b/pedialax/-/N-55lp4">Pedia-Lax</a></span>    
</article>
```

For well controlled environments, for example within a carefully managed custom element registry, where namespace clashes are easy to avoid:  

```html
<article ⇥=https://link.springer.com/article/10.1007/s00300-003-0563-3 pipe-in-shadowrootmode=open>
    <span slot="AdInsert"><a href="https://www.target.com/b/pedialax/-/N-55lp4">Pedia-Lax</a></span>    
</article>
```

In what follows, we will refer to the "base".  In the examples above, the base is pipe-in and ⇥ respectively.

## Defaults

As the article linked to above indicates, there are quite a number of choices we can make as far as streaming in content.

The following table indicates the default values and how to override.

|Name|Default|Override|
|----|-------|--------|
|Method|StreamHTML|`[base]-method=StreamHTML \| streamReplaceWithHTML \| streamBeforeHTML \| streamPrependHTML \| streamAppendHTML \| streamAfterHTML \| streamHTMLUnsafe \| streamReplaceWithHTMLUnsafe \| streamBeforeHTMLUnsafe \| streamPrependHTMLUnsafe \| streamAppendHTMLUnsafe streamAfterHTMLUnsafe` |
|Sanitizer|[Default](https://developer.mozilla.org/en-US/docs/Web/API/HTML_Sanitizer_API/Default_sanitizer_configuration)|`[base]-sanitizer='{"elements": ["em", "i", "b", "strong"]}'`|
|Script support|No support|[base]-run-scripts}


## Security

Allowing attributes to specify such things as "run scripts", or specifying allowed elements is a potential xss security concern.  Even utilizing unsafe methods must be constrained. To mitigate that risk, these options are only allowed if the url is a "bare specifier" with a mapping to an import map script:

```html
<script type=importmap>
{
    "imports": {
        "spring/": "https://link.springer.com/"
    }
}
</script>
<article ⇥=springer/article/10.1007/s00300-003-0563-3 pipe-in-shadowrootmode=open>
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

## Basing the shadow root

If `[base]-shadowrootmode` and `[base]-base` are both present, pipe-in will:

1. Attach a shadow root with the specified mode
2. Insert a `<base href="...">` element pointing to the provided URL, so relative paths in the streamed HTML (CSS links, images, etc.) resolve correctly against the source origin
3. Insert a `<div part="content">` and stream the fetched content into it

This gives the consumer a `::part(content)` CSS hook for styling from outside the shadow DOM.

```html
<article pipe-in=https://example.com/article.html
         pipe-in-shadowrootmode=open
         pipe-in-base=https://example.com/>
    <p>Loading...</p>
</article>
```

The resulting shadow DOM structure:

```html
#shadow-root (open)
  <base href="https://example.com/">
  <div part="content">
    <!-- streamed content here -->
  </div>
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