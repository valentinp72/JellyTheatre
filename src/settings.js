// User preferences, persisted per browser.

const KEY = 'jellytheatre.settings';

/**
 * Settings shown in the in-VR settings page, in display order. Adding an entry
 * here is enough for it to appear there.
 */
export const SETTING_DEFINITIONS = [
	{
		name: 'environment',
		type: 'choice',
		default: 'theater',
		options: [
			{ value: 'theater', label: 'Theatre' },
			{ value: 'void', label: 'Dark void' },
			{ value: 'passthrough', label: 'My room' },
		],
		label: 'Environment',
		description: 'Where you watch. "My room" shows your real surroundings (passthrough).',
	},
	{
		name: 'roomBrightness',
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
		type: 'boolean',
		default: true,
		label: 'Auto-play the next episode',
		description: 'Start the next episode after a 10-second countdown, which you can always cancel.',
	},
	{
		name: 'menuOnScreen',
		type: 'boolean',
		default: true,
		label: 'Library on the big screen',
		description: 'Show the library on the cinema screen. Turn off to show it closer to you.',
	},
	{
		name: 'crispLibrary',
		type: 'boolean',
		default: true,
		label: 'Crisp library text',
		description: 'Draw the library through the headset compositor, for sharper text. Turn off if the library looks wrong.',
	},
	{
		name: 'highResolution',
		type: 'boolean',
		default: true,
		label: 'Sharper rendering',
		description: 'Render menus and the theatre at a higher resolution. Uses more battery; applies the next time you enter VR.',
	},
	{
		name: 'recenter',
		type: 'action',
		label: 'Recenter',
		description: 'Bring the screen in front of you, even reclined or lying down. Also done when you hold the Meta button.',
		action: 'Recenter',
	},
	{
		name: 'backToSeat',
		type: 'action',
		label: 'Back to my seat',
		description: 'Push a stick forward to aim and release to teleport; right stick left/right turns. Shortcut: click the left stick.',
		action: 'Go back',
	},
	{
		name: 'resetScreen',
		type: 'action',
		label: 'Screen position (My room)',
		description: 'In "My room", hold the grip while pointing at the screen to move it; the stick pushes it away or brings it closer.',
		action: 'Reset',
	},
	{
		name: 'resetControls',
		type: 'action',
		label: 'Controls panel position',
		description: 'Hold the grip button while pointing at the controls panel to move it.',
		action: 'Reset',
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
