//@ts-check

/** @import {EMC} from './types/mount-observer/types' */;
/** @import {AllProps, Actions} from './types/pipe-in/types' */
/** @import {RAConfig} from './types/roundabout/types' */

/**
 * @type {EMC<any, AllProps, Element, RAConfig<AllProps, Actions> >}
 */
export const emc = {
    enhConfig: {
        enhKey: 'BeImporting',
        spawn: 'pipe-in/pipe-in.js',
        withAttrs: {
            base: 'be-importing',
            _base: { mapsTo: 'url', instanceOf: 'String' },
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
            method: 'streamHTMLUnsafe',
            shadowrootmode: 'open',
            injectBase: true,
            runScripts: true,
            start: '<?start',
            end: '<?end>',
            cache: 'default',
        }
    }
};

export function render(){
    return JSON.stringify(emc, null, 4);
}

console.log(render());
