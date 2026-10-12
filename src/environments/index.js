// Environment registry. Each environment is an A-Frame component plus a layout
// telling the app where the screen and the viewer's seat are.

import { passthroughLayout } from './passthrough/passthrough.js';
import { theaterLayout } from './theater/theater.js';
import { voidLayout } from './void/void.js';

/**
 * @typedef {object} EnvironmentLayout
 * @property {{ position: {x: number, y: number, z: number}, maxWidth: number, maxHeight: number }} screen
 * @property {{ x: number, y: number, z: number }} seat Rig (floor) position of the viewer.
 * @property {boolean} [ar] Needs an immersive-ar session (passthrough).
 */

/** @type {Record<string, { name: string, component: string, layout: EnvironmentLayout }>} */
export const environments = {
	theater: { name: 'Movie theatre', component: 'theater-environment', layout: theaterLayout },
	void: { name: 'Dark void', component: 'void-environment', layout: voidLayout },
	passthrough: { name: 'Passthrough', component: 'passthrough-environment', layout: passthroughLayout },
};

export const DEFAULT_ENVIRONMENT = 'theater';
