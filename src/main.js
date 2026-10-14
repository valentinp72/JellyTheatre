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
import './ui/settings-panel.js';
import './ui/icons.js';
import './ui/grab-move.js';
import { enableAllRaycastLayers } from './xr/panel-layer.js';
import './ui/player-controls.js';
import './player/video-screen.js';
import './player/player-input.js';
import './player/view-controls.js';
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
const settingsEl = document.getElementById('settings-panel');
const backButton = document.getElementById('back-to-lobby');

const player = new Player();
let session = null;
let vrSupported = false;
let arSupported = false;
let currentEnvironment = null;
let hideControlsTimer = null;
let grabbingControls = false;
// Set while restarting the XR session for another environment.
let switchingSession = false;
// Episode whose "Up next" prompt was dismissed: don't offer again at its end.
let upNextDismissedFor = null;

const sceneReady = new Promise((resolve) => {
	if (sceneEl.hasLoaded) resolve();
	else sceneEl.addEventListener('loaded', resolve, { once: true });
});

const library = () => libraryEl.components['library-panel'];
const controls = () => controlsEl.components['player-controls'];
const upNext = () => upNextEl.components['up-next'];
const settings = () => settingsEl.components['settings-panel'];
const environmentKey = () => (environments[getSetting('environment')] ? getSetting('environment') : DEFAULT_ENVIRONMENT);
const environment = () => environmentEl.components[environments[currentEnvironment].component];

/**
 * The library panel goes on the cinema screen, or close to the user. It is a
 * child of the rig (so it follows the user in "close" mode); on the screen,
 * its rig-local pose is recomputed whenever the rig moves.
 */
function placeLibrary() {
	const object = libraryEl.object3D;
	if (getSetting('menuOnScreen')) {
		const { maxWidth, maxHeight } = environments[currentEnvironment].layout.screen;
		const scale = Math.min(maxWidth / 2.3, maxHeight / 1.42) * 0.96;
		// Follow the screen's actual pose (it can be moved in passthrough).
		screenEl.object3D.updateMatrixWorld();
		const world = new THREE.Matrix4()
			.copy(screenEl.object3D.matrixWorld)
			.multiply(new THREE.Matrix4().compose(new THREE.Vector3(0, 0, 0.05), new THREE.Quaternion(), new THREE.Vector3(scale, scale, scale)));
		rigEl.object3D.updateMatrixWorld();
		world.premultiply(new THREE.Matrix4().copy(rigEl.object3D.matrixWorld).invert());
		world.decompose(object.position, object.quaternion, object.scale);
	} else {
		// 2 m away, or closer in a small room (scaled to look the same).
		const distance = environments[currentEnvironment].layout.menuDistance ?? 2;
		object.position.set(0, 1.28, -distance);
		object.rotation.set(THREE.MathUtils.degToRad(-4), 0, 0);
		object.scale.setScalar(distance / 2);
	}
}

/** Applies "Sharper rendering": must happen before the XR session starts. */
function applyRenderQuality() {
	const high = getSetting('highResolution');
	sceneEl.renderer.xr.setFramebufferScaleFactor(high ? HIGH_RESOLUTION_SCALE : 1);
}

function setupEnvironment(key) {
	if (currentEnvironment) environmentEl.removeAttribute(environments[currentEnvironment].component);
	currentEnvironment = key;
	const { component, layout } = environments[key];
	environmentEl.setAttribute(component, '');
	// Passthrough: no background, so the real room shows through.
	if (layout.ar) sceneEl.removeAttribute('background');
	else sceneEl.setAttribute('background', 'color: #000000');
	const { position, maxWidth, maxHeight } = layout.screen;
	screenEl.object3D.position.set(position.x, position.y, position.z);
	screenEl.setAttribute('video-screen', { maxWidth, maxHeight });
	rigEl.object3D.position.set(layout.seat.x, layout.seat.y, layout.seat.z);
	screenEl.object3D.quaternion.identity();
	updateColorSampling();
	sceneEl.setAttribute('view-controls', { target: position, seat: layout.seat });
	setScreenMovable(Boolean(layout.ar));
	environment()?.setHouseLights(!player.isActive);
	placeLibrary();
}

/**
 * In passthrough the screen can be grabbed and moved (and its position is
 * remembered); elsewhere it belongs to the room.
 */
function setScreenMovable(movable) {
	if (movable) {
		// Trigger presses still "pass through" it (they toggle the controls).
		screenEl.setAttribute('data-trigger-passes', '');
		screenEl.classList.add('clickable');
		screenEl.setAttribute('grab-move', { storageKey: 'jellytheatre.screenPose.passthrough', handles: '#library-panel', pushPull: true });
	} else {
		screenEl.removeAttribute('grab-move');
		screenEl.classList.remove('clickable');
		screenEl.removeAttribute('data-trigger-passes');
	}
	screenMoved();
}

