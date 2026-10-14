// Meta Horizon Store branded art, drawn in headless Chrome from the icon,
// the app's font and an in-app render (capture.mjs --store), into
// store/horizon/assets/:
// covers (landscape, square, portrait, hero, mini landscape) with the title,
// the transparent logo and the square icon. Sizes from Meta's asset
// guidelines; the title stays out of the top 20 % and bottom 30 %.
//
//   npm run store-assets

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { launchBrowser } from '../browser.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../..');
const outDir = path.join(root, 'store/horizon/assets');

const COVERS = [
	{ name: 'cover-landscape', width: 2560, height: 1440, layout: 'row' },
	{ name: 'cover-square', width: 1440, height: 1440, layout: 'column' },
	{ name: 'cover-portrait', width: 1008, height: 1440, layout: 'column' },
	{ name: 'hero', width: 3000, height: 900, layout: 'row' },
	{ name: 'mini-landscape', width: 1080, height: 360, layout: 'row' },
];

const dataUrl = (file, type) => `data:${type};base64,${fs.readFileSync(file).toString('base64')}`;

/** The app icon; square corners for the store (`rounded` keeps the app's). */
function iconSvg(rounded) {
	const svg = fs.readFileSync(path.join(root, 'public/icon.svg'), 'utf8');
	return rounded ? svg : svg.replace('rx="96" fill="#0b0710"', 'fill="#0b0710"');
}

function page({ width, height, layout, background, transparent }) {
	const short = Math.min(width, height);
	// Title size: the row layouts fit icon + title across, the columns stack them.
	// The logo fills its canvas; covers keep the title in the middle band.
	let title = layout === 'row' ? height * (height / width > 0.4 ? 0.13 : 0.2) : width * 0.15;
	if (transparent) title = height * 0.55;
	const icon = layout === 'row' ? title * 1.45 : short * 0.3;
	const band = transparent ? 'top: 0; bottom: 0; left: 0; right: 0;' : 'left: 6%; right: 6%; top: 20%; bottom: 30%;';
	const font = dataUrl(path.join(root, 'node_modules/@fontsource/inter/files/inter-latin-700-normal.woff2'), 'font/woff2');
	return `<!doctype html><html><head><style>
		@font-face { font-family: Inter; font-weight: 700; src: url(${font}) format('woff2'); }
		html, body { margin: 0; width: ${width}px; height: ${height}px; overflow: hidden; background: ${transparent ? 'transparent' : '#0b0710'}; }
		.bg { position: absolute; inset: -4%; background: url(${background ?? ''}) center 40% / cover no-repeat; filter: blur(${short * 0.012}px); }
		/* Darker at the edges, so the title reads over the picture. */
		.shade { position: absolute; inset: 0; background: radial-gradient(ellipse at 50% 45%, rgba(11,7,16,0.35), rgba(11,7,16,0.85) 75%); }
		/* Kept between 20 % from the top and 30 % from the bottom. */
		.safe { position: absolute; ${band} display: flex; align-items: center; justify-content: center;
			flex-direction: ${layout === 'row' ? 'row' : 'column'}; gap: ${layout === 'row' ? title * 0.35 : short * 0.04}px; }
		.icon { width: ${icon}px; height: ${icon}px; }
		.icon svg { width: 100%; height: 100%; display: block; }
		.title { font: 700 ${title}px/1 Inter, sans-serif; letter-spacing: -0.02em; white-space: nowrap; padding: 0.06em 0.02em 0.2em;
			-webkit-background-clip: text; background-clip: text; color: transparent;
			${transparent
				// Logo: brand colours with a tight dark halo, readable on light and dark art alike.
				? 'background-image: linear-gradient(100deg, #b56ad0, #0aa8e0); filter: drop-shadow(0 0 0.012em rgba(11,7,16,0.9)) drop-shadow(0 0 0.012em rgba(11,7,16,0.9));'
				: 'background-image: linear-gradient(100deg, #ffffff 0%, #ffffff 45%, #c9a3d8 75%, #8fd6f2 100%); filter: drop-shadow(0 0.04em 0.12em rgba(0,0,0,0.6));'} }
	</style></head><body>
		${background ? '<div class="bg"></div><div class="shade"></div>' : ''}
		<div class="safe"><div class="icon">${iconSvg(true)}</div><div class="title">JellyTheatre</div></div>
	</body></html>`;
}

/** Meta wants 24-bit PNGs (no alpha) for everything but the logo. */
function toRgb(file) {
	const tmp = `${file}.tmp.png`;
	const result = spawnSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-i', file, '-pix_fmt', 'rgb24', tmp]);
	if (result.status !== 0) throw new Error(`ffmpeg failed on ${file}: ${result.stderr}`);
	fs.renameSync(tmp, file);
}

async function main() {
	const backgroundFile = path.join(outDir, 'background-environment-theater.png');
	if (!fs.existsSync(backgroundFile)) throw new Error('Run capture.mjs --store first (npm run store-assets).');
	const background = dataUrl(backgroundFile, 'image/png');
	const browser = await launchBrowser();
	try {
		const tab = await browser.newPage();
		const render = async (name, options, { transparent = false } = {}) => {
			await tab.setViewport({ width: options.width, height: options.height });
			await tab.setContent(page({ ...options, transparent }), { waitUntil: 'load' });
			await tab.evaluate(() => document.fonts.ready);
			const file = path.join(outDir, `${name}.png`);
			await tab.screenshot({ path: file, omitBackground: transparent });
			if (!transparent) toRgb(file);
			console.log(`store/horizon/assets/${name}.png`);
		};

		for (const cover of COVERS) await render(cover.name, { ...cover, background });

		// Logo: icon and title on transparency (the store puts it on its own art).
		await render('logo', { width: 2400, height: 520, layout: 'row' }, { transparent: true });

		// Icon: square corners, opaque.
		await tab.setViewport({ width: 512, height: 512 });
		await tab.setContent(`<!doctype html><html><body style="margin:0">${iconSvg(false).replace('<svg ', '<svg width="512" height="512" ')}</body></html>`);
		const icon = path.join(outDir, 'icon.png');
		await tab.screenshot({ path: icon });
		toRgb(icon);
		console.log('store/horizon/assets/icon.png');
	} finally {
		await browser.close();
	}
}

main().catch((error) => {
	console.error(error);
	process.exit(1);
});
