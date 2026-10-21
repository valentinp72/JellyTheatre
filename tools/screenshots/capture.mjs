// Takes JellyTheatre's screenshots against a fake Jellyfin server:
// - public/environments/<key>.jpg: the environment picker's cards;
// - docs/screenshots/*.png: the README screenshots.
//
//   npm run screenshots
//
// With --store (npm run store-assets), it writes the Meta Horizon Store
// screenshots instead: a few of the same shots at 2560 × 1440, into
// store/horizon/assets/ (not committed). store-art.mjs then makes the covers.
//
// The library is Blender's open movies (open-movies.mjs): posters and a clip
// are downloaded once into .cache/open-movies/. Without network, it falls
// back to the invented library and a generated clip.
//
// Needs Chrome or Chromium (set CHROME_PATH if it isn't found) and ffmpeg.

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { preview } from 'vite';
import { launchBrowser } from '../browser.mjs';
import { startMockJellyfin } from './mock-jellyfin.mjs';
import { prepareOpenMovies } from './open-movies.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../..');
const cacheDir = path.join(here, '.cache');
const openMoviesDir = path.join(cacheDir, 'open-movies');
const docsDir = path.join(root, 'docs/screenshots');
const thumbsDir = path.join(root, 'public/environments');
const storeDir = path.join(root, 'store/horizon/assets');
const MOCK_PORT = 8096;
const STORE = process.argv.includes('--store');
// The store's screenshots (Meta asks for five), in listing order.
const STORE_SHOTS = ['library-movies', 'playing', 'series', 'environment-station', 'environment-cabin'];
// Clean renders the covers are drawn on (not listed as screenshots).
const STORE_BACKGROUNDS = ['environment-theater', 'environment-home'];
// Environments with a picker card captured here ("My room" is your real room).
const ENVIRONMENTS = ['theater', 'beds', 'home', 'station', 'cabin', 'jungle', 'void'];
// The open-movie clip's frame (seconds) shown on each environment's screen:
// paused on calm shots rather than wherever playback happens to be (the
// clip's last seconds, a brain on a plate, got a store screenshot flagged).
const ENVIRONMENT_FRAMES = { theater: 8, beds: 16, home: 12, station: 30, cabin: 1, jungle: 20, void: 6 };
// Where the camera looks (pitch, radians): up at the screen above beds or a hammock.
const ENVIRONMENT_PITCH = { jungle: 0.78 };
// Or from another spot (eyes, yaw, pitch): the bed cinema from its back
// corner, to show the beds.
const ENVIRONMENT_VIEWPOINT = { beds: { eyes: [-4.4, 3.2, 5.2], yaw: -0.3, pitch: 0.15 } };

