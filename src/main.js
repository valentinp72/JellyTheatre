import './lobby/lobby.css';
import 'aframe';
import * as THREE from 'three';
import { registerSW } from 'virtual:pwa-register';
import './ui/text.js';
import './ui/widgets.js';
import './ui/keyboard.js';
import './ui/poster.js';
import './ui/library-panel.js';
import './ui/up-next.js';
import './ui/icons.js';
import './ui/grab-move.js';
import { enableAllRaycastLayers } from './xr/panel-layer.js';
import './ui/player-controls.js';
import './player/video-screen.js';
import './player/player-input.js';
import './environments/theater/theater.js';
import { DEFAULT_ENVIRONMENT, environments } from './environments/index.js';
import { createSources } from './jellyfin/library.js';
import { createLobby } from './lobby/lobby.js';
import { Player } from './player/player.js';
import { getSetting, setSetting } from './settings.js';

registerSW({ immediate: true });

const CONTROLS_HIDE_DELAY_MS = 5000;
// Rendering resolution when "Sharper rendering" is on (≈ Quest 3 panel resolution).
const HIGH_RESOLUTION_SCALE = 1.25;

// Instantiate the scene only now that every component is registered.
const template = document.getElementById('scene-template');
document.body.appendChild(template.content.cloneNode(true));
const sceneEl = document.querySelector('a-scene');
const environmentEl = document.getElementById('environment');
const screenEl = document.getElementById('screen');
const rigEl = document.getElementById('rig');
const libraryEl = document.getElementById('library-panel');
const controlsEl = document.getElementById('player-controls');
const upNextEl = document.getElementById('up-next');
const backButton = document.getElementById('back-to-lobby');

const player = new Player();
let session = null;
let vrSupported = false;
let hideControlsTimer = null;
let grabbingControls = false;
// Episode whose "Up next" prompt was dismissed: don't offer again at its end.
let upNextDismissedFor = null;

const sceneReady = new Promise((resolve) => {
	if (sceneEl.hasLoaded) resolve();
	else sceneEl.addEventListener('loaded', resolve, { once: true });
});

const library = () => libraryEl.components['library-panel'];
const controls = () => controlsEl.components['player-controls'];
const upNext = () => upNextEl.components['up-next'];
const environment = () => environmentEl.components[environments[DEFAULT_ENVIRONMENT].component];

/** The library panel goes on the cinema screen, or close to the seat. */
function placeLibrary() {
	const object = libraryEl.object3D;
	if (getSetting('menuOnScreen')) {
		const { layout } = environments[DEFAULT_ENVIRONMENT];
		const { position, maxWidth, maxHeight } = layout.screen;
		// Rig-local coordinates, slightly in front of the screen.
		object.position.set(position.x - layout.seat.x, position.y - layout.seat.y, position.z - layout.seat.z + 0.05);
		object.rotation.set(0, 0, 0);
		object.scale.setScalar(Math.min(maxWidth / 2.3, maxHeight / 1.42) * 0.96);
	} else {
		object.position.set(0, 1.28, -2);
		object.rotation.set(THREE.MathUtils.degToRad(-4), 0, 0);
		object.scale.setScalar(1);
	}
}

/** Applies "Sharper rendering": must happen before the XR session starts. */
function applyRenderQuality() {
	const high = getSetting('highResolution');
	sceneEl.renderer.xr.setFramebufferScaleFactor(high ? HIGH_RESOLUTION_SCALE : 1);
}

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
		if (!player.video.paused && !grabbingControls) controls().setVisible(false);
	}, CONTROLS_HIDE_DELAY_MS);
}

function startPlayback(item, startPosition, mediaSourceId) {
	upNext().close();
	library().setNotice('');
	library().setVisible(false);
	environment().setHouseLights(false);
	player.play(item, { startPosition, mediaSourceId });
	showControls();
}

function backToHome() {
	upNext().close();
	clearTimeout(hideControlsTimer);
	controls().setVisible(false);
	environment().setHouseLights(true);
	library().setVisible(true);
	// Progress changed: refresh resume points and next up.
	library().refresh();
}

const lobby = createLobby({
	async onSignedIn({ api, user }) {
		session = { api, user, sources: createSources(api, user.Id) };
		player.setSession(api, user.Id, session.sources);
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
			applyRenderQuality();
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
sceneEl.addEventListener('enter-vr', () => {
	// No foveation in high quality: it blurs the edges of menus and text.
	sceneEl.renderer.xr.setFoveation(getSetting('highResolution') ? 0 : 1);
});

sceneReady.then(() => {
	setupEnvironment(DEFAULT_ENVIRONMENT);
	placeLibrary();
	enableAllRaycastLayers(sceneEl);
	libraryEl.addEventListener('panel-layer-failed', () => {
		library().setNotice('Crisp text unavailable here: using normal rendering.');
	});
	libraryEl.setAttribute('panel-layer', 'enabled', getSetting('crispLibrary'));
	window.addEventListener('settingchange', ({ detail }) => {
		if (detail.name === 'menuOnScreen') placeLibrary();
		if (detail.name === 'crispLibrary') libraryEl.setAttribute('panel-layer', 'enabled', detail.value);
	});
	window.addEventListener('settingaction', ({ detail }) => {
		if (detail.name === 'resetControls') controlsEl.components['grab-move'].reset();
	});
	controlsEl.addEventListener('grab-start', () => {
		grabbingControls = true;
		showControls();
	});
	controlsEl.addEventListener('grab-end', () => {
		grabbingControls = false;
		showControls();
	});
	screenEl.components['video-screen'].bind(player);
	controls().bind(player);

	libraryEl.addEventListener('play-item', ({ detail }) => startPlayback(detail.item, detail.startPosition, detail.mediaSourceId));
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

	player.addEventListener('outro', ({ detail }) => offerNextEpisode(detail.item));
	player.addEventListener('ended', async ({ detail }) => {
		// A late event: something else already started playing.
		if (player.isActive || player.loading) return;
		if (upNext().isOpen()) return; // Already offered during the credits.
		if (upNextDismissedFor === detail.item?.Id || !(await offerNextEpisode(detail.item))) backToHome();
	});
	upNextEl.addEventListener('play-next', ({ detail }) => startPlayback(detail.item));
	upNextEl.addEventListener('dismiss', () => {
		// Dismissed during the credits: keep watching them.
		if (player.isActive) upNextDismissedFor = player.item.Id;
		else backToHome();
	});
	upNextEl.addEventListener('autoplay-change', ({ detail }) => setSetting('autoplayNext', detail.enabled));
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

/** Shows the "Up next" prompt after an episode. Returns whether there is a next one. */
async function offerNextEpisode(item) {
	if (item?.Type !== 'Episode' || !session) return false;
	let next = null;
	try {
		next = await session.sources.nextEpisode(item);
	} catch (error) {
		console.warn('[up-next] could not find the next episode', error);
	}
	// The user may have started something else while we were looking it up.
	if (!next || (player.isActive && player.item?.Id !== item.Id)) return false;
	upNext().offer(session.api, next, getSetting('autoplayNext'));
	return true;
}

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
