// User preferences, persisted per browser.

const KEY = 'jellytheatre.settings';

/**
 * Settings shown in the in-VR settings page, in display order. Adding an entry
 * here is enough for it to appear there.
 */
export const SETTING_DEFINITIONS = [
	{
		name: 'autoplayNext',
		type: 'boolean',
		default: true,
		label: 'Auto-play the next episode',
		description: 'Start the next episode after a 10-second countdown, which you can always cancel.',
	},
];

const DEFAULTS = Object.fromEntries(SETTING_DEFINITIONS.map((setting) => [setting.name, setting.default]));

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