/** Things anchored to the screen follow it. */
function screenMoved() {
	screenEl.object3D.updateMatrixWorld();
	const position = new THREE.Vector3().setFromMatrixPosition(screenEl.object3D.matrixWorld);
	sceneEl.setAttribute('view-controls', 'target', position);
	placeLibrary();
}

/** The picture is only read when the room is lit by it. */
function updateColorSampling() {
	const used = Boolean(environments[currentEnvironment]?.layout.screenLight) && getSetting('screenLight') !== 'off';
	screenEl.setAttribute('video-screen', 'sampleColor', used);
}

/** Starts the immersive session the current environment needs. */
function enterImmersive() {
	applyRenderQuality();
	const wantsAr = environments[currentEnvironment].layout.ar && arSupported;
	return wantsAr ? sceneEl.enterAR() : sceneEl.enterVR();
}

/**
 * Switching to or from passthrough needs another kind of XR session: end
 * this one and start the other (the settings click is a user gesture).
 */
async function switchEnvironment(key) {
	const sessionKind = (k) => Boolean(environments[k].layout.ar && arSupported);
	const restart = sceneEl.is('vr-mode') || sceneEl.is('ar-mode');
	const needsNewSession = restart && sessionKind(key) !== sessionKind(currentEnvironment);
	setupEnvironment(key);
	if (!needsNewSession) {
		sceneEl.components['view-controls'].backToSeat();
		return;
	}
	switchingSession = true;
	try {
		await sceneEl.exitVR();
		await enterImmersive();
	} catch (error) {
		console.error(error);
		library().setNotice('Press "Enter the theatre" to continue in the new environment.');
		showLobby();
	} finally {
		switchingSession = false;
	}
}

function showControls() {
	if (!player.isActive && !player.loading) return;
	controls().setVisible(true);
	clearTimeout(hideControlsTimer);
	hideControlsTimer = setTimeout(() => {
		if (!player.video.paused && !grabbingControls) controls().setVisible(false);
	}, CONTROLS_HIDE_DELAY_MS);
}

/** The settings panel can be opened anytime, even during a film. */
/** @param {string} [category] settings tab to open (e.g. 'subtitles') */
function openSettings(category) {
	settings().setVisible(true, typeof category === 'string' ? category : undefined);
}

function closeSettings() {
	settings().setVisible(false);
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
			enterImmersive().catch((error) => {
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
sceneEl.addEventListener('exit-vr', () => {
	if (!switchingSession) showLobby();
});
sceneEl.addEventListener('enter-vr', () => {
	// No foveation in high quality: it blurs the edges of menus and text.
	sceneEl.renderer.xr.setFoveation(getSetting('highResolution') ? 0 : 1);
});

sceneReady.then(() => {
	setupEnvironment(environmentKey());
	enableAllRaycastLayers(sceneEl);
	libraryEl.addEventListener('panel-layer-failed', () => {
		library().setNotice('Crisp text unavailable here: using normal rendering.');
	});
	libraryEl.setAttribute('panel-layer', 'enabled', getSetting('crispLibrary'));
	window.addEventListener('settingchange', ({ detail }) => {
		if (detail.name === 'menuOnScreen') placeLibrary();
		if (detail.name === 'screenLight') updateColorSampling();
		if (detail.name === 'environment' && environmentKey() !== currentEnvironment) switchEnvironment(environmentKey());
		if (detail.name === 'crispLibrary') libraryEl.setAttribute('panel-layer', 'enabled', detail.value);
	});
	sceneEl.addEventListener('rig-moved', () => {
		if (getSetting('menuOnScreen')) placeLibrary();
	});
	window.addEventListener('settingaction', ({ detail }) => {
		const view = sceneEl.components['view-controls'];
		if (detail.name === 'resetControls') controlsEl.components['grab-move'].reset();
		else if (detail.name === 'resetScreen') screenEl.components['grab-move']?.reset();
		else if (detail.name === 'recenter') view.recenter();
		else if (detail.name === 'backToSeat') view.backToSeat();
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
	controlsEl.addEventListener('settings-request', ({ detail }) => openSettings(detail?.category));
	libraryEl.addEventListener('settings-request', openSettings);
	settingsEl.addEventListener('close-request', closeSettings);
	screenEl.addEventListener('grab-moving', screenMoved);
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
		arSupported = (await navigator.xr?.isSessionSupported('immersive-ar')) === true;
	} catch {
		vrSupported = false;
	}
	lobby.setXrHint(vrSupported
		? 'The theatre opens in VR.'
		: 'No VR headset detected: the theatre opens in 3D preview mode (drag to look around).');
}

detectVr();
lobby.restore();