/** Fallback: a colorful test clip (generated fractal zoom) and invented subtitles. */
function prepareMedia() {
	fs.mkdirSync(cacheDir, { recursive: true });
	const clip = path.join(cacheDir, 'test.mp4');
	if (!fs.existsSync(clip)) {
		const result = spawnSync('ffmpeg', [
			'-hide_banner', '-loglevel', 'error', '-y',
			'-f', 'lavfi', '-i', 'mandelbrot=size=1280x720:rate=24',
			'-f', 'lavfi', '-i', 'sine=frequency=220',
			'-t', '40', '-pix_fmt', 'yuv420p', '-c:v', 'libx264', '-c:a', 'aac', '-movflags', '+faststart', clip,
		]);
		if (result.status !== 0) {
			console.warn('ffmpeg unavailable: the shots with a film playing are skipped.');
			return false;
		}
	}
	fs.writeFileSync(path.join(cacheDir, 'test.vtt'), 'WEBVTT\n\n00:00:00.000 --> 00:01:00.000\nThe coastline moved again last night.\n');
	return true;
}

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function main() {
	const open = await prepareOpenMovies(openMoviesDir);
	const hasVideo = open || prepareMedia();
	fs.mkdirSync(STORE ? storeDir : docsDir, { recursive: true });
	fs.mkdirSync(thumbsDir, { recursive: true });

	const mock = open
		? await startMockJellyfin({ port: MOCK_PORT, mediaDir: openMoviesDir, library: 'open' })
		: await startMockJellyfin({ port: MOCK_PORT, mediaDir: cacheDir });
	const server = await preview({ root, logLevel: 'warn', preview: { port: 4175, strictPort: true, host: '127.0.0.1' } });
	const appUrl = server.resolvedUrls.local[0];
	const browser = await launchBrowser();

	try {
		const page = await browser.newPage();
		await page.setViewport({ width: 1280, height: 720 });
		page.on('pageerror', (error) => console.error('page error:', error.message));

		const shot = async (name) => {
			if (!STORE) {
				await page.screenshot({ path: path.join(docsDir, `${name}.png`) });
				console.log(`docs/screenshots/${name}.png`);
				return;
			}
			const index = STORE_SHOTS.indexOf(name);
			if (index < 0 && !STORE_BACKGROUNDS.includes(name)) return;
			// Same framing, rendered at twice the resolution.
			await page.setViewport({ width: 1280, height: 720, deviceScaleFactor: 2 });
			await wait(1200);
			const file = index >= 0 ? `screenshot-${index + 1}-${name}.png` : `background-${name}.png`;
			await page.screenshot({ path: path.join(storeDir, file) });
			console.log(`store/horizon/assets/${file}`);
			await page.setViewport({ width: 1280, height: 720 });
			await wait(400);
		};
		// Helpers running in the page.
		const look = (yaw, pitch) => page.evaluate((y, p) => {
			const controls = document.querySelector('#camera').components['look-controls'];
			controls.yawObject.rotation.y = y;
			controls.pitchObject.rotation.x = p;
		}, yaw, pitch);
		const clickButton = (panel, label) => page.evaluate((panel, label) => {
			const button = [...document.querySelectorAll(`${panel} [ui-button]`)].find((b) => b.getAttribute('ui-button').label.startsWith(label) && b.classList.contains('clickable'));
			if (!button) throw new Error(`No button "${label}" in ${panel}`);
			button.emit('click');
		}, panel, label);
		const clickFirstPoster = () => page.evaluate(() => document.querySelector('#library-panel [ui-poster].clickable').emit('click'));
		const setting = (name, value) => page.evaluate((name, value) => {
			const row = document.querySelector('#settings-panel').components['settings-panel'].rows.find((r) => r.setting.name === name);
			// Click through the values until the wanted one (booleans and choices).
			for (let i = 0; i < 8; i++) {
				const current = JSON.parse(localStorage.getItem('jellytheatre.settings') ?? '{}')[name] ?? row.setting.default;
				if (current === value) return;
				row.value.emit('click');
			}
		}, name, value);
		const chooseEnvironment = (key) => page.evaluate((key) => {
			const panel = document.querySelector('#settings-panel').components['settings-panel'];
			panel.showPicker(panel.rows.find((r) => r.setting.name === 'environment').setting);
			const index = panel.pickerSetting.options.findIndex((o) => o.value === key);
			panel.picker.children[index].emit('click');
		}, key);
		const show = (id, visible) => page.evaluate((id, visible) => {
			const el = document.getElementById(id);
			const component = el.components['settings-panel'] ?? el.components['player-controls'] ?? el.components['library-panel'];
			component.setVisible(visible);
		}, id, visible);

		// Signed in, in the lobby.
		await page.goto(appUrl, { waitUntil: 'networkidle0' });
		await page.evaluate((port) => {
			localStorage.clear();
			localStorage.setItem('jellytheatre.session', JSON.stringify({ serverUrl: `http://localhost:${port}`, serverName: 'Home', accessToken: 'token', userId: 'user', userName: 'Alex' }));
			localStorage.setItem('jellytheatre.settings', JSON.stringify({ roomBrightness: 'normal' }));
		}, MOCK_PORT);
		await page.reload({ waitUntil: 'networkidle0' });
		await wait(1500);
		await shot('lobby');

		await page.click('[data-action=enter]');
		await page.evaluate(() => { document.getElementById('back-to-lobby').style.display = 'none'; });
		await wait(3500);
		await look(0, 0);
		await wait(500);
		await shot('theatre-library');

		// Menus up close (library close to the viewer) for readable shots.
		await clickButton('#library-panel', 'Settings');
		await wait(300);
		await setting('menuOnScreen', false);
		await show('settings-panel', false);
		await look(0, -0.02);
		await clickButton('#library-panel', 'Movies');
		await wait(1500);
		await shot('library-movies');
		await clickFirstPoster();
		await wait(1500);
		await shot('details');
		await clickButton('#library-panel', '‹ Back');
		await clickButton('#library-panel', 'Shows');
		await wait(800);
		await clickFirstPoster();
		await wait(1500);
		await shot('series');

		await clickButton('#library-panel', 'Settings');
		await wait(500);
		await look(0, -0.1);
		await shot('settings');
		await page.evaluate(() => {
			const panel = document.querySelector('#settings-panel').components['settings-panel'];
			panel.showPicker(panel.rows.find((r) => r.setting.name === 'environment').setting);
		});
		await wait(800);
		await shot('environments');
		await setting('menuOnScreen', true);
		await show('settings-panel', false);

		// A film playing in each environment (lights up for the picker cards).
		if (hasVideo) {
			await clickButton('#library-panel', 'Continue watching');
			await wait(800);
			await clickFirstPoster();
			await wait(800);
			await clickButton('#library-panel', 'Play from start');
			await wait(4000);
			await look(0, -0.42);
			await page.evaluate(() => document.querySelector('#player-controls').emit('activity'));
			await wait(500);
			await shot('playing');

			// Pointing at the seek bar: the preview (a fake pointer, at 60 %).
			await page.evaluate(() => {
				const controls = document.querySelector('#player-controls').components['player-controls'];
				const bar = controls.bar.object3D;
				const point = new AFRAME.THREE.Vector3(0.6 * 0.52 - 0.26, 0, 0);
				bar.localToWorld(point);
				controls.pointers.add({ components: { raycaster: { getIntersection: () => ({ point: point.clone() }) } } });
			});
			await wait(1200);
			await shot('seek-preview');
			await page.evaluate(() => document.querySelector('#player-controls').components['player-controls'].pointers.clear());

			// Subtitle settings, with the dark box style.
			await page.evaluate(() => document.querySelector('#settings-panel').components['settings-panel'].setVisible(true, 'subtitles'));
			await setting('subtitleStyle', 'box');
			await look(0, -0.15);
			await wait(800);
			await shot('subtitle-settings');
			await setting('subtitleStyle', 'outline');
			await show('settings-panel', false);
		}
		for (const key of ENVIRONMENTS) {
			await chooseEnvironment(key);
			await show('settings-panel', false);
			if (open) {
				await page.evaluate((time) => {
					const video = document.querySelector('video');
					video.pause();
					video.currentTime = time;
				}, ENVIRONMENT_FRAMES[key]);
			}
			await wait(1500);
			await page.evaluate(() => {
				document.querySelector('#player-controls').components['player-controls'].setVisible(false);
				const environment = document.querySelector('#environment');
				const component = Object.values(environment.components).find((c) => c.setHouseLights);
				component.setHouseLights(true);
			});
			const viewpoint = ENVIRONMENT_VIEWPOINT[key];
			if (viewpoint) {
				await page.evaluate(([x, y, z]) => {
					const camera = document.querySelector('#camera').object3D;
					document.querySelector('#rig').object3D.position.set(x, y, z).sub(camera.position);
				}, viewpoint.eyes);
			}
			await look(viewpoint?.yaw ?? 0, viewpoint?.pitch ?? ENVIRONMENT_PITCH[key] ?? 0.02);
			await wait(2800);
			await shot(`environment-${key}`);
			if (STORE) continue;
			await page.setViewport({ width: 640, height: 360 });
			await wait(400);
			await page.screenshot({ path: path.join(thumbsDir, `${key}.jpg`), type: 'jpeg', quality: 82 });
			console.log(`public/environments/${key}.jpg`);
			await page.setViewport({ width: 1280, height: 720 });
		}
	} finally {
		await browser.close();
		await server.close();
		mock.close();
	}
}

main().catch((error) => {
	console.error(error);
	process.exit(1);
});
