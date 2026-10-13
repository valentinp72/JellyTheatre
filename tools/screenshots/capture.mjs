// Takes JellyTheatre's screenshots against a fake Jellyfin server:
// - public/environments/<key>.jpg: the environment picker's cards;
// - docs/screenshots/*.png: the README screenshots.
//
//   npm run screenshots
//
// Needs Chrome or Chromium (set CHROME_PATH if it isn't found) and, for the
// shots with a film playing, ffmpeg (a test clip is generated once).

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer-core';
import { preview } from 'vite';
import { startMockJellyfin } from './mock-jellyfin.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../..');
const cacheDir = path.join(here, '.cache');
const docsDir = path.join(root, 'docs/screenshots');
const thumbsDir = path.join(root, 'public/environments');
const MOCK_PORT = 8096;
// Environments with a picker card captured here ("My room" is your real room).
const ENVIRONMENTS = ['theater', 'home', 'station', 'cabin', 'void'];

function findChrome() {
	const candidates = [
		process.env.CHROME_PATH,
		'/usr/bin/google-chrome',
		'/usr/bin/chromium',
		'/usr/bin/chromium-browser',
		'/snap/bin/chromium',
		'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
		'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
	].filter(Boolean);
	const found = candidates.find((candidate) => fs.existsSync(candidate));
	if (!found) throw new Error('Chrome/Chromium not found: set CHROME_PATH.');
	return found;
}

/** A colorful test clip (generated fractal zoom) and invented subtitles. */
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
	const hasVideo = prepareMedia();
	fs.mkdirSync(docsDir, { recursive: true });
	fs.mkdirSync(thumbsDir, { recursive: true });

	const mock = await startMockJellyfin({ port: MOCK_PORT, mediaDir: cacheDir });
	const server = await preview({ root, logLevel: 'warn', preview: { port: 4175, strictPort: true, host: '127.0.0.1' } });
	const appUrl = server.resolvedUrls.local[0];
	const browser = await puppeteer.launch({
		executablePath: findChrome(),
		headless: 'new',
		args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'],
	});

	try {
		const page = await browser.newPage();
		await page.setViewport({ width: 1280, height: 720 });
		page.on('pageerror', (error) => console.error('page error:', error.message));

		const shot = async (name) => {
			await page.screenshot({ path: path.join(docsDir, `${name}.png`) });
			console.log(`docs/screenshots/${name}.png`);
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
				const current = JSON.parse(localStorage.getItem('jellytheatre.settings') ?? '{}')[name];
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
		}
		for (const key of ENVIRONMENTS) {
			await chooseEnvironment(key);
			await show('settings-panel', false);
			await wait(1500);
			await page.evaluate(() => {
				document.querySelector('#player-controls').components['player-controls'].setVisible(false);
				const environment = document.querySelector('#environment');
				const component = Object.values(environment.components).find((c) => c.setHouseLights);
				component.setHouseLights(true);
			});
			await look(0, 0.02);
			await wait(2800);
			await shot(`environment-${key}`);
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
