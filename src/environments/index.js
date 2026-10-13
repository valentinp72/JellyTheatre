// Environment registry. Each environment is an A-Frame component (declared
// with the kit's defineEnvironment) plus a layout telling the app where the
// screen and the viewer's seat are, and a description for the picker.

import { cabinLayout } from './cabin/cabin.js';
import { homeLayout } from './home/home.js';
import { passthroughLayout } from './passthrough/passthrough.js';
import { stationLayout } from './station/station.js';
import { theaterLayout } from './theater/theater.js';
import { voidLayout } from './void/void.js';

/**
 * @typedef {object} EnvironmentLayout
 * @property {{ position: {x: number, y: number, z: number}, maxWidth: number, maxHeight: number }} screen
 * @property {{ x: number, y: number, z: number }} seat Rig (floor) position of the viewer.
 * @property {boolean} [screenLight] Lit by the picture.
 * @property {boolean} [ar] Needs an immersive-ar session (passthrough).
 */

/** @type {Record<string, { name: string, description: string, component: string, thumbnail?: boolean, layout: EnvironmentLayout }>} */
export const environments = {
	theater: {
		name: 'Movie theatre',
		description: 'A big cinema: stadium seating, curtains and a giant screen.',
		component: 'theater-environment',
		// Picker card: public/environments/theater.jpg (npm run screenshots).
		thumbnail: true,
		layout: theaterLayout,
	},
	home: {
		name: 'Home cinema',
		description: 'A cosy private screening room with recliners and a starry ceiling.',
		component: 'home-environment',
		// Picker card: public/environments/home.jpg (npm run screenshots).
		thumbnail: true,
		layout: homeLayout,
	},
	station: {
		name: 'Space station',
		description: 'An observation deck over a slowly turning planet.',
		component: 'station-environment',
		// Picker card: public/environments/station.jpg (npm run screenshots).
		thumbnail: true,
		layout: stationLayout,
	},
	cabin: {
		name: 'Lakeside cabin',
		description: 'A log cabin with a crackling fire, rain on the windows and a moonlit lake.',
		component: 'cabin-environment',
		// Picker card: public/environments/cabin.jpg (npm run screenshots).
		thumbnail: true,
		layout: cabinLayout,
	},
	void: {
		name: 'Dark void',
		description: 'Nothing but the screen, in a dark quiet space.',
		component: 'void-environment',
		// Picker card: public/environments/void.jpg (npm run screenshots).
		thumbnail: true,
		layout: voidLayout,
	},
	passthrough: {
		name: 'My room',
		description: 'Your real surroundings (passthrough), with a screen you can move.',
		component: 'passthrough-environment',
		layout: passthroughLayout,
	},
};

export const DEFAULT_ENVIRONMENT = 'theater';
