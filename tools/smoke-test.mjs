// End-to-end smoke test of the built app (dist/), in headless Chrome against
// the fake Jellyfin server. Quick on purpose (~30 s): sign-in, library,
// details and playback check, every environment, and playback when ffmpeg is
// available to generate a tiny clip. Fails on any page error.
//
//   npm run build && npm test

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { preview } from 'vite';
import { launchBrowser } from './browser.mjs';
import { startMockJellyfin } from './screenshots/mock-jellyfin.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MOCK_PORT = 8096;
const ENVIRONMENTS = ['theater', 'home', 'station', 'cabin', 'jungle', 'void'];

/** A 12-second clip and its subtitles; false without ffmpeg. */
function tinyClip(dir) {
	const result = spawnSync('ffmpeg', [
		'-hide_banner', '-loglevel', 'error', '-y',
		'-f', 'lavfi', '-i', 'testsrc2=size=320x180:rate=24',
		'-f', 'lavfi', '-i', 'sine=frequency=440:sample_rate=48000',
		'-t', '12', '-pix_fmt', 'yuv420p', '-c:v', 'libx264', '-c:a', 'aac', '-af', 'pan=5.1|FL=c0|FR=c0|BL=0.5*c0',
		'-movflags', '+faststart', path.join(dir, 'test.mp4'),
	]);
	fs.writeFileSync(path.join(dir, 'test.vtt'), 'WEBVTT\n\n00:00:00.000 --> 00:00:12.000\nTest.\n');
	return result.status === 0;
}

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function main() {
	if (!fs.existsSync(path.join(root, 'dist/index.html'))) throw new Error('Build the app first (npm run build).');
	const mediaDir = fs.mkdtempSync(path.join(os.tmpdir(), 'jellytheatre-test-'));
	const hasClip = tinyClip(mediaDir);
	const mock = await startMockJellyfin({ port: MOCK_PORT, mediaDir });
	const server = await preview({ root, logLevel: 'warn', preview: { port: 4176, strictPort: true, host: '127.0.0.1' } });
	const browser = await launchBrowser();
	const errors = [];
	let step = 'start';
	const started = Date.now();

	try {
		const page = await browser.newPage();
		await page.setViewport({ width: 960, height: 540 });
		page.on('pageerror', (error) => errors.push(`${step}: ${error.message}`));

		/** Waits until `check` (run in the page) returns a truthy value. */
		const expect = async (name, check, arg, timeout = 10_000) => {
			step = name;
			const deadline = Date.now() + timeout;
			let last;
			while (Date.now() < deadline) {
				last = await page.evaluate(check, arg);
				if (last) {
					console.log(`  ✓ ${name}`);
					return last;
				}
				await wait(200);
			}
			const pageErrors = errors.length ? `\nPage errors:\n${errors.join('\n')}` : '';
			throw new Error(`${name}: timed out (last value: ${JSON.stringify(last)})${pageErrors}`);
		};
		const clickButton = (panel, label) => page.evaluate((panel, label) => {
			const button = [...document.querySelectorAll(`${panel} [ui-button]`)].find((b) => b.getAttribute('ui-button').label.startsWith(label) && b.classList.contains('clickable'));
			if (!button) throw new Error(`No button "${label}" in ${panel}`);
			button.emit('click');
		}, panel, label);

		await page.goto(server.resolvedUrls.local[0], { waitUntil: 'networkidle0' });
		await page.evaluate((port) => {
			localStorage.clear();
			localStorage.setItem('jellytheatre.session', JSON.stringify({ serverUrl: `http://localhost:${port}`, serverName: 'Home', accessToken: 'token', userId: 'user', userName: 'Alex' }));
		}, MOCK_PORT);
		await page.reload({ waitUntil: 'networkidle0' });
		await expect('signed in from the stored session', () => {
			const ready = document.querySelector('[data-step="ready"]');
			return !ready.hidden && ready.textContent.includes('Alex');
		});

		await page.click('[data-action=enter]');
		await expect('library shows continue watching', () => document.querySelectorAll('#library-panel [ui-poster].clickable').length >= 1);
		await clickButton('#library-panel', 'Movies');
		await expect('movies collection loads', () => document.querySelectorAll('#library-panel [ui-poster].clickable').length >= 10);
		const watched = await page.evaluate(() => [...document.querySelectorAll('#library-panel [ui-poster].clickable')].filter((c) => c.components['ui-poster'].item.UserData?.Played).length);
		await clickButton('#library-panel', 'Hide watched');
		await expect('"Hide watched" filters out watched films', (watched) => {
			const cards = [...document.querySelectorAll('#library-panel [ui-poster].clickable')];
			return watched > 0 && cards.length > 0 && cards.every((c) => !c.components['ui-poster'].item.UserData?.Played);
		}, watched);
		await clickButton('#library-panel', 'Hide watched');
		await expect('all films back without the filter', () => document.querySelectorAll('#library-panel [ui-poster].clickable').length >= 10);
		await page.evaluate(() => document.querySelector('#library-panel [ui-poster].clickable').emit('click'));
		await expect('details page checks playback with the server', () => {
			const panel = document.querySelector('#library-panel').components['library-panel'];
			return panel.detailPlayback.getAttribute('ui-text').value.startsWith('Direct play');
		});

		await clickButton('#library-panel', 'Settings');
		await expect('settings panel opens', () => document.querySelector('#settings-panel').object3D.visible);
		for (const key of ENVIRONMENTS) {
			await page.evaluate((key) => {
				const panel = document.querySelector('#settings-panel').components['settings-panel'];
				panel.showPicker(panel.rows.find((r) => r.setting.name === 'environment').setting);
				const index = panel.pickerSetting.options.findIndex((o) => o.value === key);
				panel.picker.children[index].emit('click');
			}, key);
			await expect(`environment "${key}" builds`, (key) => Boolean(document.querySelector('#environment').components[`${key}-environment`]), key);
			if (key === 'jungle') {
				// Lying down: the eyes on the hammock, looking straight at the screen
				// above, the picture upright.
				await expect('lying down: the screen fills the view, upright', () => {
					const { Vector3 } = AFRAME.THREE;
					document.querySelector('a-scene').components['view-controls'].backToSeat();
					const camera = document.querySelector('#camera').object3D.matrixWorld;
					const screen = document.querySelector('#screen').object3D.matrixWorld;
					const head = new Vector3().setFromMatrixPosition(camera);
					const toScreen = new Vector3().setFromMatrixPosition(screen).sub(head).normalize();
					const forward = new Vector3(0, 0, -1).transformDirection(camera);
					const up = new Vector3(0, 1, 0).transformDirection(camera);
					return forward.dot(toScreen) > 0.999 && up.dot(new Vector3(0, 1, 0).transformDirection(screen)) > 0.999;
				});
			}
		}
		await clickButton('#settings-panel', 'Close');

		if (hasClip) {
			await clickButton('#library-panel', 'Play');
			await expect('a film plays', () => {
				const video = document.querySelector('video');
				return !video.paused && video.currentTime > 0.3;
			});
			await expect('5.1 sound from virtual speakers', () => {
				const spatial = document.querySelector('#player-controls').components['player-controls'].player.audio?.spatial;
				if (!spatial?.enabled || spatial.heardLayout() !== '5.1') return false;
				// The left speaker is farther from the right ear, and the other way round.
				const [left, right] = spatial.speakers;
				return left.ears[1].lateral > 0 && left.ears[0].lateral === 0 && right.ears[0].lateral > 0;
			});
			await page.evaluate(() => {
				const player = document.querySelector('#player-controls').components['player-controls'].player;
				player.selectSubtitle(player.source.subtitles[0].index);
			});
			await expect('subtitles show', () => document.querySelector('#screen').components['video-screen'].subtitles.getAttribute('ui-text').value === 'Test.');
			await expect('chapters marked on the seek bar', () => document.querySelector('#player-controls').components['player-controls'].ticks.children.length === 3);
			// The fake film has an intro from 2 to 15 s (skipping it ends this short clip).
			await page.evaluate(() => { document.querySelector('video').currentTime = 2.5; });
			await expect('"Skip intro" offered during the intro', () => {
				const button = document.querySelector('#screen').components['video-screen'].skipButton;
				return button.classList.contains('clickable') && button.getAttribute('ui-button').label === 'Skip intro';
			});
			await page.evaluate(() => document.querySelector('#screen').components['video-screen'].skipButton.emit('click'));
			await expect('skipping jumps past the intro', () => document.querySelector('video').currentTime >= 3 || document.querySelector('video').ended);
			await expect('back to the library when it ends', () => document.querySelector('#library-panel').object3D.visible, undefined, 8000);
		} else {
			console.log('  - playback skipped (no ffmpeg)');
		}

		await clickButton('#library-panel', 'Settings');
		await page.evaluate(() => document.querySelector('#settings-panel').components['settings-panel'].showList('account'));
		await clickButton('#settings-panel', 'Sign out');
		await expect('signing out offers to sign in, in the scene', () => document.querySelector('#library-panel [sign-in-view]').object3D.visible
			&& document.querySelector('#keyboard').object3D.visible);
		const type = (text) => page.evaluate((text) => {
			const keyboard = document.querySelector('#keyboard');
			for (const key of text) keyboard.emit('key', { key });
		}, text);
		await expect('the server field starts with https://', () => document.querySelector('[sign-in-view]').components['sign-in-view'].values.server === 'https://');
		// The fake server is plain HTTP (fine on this HTTP page): erase the prefix.
		await page.evaluate(() => document.querySelector('#keyboard').emit('key', { key: 'Clear' }));
		await type(`localhost:${MOCK_PORT}`);
		await clickButton('#library-panel [sign-in-view]', 'Connect');
		await expect('Quick Connect code shown in VR', () => document.querySelector('[sign-in-view]').components['sign-in-view'].codeText.getAttribute('ui-text').value === '381947');
		await clickButton('#library-panel [sign-in-view]', 'Sign in with a password');
		await type('Alex');
		await page.evaluate(() => document.querySelector('[sign-in-view]').components['sign-in-view'].fields.password.emit('click'));
		await type('secret');
		await clickButton('#library-panel [sign-in-view]', 'Sign in');
		await expect('signed in from VR: the library is back', () => !document.querySelector('[sign-in-view]').object3D.visible
			&& document.querySelectorAll('#library-panel [ui-poster].clickable').length >= 1
			&& !document.querySelector('[data-step="ready"]').hidden);

		if (errors.length) throw new Error(`Page errors:\n${errors.join('\n')}`);
		console.log(`Smoke test passed in ${((Date.now() - started) / 1000).toFixed(1)} s.`);
	} finally {
		await browser.close();
		await server.close();
		mock.close();
		fs.rmSync(mediaDir, { recursive: true, force: true });
	}
}

main().catch((error) => {
	console.error(`Smoke test failed: ${error.message}`);
	process.exit(1);
});
