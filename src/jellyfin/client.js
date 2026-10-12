import { Jellyfin } from '@jellyfin/sdk';
import { getDeviceId } from './storage.js';

function detectDeviceName() {
	const ua = navigator.userAgent;
	const quest = ua.match(/Quest\s?(Pro|\d+S?)?/i);
	if (quest) return `Meta ${quest[0]}`;
	if (/OculusBrowser/i.test(ua)) return 'Meta Quest';
	if (/Firefox/i.test(ua)) return 'Firefox';
	if (/Edg\//i.test(ua)) return 'Edge';
	if (/Chrome/i.test(ua)) return 'Chrome';
	if (/Safari/i.test(ua)) return 'Safari';
	return 'Web browser';
}

export const jellyfin = new Jellyfin({
	clientInfo: {
		name: 'JellyTheatre',
		version: __APP_VERSION__,
	},
	deviceInfo: {
		name: detectDeviceName(),
		id: getDeviceId(),
	},
});

/**
 * @param {string} serverUrl
 * @param {string} [accessToken]
 */
export function createApi(serverUrl, accessToken) {
	return jellyfin.createApi(serverUrl, accessToken);
}
