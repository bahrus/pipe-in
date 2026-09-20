//@ts-check

/** @import {EMC} from './types/mount-observer/types' */;
/** @import {AllProps, Actions} from './types/pipe-in/types' */
/** @import {RAConfig} from './types/roundabout/types' */

/**
 * @type {EMC<any, AllProps, Element, RAConfig<AllProps, Actions> >}
 */
export const emc = {
    enhConfig: {
        enhKey: 'PipeIn',
        spawn: 'pipe-in/pipe-in.js',
        withAttrs: {
            base: 'pipe-in',
            _base: { mapsTo: 'url', instanceOf: 'String' },
            method: '${base}-method',
            sanitizer: '${base}-sanitizer',
            _sanitizer: { instanceOf: 'Object' },
            runScripts: '${base}-run-scripts',
            _runScripts: { instanceOf: 'Boolean' },
            shadowrootmode: '${base}-shadowrootmode',
            injectBase: '${base}-base',
            _injectBase: { instanceOf: 'Boolean' },
            start: '${base}-start',
            end: '${base}-end',
            cache: '${base}-cache',
            noShare: '${base}-no-share',
            _noShare: { instanceOf: 'Boolean' },
            // "Polysketch" support for a <template> target — see README,
            // "Polysketch support for a platform proposal". Deliberately
            // namespaced (`${base}-for`, `${base}-buffer`), NOT the literal
            // `for`/`src`/`buffer`/`sanitize` names the real platform
            // proposal uses. Two independent reasons:
            //  1. Every non-underscore withAttrs key also becomes part of the
            //     element-*discovery* CSS query (assign-gingerly's
            //     buildCSSQuery ORs together `[key]` for every key) — a bare
            //     `src`/`for` would make *any* element carrying those very
            //     common attribute names spawn this enhancement (verified:
            //     matched an unrelated `<script src=…>` be-hive loader tag).
            //  2. Far more seriously: verified live that current Chromium —
            //     *unflagged*, no experimental features needed — already
            //     natively engages a `<template for="x" src="y">` whose
            //     `for` matches a real `<?marker>`/`<?start>` on the page: it
            //     silently *removes the template* at parse time, before any
            //     script (including this one) can react — and, without the
            //     flag, never actually delivers the fetched content, a
            //     silent content-loss bug. A JS enhancement keyed on the
            //     literal `for`+`src` pair can never win that race in any
            //     current browser. Namespaced names are invisible to that
            //     native mechanism entirely.
            forName: '${base}-for',
            buffer: '${base}-buffer',
            _buffer: { instanceOf: 'Boolean' },
        }
    },
    customData: {
        weakRef: {
            properties: ['enhancedElement']
        },
        actions: {
            hydrate: {
                ifAllOf: ['url', 'enhancedElement']
            }
        },
        defaultPropVals: {
            method: 'streamHTML',
            runScripts: false,
        }
    }
};

export function render(){
    return JSON.stringify(emc, null, 4);
}

console.log(render());
