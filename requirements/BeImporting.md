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

