// Environment registry. Each environment is an A-Frame component (declared
// with the kit's defineEnvironment) plus a layout telling the app where the
// screen and the viewer's seat are, and a description for the picker.

import { cabinLayout } from './cabin/cabin.js';
import { homeLayout } from './home/home.js';
import { jungleLayout } from './jungle/jungle.js';
import { passthroughLayout } from './passthrough/passthrough.js';
import { stationLayout } from './station/station.js';
import { theaterLayout } from './theater/theater.js';
import { voidLayout } from './void/void.js';

/**
 * @typedef {object} EnvironmentLayout
 * @property {{ position: {x: number, y: number, z: number}, maxWidth: number, maxHeight: number, tilt?: number }} screen
 * tilt: degrees the screen leans back (above a lying viewer)
 * @property {{ x: number, y: number, z: number }} seat Rig (floor) position of the viewer.
 * @property {{ x: number, y: number, z: number }} [head] The viewer lies down, eyes here.
 * @property {boolean} [screenLight] Lit by the picture.
 * @property {boolean} [ar] Needs an immersive-ar session (passthrough).
 * @property {number} [menuDistance] Library distance when not on the screen (default 2 m).
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
		description: 'Float in the Cupola of a space station: windows all around onto the planet, the moon and the stars.',
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
	jungle: {
		name: 'Jungle hammock',
		description: 'Lie back in a hammock in the rainforest at night, the screen stretched between two trees above you.',
		component: 'jungle-environment',
		// Picker card: public/environments/jungle.jpg (npm run screenshots).
		thumbnail: true,
		layout: jungleLayout,
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
