// 2D lobby shown before entering the theatre: server selection, sign-in
// (Quick Connect or password) and the "enter" button. Plain DOM, so it works
// in the Quest Browser's flat window and on any desktop browser.

import {
	connectToServer,
	fetchCurrentUser,
	isQuickConnectEnabled,
	loginWithPassword,
	logout,
	quickConnect,
} from '../jellyfin/auth.js';
import { createApi } from '../jellyfin/client.js';
import { getLastServer, loadSession, saveSession, setLastServer } from '../jellyfin/storage.js';

/**
 * @param {object} options
 * @param {(session: { api: import('@jellyfin/sdk').Api, user: object, serverName: string }) => void} options.onSignedIn
 * @param {() => void} options.onSignedOut
 * @param {() => void} options.onEnter Must run synchronously in the click handler (entering VR needs a user gesture).
 */
export function createLobby({ onSignedIn, onSignedOut, onEnter }) {
	const root = document.getElementById('lobby');
	const errorEl = document.getElementById('lobby-error');
	const serverInput = document.getElementById('server-url');
	const qcBox = document.getElementById('quick-connect');
	const qcCode = document.getElementById('qc-code');
	const qcStatus = document.getElementById('qc-status');
	const passwordDetails = document.getElementById('password-login');
	const passwordForm = document.getElementById('password-form');

	/** Server being signed into (before a session exists). */
	let pending = null;
	/** Signed-in session. */
	let current = null;
	let quickConnectAbort = null;

	bind('version', __APP_VERSION__);
	document.getElementById('server-insecure-hint').hidden = location.protocol !== 'https:';

	function bind(name, value) {
		for (const el of root.querySelectorAll(`[data-bind="${name}"]`)) el.textContent = value;
	}

	function showStep(step) {
		for (const section of root.querySelectorAll('[data-step]')) {
			section.hidden = section.dataset.step !== step;
		}
		const focusable = root.querySelector(`[data-step="${step}"] input:not([hidden]), [data-step="${step}"] button.primary`);
		focusable?.focus();
	}

	function showError(error) {
		errorEl.hidden = !error;
		errorEl.textContent = error ? describeError(error) : '';
		if (error) console.error(error);
	}

	function setBusy(form, busy) {
		for (const el of form.elements) el.disabled = busy;
	}

	function stopQuickConnect() {
		quickConnectAbort?.abort();
		quickConnectAbort = null;
	}

	async function startQuickConnect() {
		stopQuickConnect();
		const abort = new AbortController();
		quickConnectAbort = abort;
		qcCode.textContent = '······';
		qcStatus.textContent = 'Requesting a code…';
		try {
			const result = await quickConnect(pending.api, {
				signal: abort.signal,
				onCode: (code) => {
					qcCode.textContent = code;
					qcStatus.textContent = 'Waiting for approval…';
				},
			});
			await completeSignIn(result);
		} catch (error) {
			if (abort.signal.aborted) return;
			console.error(error);
			qcCode.textContent = '······';
			qcStatus.replaceChildren('Quick Connect failed or the code expired. ', retryButton());
		}
	}

	function retryButton() {
		const button = document.createElement('button');
		button.type = 'button';
		button.className = 'link';
		button.textContent = 'Get a new code';
		button.addEventListener('click', startQuickConnect);
		return button;
	}

	async function showLogin() {
		bind('serverName', pending.serverName);
		showStep('login');
		const enabled = await isQuickConnectEnabled(pending.api);
		qcBox.hidden = !enabled;
		passwordDetails.open = !enabled;
		if (enabled) startQuickConnect();
		else passwordForm.elements.username.focus();
	}

	/** @param {import('@jellyfin/sdk/lib/generated-client/models').AuthenticationResult} result */
	async function completeSignIn(result) {
		stopQuickConnect();
		const { api, serverName } = pending;
		api.update({ accessToken: result.AccessToken });
		saveSession({
			serverUrl: api.basePath,
			serverName,
			accessToken: result.AccessToken,
			userId: result.User.Id,
			userName: result.User.Name,
		});
		pending = null;
		setSignedIn({ api, user: result.User, serverName });
	}

	function setSignedIn(session) {
		current = session;
		bind('userName', session.user.Name);
		bind('serverName', session.serverName);
		showError(null);
		showStep('ready');
		onSignedIn(session);
	}

	async function restore() {
		const stored = loadSession();
		if (!stored) {
			serverInput.value = getLastServer();
			showStep('server');
			return;
		}
		showStep('loading');
		const api = createApi(stored.serverUrl, stored.accessToken);
		try {
			const user = await fetchCurrentUser(api);
			if (user) {
				setSignedIn({ api, user, serverName: stored.serverName });
				return;
			}
			// Token revoked from the server dashboard: sign in again.
			saveSession(null);
			pending = { api: createApi(stored.serverUrl), serverName: stored.serverName };
			await showLogin();
		} catch (error) {
			showError(error);
			serverInput.value = stored.serverUrl;
			showStep('server');
		}
	}

	document.getElementById('server-form').addEventListener('submit', async (event) => {
		event.preventDefault();
		const form = event.currentTarget;
		showError(null);
		setBusy(form, true);
		try {
			pending = await connectToServer(serverInput.value);
			setLastServer(pending.api.basePath);
			serverInput.value = pending.api.basePath;
			await showLogin();
		} catch (error) {
			showError(error);
		} finally {
			setBusy(form, false);
		}
	});

	passwordForm.addEventListener('submit', async (event) => {
		event.preventDefault();
		showError(null);
		setBusy(passwordForm, true);
		try {
			const { username, password } = passwordForm.elements;
			const result = await loginWithPassword(pending.api, username.value, password.value);
			password.value = '';
			await completeSignIn(result);
		} catch (error) {
			showError(error);
		} finally {
			setBusy(passwordForm, false);
		}
	});

	root.addEventListener('click', async (event) => {
		const action = event.target.closest('[data-action]')?.dataset.action;
		if (action === 'change-server') {
			stopQuickConnect();
			showError(null);
			showStep('server');
		} else if (action === 'enter') {
			onEnter();
		} else if (action === 'logout') {
			const { api, serverName } = current;
			current = null;
			saveSession(null);
			onSignedOut();
			await logout(api);
			pending = { api: createApi(api.basePath), serverName };
			await showLogin();
		}
	});

	return {
		restore,
		show() {
			root.hidden = false;
		},
		hide() {
			root.hidden = true;
		},
		setXrHint(text) {
			document.getElementById('xr-hint').textContent = text;
		},
	};
}

function describeError(error) {
	const status = error?.response?.status;
	if (status === 401) return 'Wrong username or password.';
	if (status) return `The server answered with an error (HTTP ${status}).`;
	if (error?.code === 'ERR_NETWORK') {
		return 'Could not reach the server. Check the address, your network, and that the server uses HTTPS if this page does.';
	}
	return error?.message || String(error);
}
