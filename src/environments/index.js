// Environment registry. Each environment is an A-Frame component (declared
// with the kit's defineEnvironment) plus a layout telling the app where the
// screen and the viewer's seat are, and a description for the picker.

import { bedsLayout } from './beds/beds.js';
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

/**
 * What a place is like, shown as small icons on the picker cards: where you
 * are, how you watch (an environment can offer several postures, e.g. seats
 * and loungers), and whether you can change seats.
 */
export const ENVIRONMENT_TAGS = {
	indoor: { icon: 'indoor', label: 'Indoor' },
	outdoor: { icon: 'outdoor', label: 'Outdoor' },
	passthrough: { icon: 'passthrough', label: 'Passthrough' },
	sitting: { icon: 'sitting', label: 'Sitting' },
	lying: { icon: 'lying', label: 'Lying down' },
	floating: { icon: 'floating', label: 'Floating' },
	seats: { icon: 'seats', label: 'Several seats' },
};

/** @type {Record<string, { name: string, description: string, tags: (keyof typeof ENVIRONMENT_TAGS)[], component: string, thumbnail?: boolean, layout: EnvironmentLayout }>} */
export const environments = {
	theater: {
		name: 'Movie theatre',
		description: 'Rows of red seats, curtains and a giant screen, like a real cinema.',
		tags: ['indoor', 'sitting', 'seats'],
		component: 'theater-environment',
		// Picker card: public/environments/theater.jpg (npm run screenshots).
		thumbnail: true,
		layout: theaterLayout,
	},
	beds: {
		name: 'Bed cinema',
		description: 'A smaller theatre with beds, the screen leaning over you.',
		tags: ['indoor', 'lying', 'seats'],
		component: 'beds-environment',
		// Picker card: public/environments/beds.jpg (npm run screenshots).
		thumbnail: true,
		layout: bedsLayout,
	},
	home: {
		name: 'Home cinema',
		description: 'A cosy screening room, with recliners and a starry ceiling.',
		tags: ['indoor', 'sitting', 'seats'],
		component: 'home-environment',
		// Picker card: public/environments/home.jpg (npm run screenshots).
		thumbnail: true,
		layout: homeLayout,
	},
	station: {
		name: 'Space station',
		description: 'A space station Cupola, windows onto the planet and stars.',
		tags: ['indoor', 'floating'],
		component: 'station-environment',
		// Picker card: public/environments/station.jpg (npm run screenshots).
		thumbnail: true,
		layout: stationLayout,
	},
	cabin: {
		name: 'Lakeside cabin',
		description: 'A log cabin with a crackling fire, rain and a moonlit lake outside.',
		tags: ['indoor', 'sitting', 'seats'],
		component: 'cabin-environment',
		// Picker card: public/environments/cabin.jpg (npm run screenshots).
		thumbnail: true,
		layout: cabinLayout,
	},
	jungle: {
		name: 'Jungle hammock',
		description: 'A hammock under the rainforest canopy at night, among fireflies.',
		tags: ['outdoor', 'lying'],
		component: 'jungle-environment',
		// Picker card: public/environments/jungle.jpg (npm run screenshots).
		thumbnail: true,
		layout: jungleLayout,
	},
	void: {
		name: 'Dark void',
		description: 'Nothing but the screen, in a quiet dark space.',
		tags: ['sitting'],
		component: 'void-environment',
		// Picker card: public/environments/void.jpg (npm run screenshots).
		thumbnail: true,
		layout: voidLayout,
	},
	passthrough: {
		name: 'My room',
		description: 'Your real room, with a screen you can place where you like.',
		tags: ['passthrough', 'sitting'],
		component: 'passthrough-environment',
		layout: passthroughLayout,
	},
};

export const DEFAULT_ENVIRONMENT = 'theater';
