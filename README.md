# pipe-in ( | )

Attribute-based wrapper around the browser's [partial update support](https://developer.chrome.com/blog/declarative-partial-updates).

Canonical attribute

```html
<article pipe-in=https://link.springer.com/article/10.1007/s00300-003-0563-3 pipe-in-shadowrootmode=open>
    <span slot="AdInsert"><a href="https://www.target.com/b/pedialax/-/N-55lp4">Pedia-Lax</a></span>    
</article>
```

For well controlled environments, for example within a carefully managed custom element registry, where namespace clashes are easy to avoid:  

```html
<article |=https://link.springer.com/article/10.1007/s00300-003-0563-3 pipe-in-shadowrootmode=open>
    <span slot="AdInsert"><a href="https://www.target.com/b/pedialax/-/N-55lp4">Pedia-Lax</a></span>    
</article>
```

In what follows, we will refer to the "base".  In the examples above, the base is pipe-in and | respectively.

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
<article |=springer/article/10.1007/s00300-003-0563-3 pipe-in-shadowrootmode=open>
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