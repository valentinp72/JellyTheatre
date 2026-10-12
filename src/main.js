import './lobby/lobby.css';
import 'aframe';
import { registerSW } from 'virtual:pwa-register';
import './scene/placeholder-room.js';
import { createLobby } from './lobby/lobby.js';

registerSW({ immediate: true });

// Instantiate the scene only now that every component is registered.
const template = document.getElementById('scene-template');
document.body.appendChild(template.content.cloneNode(true));
const sceneEl = document.querySelector('a-scene');
const environmentEl = document.getElementById('environment');
const backButton = document.getElementById('back-to-lobby');

let vrSupported = false;

const lobby = createLobby({
	onSignedIn({ user }) {
		environmentEl.setAttribute('placeholder-room', 'message', `Welcome, ${user.Name}`);
	},
	onSignedOut() {
		environmentEl.setAttribute('placeholder-room', 'message', 'Welcome to JellyTheatre');
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
	lobby.show();
}

backButton.addEventListener('click', showLobby);
sceneEl.addEventListener('exit-vr', showLobby);

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
