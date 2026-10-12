import './lobby/lobby.css';
import 'aframe';
import { registerSW } from 'virtual:pwa-register';
import './ui/text.js';
import './ui/widgets.js';
import './ui/keyboard.js';
import './ui/poster.js';
import './ui/library-panel.js';
import './ui/player-controls.js';
import './player/video-screen.js';
import './player/player-input.js';
import './environments/theater/theater.js';
import { DEFAULT_ENVIRONMENT, environments } from './environments/index.js';
import { createLobby } from './lobby/lobby.js';
import { Player } from './player/player.js';

registerSW({ immediate: true });

const CONTROLS_HIDE_DELAY_MS = 5000;

// Instantiate the scene only now that every component is registered.
const template = document.getElementById('scene-template');
document.body.appendChild(template.content.cloneNode(true));
const sceneEl = document.querySelector('a-scene');
const environmentEl = document.getElementById('environment');
const screenEl = document.getElementById('screen');
const rigEl = document.getElementById('rig');
const libraryEl = document.getElementById('library-panel');
const controlsEl = document.getElementById('player-controls');
const backButton = document.getElementById('back-to-lobby');

const player = new Player();
let session = null;
let vrSupported = false;
let hideControlsTimer = null;

const sceneReady = new Promise((resolve) => {
	if (sceneEl.hasLoaded) resolve();
	else sceneEl.addEventListener('loaded', resolve, { once: true });
});

const library = () => libraryEl.components['library-panel'];
const controls = () => controlsEl.components['player-controls'];
const environment = () => environmentEl.components[environments[DEFAULT_ENVIRONMENT].component];

function setupEnvironment(key) {
	const { component, layout } = environments[key];
	environmentEl.setAttribute(component, '');
	const { position, maxWidth, maxHeight } = layout.screen;
	screenEl.object3D.position.set(position.x, position.y, position.z);
	screenEl.setAttribute('video-screen', { maxWidth, maxHeight });
	rigEl.object3D.position.set(layout.seat.x, layout.seat.y, layout.seat.z);
}

function showControls() {
	if (!player.isActive && !player.loading) return;
	controls().setVisible(true);
	clearTimeout(hideControlsTimer);
	hideControlsTimer = setTimeout(() => {
		if (!player.video.paused) controls().setVisible(false);
	}, CONTROLS_HIDE_DELAY_MS);
}

function startPlayback(item, startPosition) {
	library().setNotice('');
	library().setVisible(false);
	environment().setHouseLights(false);
	player.play(item, { startPosition });
	showControls();
}

function backToHome() {
	clearTimeout(hideControlsTimer);
	controls().setVisible(false);
	environment().setHouseLights(true);
	library().setVisible(true);
	// Progress changed: refresh resume points and next up.
	library().refresh();
}

const lobby = createLobby({
	async onSignedIn({ api, user }) {
		session = { api, user };
		player.setSession(api, user.Id);
		await sceneReady;
		library().setSession(api, user);
	},
	async onSignedOut() {
		session = null;
		await player.stop();
		await sceneReady;
		backToHome();
		library().clearSession();
	},
	onEnter() {
		lobby.hide();
		if (vrSupported) {
			sceneEl.enterVR().catch((error) => {
				console.error(error);
				showFlatScene();
			});
		} else {
			showFlatScene();
		}
	},
});

function showFlatScene() {
	lobby.hide();
	backButton.hidden = false;
}

function showLobby() {
	backButton.hidden = true;
	if (player.isActive) player.video.pause();
	lobby.show();
}

backButton.addEventListener('click', showLobby);
sceneEl.addEventListener('exit-vr', showLobby);

sceneReady.then(() => {
	setupEnvironment(DEFAULT_ENVIRONMENT);
	screenEl.components['video-screen'].bind(player);
	controls().bind(player);

	libraryEl.addEventListener('play-item', ({ detail }) => startPlayback(detail.item, detail.startPosition));
	libraryEl.addEventListener('refresh-request', () => library().refresh());
	controlsEl.addEventListener('activity', showControls);
	controlsEl.addEventListener('stop-request', async () => {
		await player.stop();
		backToHome();
	});

	sceneEl.addEventListener('player-command', ({ detail }) => {
		if (!player.isActive) return;
		if (detail.command === 'toggle') player.togglePlay();
		else if (detail.command === 'seek') player.seekBy(detail.delta);
		showControls();
	});
	sceneEl.addEventListener('toggle-controls', () => {
		if (!player.isActive) return;
		if (controls().visible) controls().setVisible(false);
		else showControls();
	});

	player.addEventListener('ended', backToHome);
	player.addEventListener('error', ({ detail }) => {
		backToHome();
		library().setNotice(detail.error?.message ?? 'Playback failed.');
	});
	player.video.addEventListener('pause', () => {
		// Keep the controls up while paused.
		if (player.isActive) {
			clearTimeout(hideControlsTimer);
			controls().setVisible(true);
		}
	});
});

async function detectVr() {
	try {
		vrSupported = (await navigator.xr?.isSessionSupported('immersive-vr')) === true;
	} catch {
		vrSupported = false;
	}
	lobby.setXrHint(vrSupported
		? 'The theatre opens in VR.'
		: 'No VR headset detected: the theatre opens in 3D preview mode (drag to look around).');
}

detectVr();
lobby.restore();
