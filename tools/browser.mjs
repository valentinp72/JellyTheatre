// Headless Chrome for the tools (screenshots, smoke test).

import fs from 'node:fs';
import puppeteer from 'puppeteer-core';

export function findChrome() {
	const candidates = [
		process.env.CHROME_PATH,
		'/usr/bin/google-chrome',
		'/usr/bin/google-chrome-stable',
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

/** WebGL through SwiftShader (no GPU needed), autoplay allowed. */
export function launchBrowser() {
	return puppeteer.launch({
		executablePath: findChrome(),
		headless: 'new',
		args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'],
	});
}
