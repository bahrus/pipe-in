# Lazy Parsing / Lower Memory Footprint

---

## Human Ask

The coupling with template maker has the following step:

```JavaScript
if (precedeScript) {
    const template = document.createElement('template');
    template.innerHTML = accumulatedChunks.join('');
    /** @type {any} */ (precedeScript)[Symbol.for('pipe-in:template')] = template;
    precedeScript.setAttribute('type', 'cede');
}
```

The (admittedly minor) problem is that this is parsing a potentially large string and storing it in RAM, based on the possibility that another instance of the custom element will appear that makes use of the template.  But that isn't at all guaranteed, and even if it does, it might not appear until much later in the application.  

I would like to instead propose either:

1.  Store the joined string in sessionStorage.
2.  Add a readonly lazy getter property to the precede script, with the same symbol key.  The getter would check if it has already parsed the template, and if so, return that.  If not, it would retrieve the string from session storage, parse it, and replace the lazy property with the template (or store it in a private variable and return the private variable template)

Or:

1.  Store the accumulatedChunks in indexedDB.
2.  Same as 2 above, but make the lazy getter return a promise to get the template. 