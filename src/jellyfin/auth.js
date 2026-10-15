import { RecommendedServerInfoScore } from '@jellyfin/sdk';
import { getAuthenticationApi } from '@jellyfin/sdk/lib/utils/api/authentication-api';
import { getSessionApi } from '@jellyfin/sdk/lib/utils/api/session-api';
import { getUserApi } from '@jellyfin/sdk/lib/utils/api/user-api';
import { createApi, jellyfin } from './client.js';
import { saveSession } from './storage.js';

const QUICK_CONNECT_POLL_MS = 3000;
const HTTPS_HELP = 'A server only reachable over plain HTTP (like http://192.168.1.10:8096) can\'t be used: give it an HTTPS address, for example with a reverse proxy (Caddy, Nginx…) and a domain name.';
const PLAIN_HTTP = 'JellyTheatre can only connect over HTTPS: browsers block plain HTTP (http://) addresses in secure apps. Use your server\'s https:// address, or give it one, for example with a reverse proxy (Caddy, Nginx…) and a domain name.';

/**
 * Resolves what the user typed ("jellyfin.home", "192.168.1.2:8096"…) into a
 * reachable Jellyfin server, trying the usual scheme/port candidates.
 * @param {string} input
 * @returns {Promise<{ api: import('@jellyfin/sdk').Api, serverName: string, version: string }>}
 */
export async function connectToServer(input) {
	const address = input.trim();
	// An HTTPS page cannot reach an HTTP server (mixed content): the browser
	// blocks it, so it can't even be detected. Explain instead.
	const httpsOnly = window.isSecureContext && location.protocol === 'https:';
	if (httpsOnly && /^http:\/\//i.test(address)) throw new Error(PLAIN_HTTP);
	let candidates = await jellyfin.discovery.getRecommendedServerCandidates(address, RecommendedServerInfoScore.OK);
	if (httpsOnly) candidates = candidates.filter((server) => server.address.startsWith('https:'));
	const best = jellyfin.discovery.findBestServer(candidates);
	if (!best) {
		throw new Error(`No Jellyfin server answered at this address over HTTPS. Check the address and your network.${httpsOnly ? ` ${HTTPS_HELP}` : ''}`);
	}
	return {
		api: createApi(best.address),
		serverName: best.systemInfo?.ServerName || new URL(best.address).host,
		version: best.systemInfo?.Version ?? '',
	};
}

/** @param {import('@jellyfin/sdk').Api} api */
export async function isQuickConnectEnabled(api) {
	try {
		const { data } = await getAuthenticationApi(api).getQuickConnectEnabled();
		return data === true;
	} catch {
		return false;
	}
}

/**
 * Runs the Quick Connect flow: requests a code, then polls until the user
 * approves it from another Jellyfin client.
 * @param {import('@jellyfin/sdk').Api} api
 * @param {{ onCode: (code: string) => void, signal: AbortSignal }} options
 * @returns {Promise<import('@jellyfin/sdk/lib/generated-client/models').AuthenticationResult>}
 */
export async function quickConnect(api, { onCode, signal }) {
	const auth = getAuthenticationApi(api);
	const { data: initial } = await auth.initiateQuickConnect({ signal });
	onCode(initial.Code);

	while (true) {
		await abortableDelay(QUICK_CONNECT_POLL_MS, signal);
		const { data: state } = await auth.getQuickConnectState({ secret: initial.Secret }, { signal });
		if (state.Authenticated) break;
	}

	const { data } = await auth.authenticateWithQuickConnect({ quickConnectDto: { Secret: initial.Secret } }, { signal });
	return data;
}

/**
 * @param {import('@jellyfin/sdk').Api} api
 * @param {string} username
 * @param {string} password
 */
export async function loginWithPassword(api, username, password) {
	const { data } = await getAuthenticationApi(api).authenticateUserByName({
		authenticateUserByName: { Username: username, Pw: password },
	});
	return data;
}

/**
 * Checks that a stored token is still valid.
 * @param {import('@jellyfin/sdk').Api} api
 * @returns {Promise<import('@jellyfin/sdk/lib/generated-client/models').UserDto | null>}
 * null if the token was revoked; throws on network errors so a temporarily
 * unreachable server does not sign the user out.
 */
export async function fetchCurrentUser(api) {
	try {
		const { data } = await getUserApi(api).getCurrentUser();
		return data;
	} catch (error) {
		if (error.response?.status === 401 || error.response?.status === 403) return null;
		throw error;
	}
}

/**
 * Remembers a successful sign-in (Quick Connect or password) on this device.
 * @param {import('@jellyfin/sdk').Api} api
 * @param {string} serverName
 * @param {import('@jellyfin/sdk/lib/generated-client/models').AuthenticationResult} result
 * @returns {{ api: import('@jellyfin/sdk').Api, user: object, serverName: string }}
 */
export function storeSignIn(api, serverName, result) {
	api.update({ accessToken: result.AccessToken });
	saveSession({
		serverUrl: api.basePath,
		serverName,
		accessToken: result.AccessToken,
		userId: result.User.Id,
		userName: result.User.Name,
	});
	return { api, user: result.User, serverName };
}

/** A sign-in error, in words for the user. */
export function describeError(error) {
	const status = error?.response?.status;
	if (status === 401) return 'Wrong username or password.';
	if (status) return `The server answered with an error (HTTP ${status}).`;
	if (error?.code === 'ERR_NETWORK') {
		return 'Could not reach the server. Check the address and your network, and that the server is reachable over HTTPS.';
	}
	return error?.message || String(error);
}

/** @param {import('@jellyfin/sdk').Api} api */
export async function logout(api) {
	try {
		await getSessionApi(api).reportSessionEnded();
	} catch {
		// The token is forgotten locally anyway.
	}
}

function abortableDelay(ms, signal) {
	return new Promise((resolve, reject) => {
		signal.throwIfAborted();
		const timer = setTimeout(resolve, ms);
		signal.addEventListener('abort', () => {
			clearTimeout(timer);
			reject(signal.reason);
		}, { once: true });
	});
}
