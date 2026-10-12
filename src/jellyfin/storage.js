// Persistence of the device id and the signed-in session in localStorage.
// Nothing here ever goes into the repository.

const DEVICE_ID_KEY = 'jellytheatre.deviceId';
const SESSION_KEY = 'jellytheatre.session';
const LAST_SERVER_KEY = 'jellytheatre.lastServer';

function read(key) {
	try {
		return localStorage.getItem(key);
	} catch {
		return null;
	}
}

function write(key, value) {
	try {
		if (value === null) localStorage.removeItem(key);
		else localStorage.setItem(key, value);
	} catch {
		// Storage unavailable (private mode…): the session just won't persist.
	}
}

function randomId() {
	if (crypto.randomUUID) return crypto.randomUUID();
	return Array.from(crypto.getRandomValues(new Uint8Array(16)), (b) => b.toString(16).padStart(2, '0')).join('');
}

/** Stable per-browser id: Jellyfin uses it to identify this device's sessions. */
export function getDeviceId() {
	let id = read(DEVICE_ID_KEY);
	if (!id) {
		id = randomId();
		write(DEVICE_ID_KEY, id);
	}
	return id;
}

/**
 * @typedef {object} StoredSession
 * @property {string} serverUrl
 * @property {string} serverName
 * @property {string} accessToken
 * @property {string} userId
 * @property {string} userName
 */

/** @returns {StoredSession | null} */
export function loadSession() {
	try {
		const session = JSON.parse(read(SESSION_KEY));
		return session?.serverUrl && session?.accessToken ? session : null;
	} catch {
		return null;
	}
}

/** @param {StoredSession | null} session */
export function saveSession(session) {
	write(SESSION_KEY, session ? JSON.stringify(session) : null);
}

export function getLastServer() {
	return read(LAST_SERVER_KEY) ?? '';
}

export function setLastServer(url) {
	write(LAST_SERVER_KEY, url);
}
