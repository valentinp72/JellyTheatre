// Environment registry. Each environment is an A-Frame component plus a layout
// telling the app where the screen and the viewer's seat are.

import { theaterLayout } from './theater/theater.js';

/**
 * @typedef {object} EnvironmentLayout
 * @property {{ position: {x: number, y: number, z: number}, maxWidth: number, maxHeight: number }} screen
 * @property {{ x: number, y: number, z: number }} seat Rig (floor) position of the viewer.
 */

/** @type {Record<string, { name: string, component: string, layout: EnvironmentLayout }>} */
export const environments = {
	theater: { name: 'Movie theatre', component: 'theater-environment', layout: theaterLayout },
};

export const DEFAULT_ENVIRONMENT = 'theater';
