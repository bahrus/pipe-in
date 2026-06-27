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
|Method|StreamHTML|[base]-method=StreamHTML \| streamReplaceWithHTML \| streamBeforeHTML \| streamPrependHTML \| streamAppendHTML \| streamAfterHTML \| streamHTMLUnsafe \| streamReplaceWithHTMLUnsafe \| streamBeforeHTMLUnsafe \| streamPrependHTMLUnsafe \| streamAppendHTMLUnsafe streamAfterHTMLUnsafe |
|Sanitizer|[Default](https://developer.mozilla.org/en-US/docs/Web/API/HTML_Sanitizer_API/Default_sanitizer_configuration)|[base]-sanitizer|[base]-sanitizer='{"elements": ["em", "i", "b", "strong"]}'|