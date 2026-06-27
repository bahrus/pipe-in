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
