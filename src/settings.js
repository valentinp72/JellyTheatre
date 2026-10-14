// User preferences, persisted per browser.

const KEY = 'jellytheatre.settings';

/** Tabs of the settings panel. */
export const SETTING_CATEGORIES = [
	{ id: 'playback', label: 'Playback' },
	{ id: 'subtitles', label: 'Subtitles' },
	{ id: 'display', label: 'Display' },
	{ id: 'view', label: 'View' },
	{ id: 'account', label: 'Account' },
];

/**
 * Settings shown in the in-VR settings panel, by category (tab), in display
 * order. Adding an entry here is enough for it to appear there.
 */
export const SETTING_DEFINITIONS = [
	{
		name: 'environment',
		category: 'display',
		type: 'choice',
		default: 'theater',
		// Chosen on a page of illustrated cards (see the settings panel).
		picker: 'environment',
		options: [
			{ value: 'theater', label: 'Movie theatre' },
			{ value: 'home', label: 'Home cinema' },
			{ value: 'station', label: 'Space station' },
			{ value: 'cabin', label: 'Lakeside cabin' },
			{ value: 'void', label: 'Dark void' },
			{ value: 'passthrough', label: 'My room' },
		],
		label: 'Environment',
		description: 'Where you watch: a theatre, a home cinema, a space station, a cabin… or your own room.',
	},
	{
		name: 'roomBrightness',
		category: 'display',
		type: 'choice',
		default: 'dim',
		options: [
			{ value: 'dark', label: 'Dark' },
			{ value: 'dim', label: 'Dim' },
			{ value: 'normal', label: 'Normal' },
			{ value: 'bright', label: 'Bright' },
		],
		label: 'Room brightness',
		description: 'How bright the theatre is when the lights are on (and how dark during the film).',
	},
	{
		name: 'screenLight',
		category: 'display',
		type: 'choice',
		default: 'strong',
		options: [
			{ value: 'off', label: 'Off' },
			{ value: 'subtle', label: 'Subtle' },
			{ value: 'strong', label: 'Strong' },
		],
		label: 'Screen light',
		description: 'The room is lit by the colors of the picture during the film.',
	},
	{
		name: 'autoplayNext',
		category: 'playback',
		type: 'boolean',
		default: true,
		label: 'Auto-play the next episode',
		description: 'Start the next episode after a 10-second countdown, which you can always cancel.',
	},
	{
		name: 'skipSegments',
		category: 'playback',
		type: 'choice',
		default: 'button',
		options: [
			{ value: 'button', label: 'Show a button' },
			{ value: 'auto', label: 'Skip automatically' },
			{ value: 'off', label: 'Off' },
		],
		label: 'Skip intros and credits',
		description: 'During intros, recaps and credits (when Jellyfin has detected them).',
	},
	{
		name: 'menuOnScreen',
		category: 'display',
		type: 'boolean',
		default: true,
		label: 'Library on the big screen',
		description: 'Show the library on the cinema screen. Turn off to show it closer to you.',
	},
	{
		name: 'crispLibrary',
		category: 'display',
		type: 'boolean',
		default: true,
		label: 'Crisp library text',
		description: 'Draw the library through the headset compositor, for sharper text. Turn off if the library looks wrong.',
	},
	{
		name: 'highResolution',
		category: 'display',
		type: 'boolean',
		default: true,
		label: 'Sharper rendering',
		description: 'Render menus and the theatre at a higher resolution. Uses more battery; applies the next time you enter VR.',
	},
	{
		name: 'recenter',
		category: 'view',
		type: 'action',
		label: 'Recenter',
		description: 'Bring the screen in front of you, even reclined or lying down. Also done when you hold the Meta button.',
		action: 'Recenter',
	},
	{
		name: 'backToSeat',
		category: 'view',
		type: 'action',
		label: 'Back to my seat',
		description: 'To change seats, push a stick forward, point at a seat and release; right stick left/right turns. Shortcut: click the left stick.',
		action: 'Go back',
	},
	{
		name: 'heightOffset',
		category: 'view',
		type: 'range',
		default: 0,
		// Up to +1.5 m: lying down, the head is about a metre below a seated one.
		min: -0.5,
		max: 1.5,
		step: 0.1,
		format: (value) => `${value > 0 ? '+' : ''}${Math.round(value * 100)} cm`,
		label: 'Eye height',
		description: 'Raise or lower your view, if you feel too low or too high in your seat (lying down: about +100 cm).',
	},
	{
		name: 'resetScreen',
		category: 'view',
		type: 'action',
		label: 'Screen position (My room)',
		description: 'In "My room", hold the grip while pointing at the screen to move it; the stick pushes it away or brings it closer.',
		action: 'Reset',
	},
	{
		name: 'resetControls',
		category: 'view',
		type: 'action',
		label: 'Controls panel position',
		description: 'Hold the grip button while pointing at the controls panel to move it.',
		action: 'Reset',
	},
	{
		name: 'subtitleSize',
		category: 'subtitles',
		type: 'choice',
		default: 'medium',
		options: [
			{ value: 'small', label: 'Small' },
			{ value: 'medium', label: 'Medium' },
			{ value: 'large', label: 'Large' },
			{ value: 'xlarge', label: 'Extra large' },
		],
		label: 'Size',
		description: 'Size of text subtitles, relative to the picture.',
	},
	{
		name: 'subtitleColor',
		category: 'subtitles',
		type: 'choice',
		default: 'white',
		options: [
			{ value: 'white', label: 'White' },
			{ value: 'yellow', label: 'Yellow' },
		],
		label: 'Color',
		description: 'Color of text subtitles.',
	},
	{
		name: 'subtitleStyle',
		category: 'subtitles',
		type: 'choice',
		default: 'outline',
		options: [
			{ value: 'outline', label: 'Outline' },
			{ value: 'box', label: 'Dark box' },
		],
		label: 'Background',
		description: 'A black outline around the letters, or a dark box behind the lines.',
	},
	{
		name: 'subtitlePosition',
		category: 'subtitles',
		type: 'choice',
		default: 'picture',
		options: [
			{ value: 'picture', label: 'On the picture' },
			{ value: 'below', label: 'Below it' },
		],
		label: 'Position',
		description: 'At the bottom of the picture, or under it (never over the image).',
	},
	{
		name: 'subtitleOffset',
		category: 'subtitles',
		type: 'range',
		default: 0,
		min: -10,
		max: 10,
		step: 0.1,
		format: (value) => `${value > 0 ? '+' : ''}${value.toFixed(1)} s`,
		label: 'Timing',
		description: 'Show subtitles later (+) or earlier (−), for files where they are out of sync.',
	},
	{
		name: 'signOut',
		category: 'account',
		type: 'action',
		label: 'Sign out',
		description: 'Forget your sign-in on this device. You can then sign in again, as someone else or on another server.',
		action: 'Sign out',
	},
];

const DEFAULTS = Object.fromEntries(SETTING_DEFINITIONS
	.filter((setting) => setting.type !== 'action')
	.map((setting) => [setting.name, setting.default]));

let cache = null;

function load() {
	if (cache) return cache;
	try {
		cache = { ...DEFAULTS, ...JSON.parse(localStorage.getItem(KEY)) };
	} catch {
		cache = { ...DEFAULTS };
	}
	return cache;
}

export function getSetting(name) {
	return load()[name];
}

export function setSetting(name, value) {
	load()[name] = value;
	try {
		localStorage.setItem(KEY, JSON.stringify(cache));
	} catch {
		// Not persisted (private mode…).
	}
	window.dispatchEvent(new CustomEvent('settingchange', { detail: { name, value } }));
}

/** Runs an `action` setting: listeners handle the `settingaction` event. */
export function runSettingAction(name) {
	window.dispatchEvent(new CustomEvent('settingaction', { detail: { name } }));
}
