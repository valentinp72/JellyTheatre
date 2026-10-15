// Sign-in inside VR, shown in the library panel while signed out: the store
// app has no 2D lobby, and the user can sign out from the settings. Server
// address, then Quick Connect (a code to approve from another Jellyfin app,
// no typing) or username and password, typed on the on-screen keyboard (or a
// physical one). Emits `signed-in` { api, user, serverName }.

import {
	connectToServer,
	describeError,
	isQuickConnectEnabled,
	loginWithPassword,
	quickConnect,
	storeSignIn,
} from '../jellyfin/auth.js';
import { getLastServer, setLastServer } from '../jellyfin/storage.js';
import { COLORS, entity, setInteractiveVisible } from './widgets.js';

const FIELD_W = 1.1;
const FIELD_H = 0.085;
const ERROR_COLOR = '#ff6b7a';
const PLACEHOLDERS = {
	server: 'jellyfin.example.com',
	username: '',
	password: '',
};

AFRAME.registerComponent('sign-in-view', {
	schema: {
		keyboard: { type: 'selector', default: '[ui-keyboard]' },
	},

	init() {
		this.active = false;
		/** 'server' | 'connecting' | 'login' | 'signing-in' */
		this.step = 'server';
		/** 'quick' | 'password' */
		this.method = 'quick';
		this.quickConnectEnabled = false;
		this.values = { server: '', username: '', password: '' };
		this.focus = 'server';
		this.error = '';
		this.code = '';
		this.codeStatus = '';
		this.codeExpired = false;
		/** Server being signed into: { api, serverName }. */
		this.pending = null;
		this.quickConnectAbort = null;
		// Bumped when the view resets: late answers of older requests are ignored.
		this.generation = 0;

		const text = (y, options) => {
			const el = entity({ position: `0 ${y} 0.002`, 'ui-text': { align: 'center', maxWidth: 1.7, ...options } });
			this.el.appendChild(el);
			return el;
		};
		this.title = text(0.42, { fontSize: 0.05, weight: 'bold' });
		this.hint = text(0.32, { fontSize: 0.03, color: COLORS.muted, maxWidth: 1.5 });
		this.codeText = text(0.13, { fontSize: 0.13, weight: 'bold', color: COLORS.text });
		this.statusText = text(0.0, { fontSize: 0.03, color: COLORS.muted });
		this.errorText = text(-0.3, { fontSize: 0.03, color: ERROR_COLOR, maxWidth: 1.6 });

		this.fields = {};
		this.fieldLabels = {};
		for (const name of ['server', 'username', 'password']) {
			const field = entity({ 'ui-button': { width: FIELD_W, height: FIELD_H, align: 'left', fontSize: 0.034, color: '#100c16', hoverColor: '#2a2235', activeColor: '#2a2235' } });
			field.addEventListener('click', () => {
				this.focus = name;
				this.render();
			});
			const label = entity({ 'ui-text': { fontSize: 0.026, color: COLORS.muted, anchorX: 'left' } });
			this.el.append(field, label);
			this.fields[name] = field;
			this.fieldLabels[name] = label;
		}

		const button = (width, onClick) => {
			const el = entity({ 'ui-button': { width, height: 0.075, fontSize: 0.03 } });
			el.addEventListener('click', onClick);
			this.el.appendChild(el);
			return el;
		};
		this.primaryButton = button(0.3, () => this.submit());
		this.methodButton = button(0.42, () => this.switchMethod());
		this.newCodeButton = button(0.3, () => this.startQuickConnect());
		this.changeServerButton = button(0.3, () => this.changeServer());

		this.keyboard = this.data.keyboard;
		this.keyboard.addEventListener('key', (event) => this.onKey(event.detail.key));
		this.onKeyDown = this.onKeyDown.bind(this);
		window.addEventListener('keydown', this.onKeyDown);
		this.render();
	},

	remove() {
		window.removeEventListener('keydown', this.onKeyDown);
		this.stopQuickConnect();
	},

	// --- public API --------------------------------------------------------

	/** Shown while signed out (and the user is in the scene). */
	setActive(active) {
		if (active === this.active) return;
		this.active = active;
		this.generation++;
		this.stopQuickConnect();
		this.error = '';
		if (active) {
			// Back to the last server (after signing out, or a revoked token).
			const last = getLastServer();
			// Started for the user (and erasable): almost every address needs it.
			this.values.server = last || 'https://';
			if (last) this.connect(last);
			else this.showServer();
		}
		this.render();
	},

	/** The keyboard is needed whenever a field shows. */
	needsKeyboard() {
		return this.active && this.focusableFields().length > 0;
	},

	// --- steps ---------------------------------------------------------------

	showServer() {
		this.step = 'server';
		this.focus = 'server';
		this.render();
	},

	async connect(address) {
		const generation = this.generation;
		this.step = 'connecting';
		this.error = '';
		this.render();
		try {
			const pending = await connectToServer(address);
			if (generation !== this.generation) return;
			this.pending = pending;
			setLastServer(pending.api.basePath);
			this.values.server = pending.api.basePath;
			this.quickConnectEnabled = await isQuickConnectEnabled(pending.api);
			if (generation !== this.generation) return;
			this.step = 'login';
			this.setMethod(this.quickConnectEnabled ? 'quick' : 'password');
		} catch (error) {
			if (generation !== this.generation) return;
			console.error(error);
			this.error = describeError(error);
			this.showServer();
		}
	},

	setMethod(method) {
		this.method = method;
		this.error = '';
		if (method === 'quick') {
			this.startQuickConnect();
		} else {
			this.stopQuickConnect();
			this.focus = this.values.username ? 'password' : 'username';
		}
		this.render();
	},

	switchMethod() {
		this.setMethod(this.method === 'quick' ? 'password' : 'quick');
	},

	changeServer() {
		this.generation++;
		this.stopQuickConnect();
		this.pending = null;
		this.error = '';
		this.showServer();
	},

	async startQuickConnect() {
		this.stopQuickConnect();
		const abort = new AbortController();
		this.quickConnectAbort = abort;
		this.code = '';
		this.codeExpired = false;
		this.codeStatus = 'Requesting a code…';
		this.render();
		try {
			const result = await quickConnect(this.pending.api, {
				signal: abort.signal,
				onCode: (code) => {
					this.code = code;
					this.codeStatus = 'Waiting for approval…';
					this.render();
				},
			});
			this.finish(result);
		} catch (error) {
			if (abort.signal.aborted) return;
			console.error(error);
			this.code = '';
			this.codeExpired = true;
			this.codeStatus = 'Quick Connect failed or the code expired.';
			this.render();
		}
	},

	stopQuickConnect() {
		this.quickConnectAbort?.abort();
		this.quickConnectAbort = null;
	},

	async signInWithPassword() {
		const generation = this.generation;
		if (!this.values.username) {
			this.error = 'Type your username.';
			this.focus = 'username';
			this.render();
			return;
		}
		this.step = 'signing-in';
		this.error = '';
		this.render();
		try {
			const result = await loginWithPassword(this.pending.api, this.values.username, this.values.password);
			if (generation !== this.generation) return;
			this.finish(result);
		} catch (error) {
			if (generation !== this.generation) return;
			console.error(error);
			this.error = describeError(error);
			this.step = 'login';
			this.focus = 'password';
			this.render();
		}
	},

	finish(result) {
		this.stopQuickConnect();
		const session = storeSignIn(this.pending.api, this.pending.serverName, result);
		this.values.password = '';
		this.pending = null;
		this.el.emit('signed-in', session);
	},

	submit() {
		if (this.step === 'server') {
			const address = this.values.server.trim();
			if (address && !/^https?:\/\/$/i.test(address)) this.connect(address);
			else {
				this.error = 'Type the address of your Jellyfin server.';
				this.render();
			}
		} else if (this.step === 'login' && this.method === 'password') {
			this.signInWithPassword();
		}
	},

	// --- typing ----------------------------------------------------------------

	focusableFields() {
		if (this.step === 'server') return ['server'];
		if (this.step === 'login' && this.method === 'password') return ['username', 'password'];
		return [];
	},

	onKey(key) {
		const fields = this.focusableFields();
		if (!this.active || !fields.includes(this.focus)) return;
		const value = this.values[this.focus];
		if (key === 'Backspace') this.values[this.focus] = value.slice(0, -1);
		else if (key === 'Clear') this.values[this.focus] = '';
		else if (key === 'Enter') this.submit();
		else if (key === 'Tab') this.focus = fields[(fields.indexOf(this.focus) + 1) % fields.length];
		else if (value.length < 200) this.values[this.focus] = value + key;
		if (key !== 'Enter') this.render();
	},

	onKeyDown(event) {
		if (!this.needsKeyboard() || !document.getElementById('lobby')?.hidden) return;
		if (event.target instanceof HTMLInputElement || event.ctrlKey || event.metaKey || event.altKey) return;
		if (event.key === 'Backspace' || event.key === 'Enter' || event.key === 'Tab') this.onKey(event.key);
		else if (event.key === 'Escape') this.onKey('Clear');
		else if (event.key.length === 1) this.onKey(event.key);
		else return;
		event.preventDefault();
	},

	// --- rendering ---------------------------------------------------------

	show(el, visible) {
		setInteractiveVisible(el, this.active && visible);
	},

	setText(el, value) {
		el.setAttribute('ui-text', 'value', value);
	},

	placeField(name, y, label) {
		const focused = this.focus === name;
		let value = this.values[name];
		if (name === 'password') value = '•'.repeat(value.length);
		this.fields[name].setAttribute('position', `0 ${y} 0.002`);
		this.fields[name].setAttribute('ui-button', {
			label: focused ? `${value}|` : value || PLACEHOLDERS[name],
			active: focused,
		});
		this.fieldLabels[name].setAttribute('position', `${-FIELD_W / 2} ${y + FIELD_H / 2 + 0.03} 0.002`);
		this.setText(this.fieldLabels[name], label);
	},

	placeButton(el, x, y, label, options = {}) {
		el.setAttribute('position', `${x} ${y} 0.002`);
		el.setAttribute('ui-button', { label, disabled: false, ...options });
	},

	render() {
		this.el.object3D.visible = this.active;
		const { step, method } = this;
		const server = this.pending?.serverName ?? '';
		const login = step === 'login' || step === 'signing-in';
		const quick = login && method === 'quick';
		const password = login && method === 'password';
		const typingServer = step === 'server' || step === 'connecting';

		if (typingServer) {
			this.setText(this.title, 'Connect to your Jellyfin server');
			this.setText(this.hint, 'Type its address with the keyboard below, like jellyfin.example.com. It must be reachable over HTTPS.');
			this.placeField('server', 0.1, 'Server address');
			const connecting = step === 'connecting';
			this.placeButton(this.primaryButton, 0, -0.07, connecting ? 'Connecting…' : 'Connect', { disabled: connecting });
		} else if (quick) {
			this.setText(this.title, `Sign in to ${server}`);
			this.setText(this.hint, 'In Jellyfin on your phone or computer, open your profile, then Quick Connect, and enter this code:');
			this.setText(this.codeText, this.code);
			this.setText(this.statusText, this.codeStatus);
			this.placeButton(this.newCodeButton, 0, -0.08, 'Get a new code');
			this.placeButton(this.methodButton, -0.2, -0.2, 'Sign in with a password', { width: 0.42 });
			this.placeButton(this.changeServerButton, 0.2, -0.2, 'Change server');
		} else if (password) {
			this.setText(this.title, `Sign in to ${server}`);
			this.setText(this.hint, 'Type your Jellyfin username and password with the keyboard below.');
			this.placeField('username', 0.15, 'Username');
			this.placeField('password', -0.0, 'Password');
			const signingIn = step === 'signing-in';
			if (this.quickConnectEnabled) {
				this.placeButton(this.primaryButton, -0.38, -0.15, signingIn ? 'Signing in…' : 'Sign in', { disabled: signingIn });
				this.placeButton(this.methodButton, 0, -0.15, 'Use Quick Connect', { width: 0.34 });
				this.placeButton(this.changeServerButton, 0.38, -0.15, 'Change server');
			} else {
				this.placeButton(this.primaryButton, -0.17, -0.15, signingIn ? 'Signing in…' : 'Sign in', { disabled: signingIn });
				this.placeButton(this.changeServerButton, 0.17, -0.15, 'Change server');
			}
		}
		this.setText(this.errorText, this.error);

		this.show(this.title, true);
		this.show(this.hint, true);
		this.show(this.codeText, quick);
		this.show(this.statusText, quick);
		this.show(this.errorText, Boolean(this.error));
		this.show(this.fields.server, typingServer);
		this.show(this.fieldLabels.server, typingServer);
		this.show(this.fields.username, password);
		this.show(this.fieldLabels.username, password);
		this.show(this.fields.password, password);
		this.show(this.fieldLabels.password, password);
		this.show(this.primaryButton, typingServer || password);
		this.show(this.methodButton, (quick || password) && this.quickConnectEnabled);
		this.show(this.newCodeButton, quick && this.codeExpired);
		this.show(this.changeServerButton, quick || password);

		const keyboard = this.needsKeyboard();
		if (keyboard !== this.keyboardShown) {
			this.keyboardShown = keyboard;
			this.el.emit('keyboard-change', { visible: keyboard });
		}
	},
});
