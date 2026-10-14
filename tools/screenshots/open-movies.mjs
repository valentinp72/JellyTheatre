// The library shown in the screenshots: Blender's open movies (Creative
// Commons Attribution, credited in the README). Posters and one short clip
// are downloaded from Wikimedia Commons into the cache on first use; nothing
// here is committed.
//
// Licences checked on Commons (2026-10): every file used is CC BY (2.5, 3.0
// or 4.0). The Tears of Steel soundtrack is CC BY-ND, so the clip is silent.

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const USER_AGENT = 'JellyTheatre-screenshots/1.0 (https://github.com/valentinp72/JellyTheatre)';

/**
 * Films, in library order. `poster` is a portrait poster on Commons, or
 * `frame`: an image or a video (at `at` seconds) made into a poster with the
 * title. `minutes` is the real running time.
 */
export const OPEN_MOVIES = [
	{ name: 'Sintel', year: 2010, minutes: 15, genres: ['Animation', 'Fantasy'], width: 4096, height: 1744, poster: 'File:Sintel poster.jpg', overview: 'A lonely young woman searches the wilderness for the baby dragon she once rescued and raised.' },
	{ name: 'Tears of Steel', year: 2012, minutes: 12, genres: ['Science fiction'], width: 1920, height: 800, poster: 'File:Tos-poster.png', overview: 'In a future Amsterdam overrun by robots, a group of scientists try to save the world by replaying the moment a relationship fell apart.' },
	{ name: 'Big Buck Bunny', year: 2008, minutes: 10, genres: ['Animation', 'Comedy'], width: 3840, height: 2160, poster: 'File:Big buck bunny poster big.jpg', overview: 'A gentle giant rabbit has had enough of the three rodents bullying the forest, and plans his revenge.' },
	{ name: 'Spring', year: 2019, minutes: 8, genres: ['Animation', 'Fantasy'], width: 2048, height: 858, poster: 'File:Spring2019PillarPosterBlender.jpg', overview: 'A shepherd girl and her dog face ancient spirits to keep the cycle of life going.' },
	{ name: 'Sprite Fright', year: 2021, minutes: 10, genres: ['Animation', 'Comedy', 'Horror'], width: 2048, height: 858, poster: 'File:Sprite Fright-movie poster.jpg', overview: 'A group of rowdy teenagers on a woodland trip meet the forest\'s small, cute and surprisingly dangerous mushroom sprites.' },
	{ name: 'Charge', year: 2022, minutes: 4, genres: ['Animation', 'Action'], width: 3840, height: 1608, poster: 'File:Charge-movie poster.jpg', overview: 'In a world short on energy, an old man breaks into a guarded power plant.' },
	{ name: 'Cosmos Laundromat', year: 2015, minutes: 12, genres: ['Animation', 'Comedy', 'Drama'], width: 2048, height: 858, poster: 'File:CosmosLaundromatPoster.jpg', overview: 'On a desolate island, a depressed sheep named Franck meets a mysterious salesman who offers him a whole new life.' },
	{ name: 'Elephants Dream', year: 2006, minutes: 11, genres: ['Animation', 'Science fiction'], width: 1920, height: 1080, frame: 'File:Elephants Dream (2006) 1080p24.webm', at: 120, overview: 'Two men explore the strange, endless machine they live in, but each sees it very differently.' },
	{ name: 'Coffee Run', year: 2020, minutes: 3, genres: ['Animation', 'Drama'], width: 1920, height: 804, poster: 'File:Coffee Run-movie poster.png', overview: 'Fuelled by caffeine, a young woman races through the bittersweet memories of a past relationship.' },
	{ name: 'Wing It!', year: 2023, minutes: 4, genres: ['Animation', 'Comedy'], width: 1920, height: 1080, frame: 'File:WING IT! - Blender Open Movie-full movie.webm', at: 95, overview: 'A homemade flying machine, a very questionable first flight.' },
	{ name: 'Hero', year: 2018, minutes: 4, genres: ['Animation', 'Action'], width: 2048, height: 858, frame: 'File:HERO - Blender Open Movie-full movie.webm', at: 60, overview: 'A hand-drawn action short, made in 3D with Blender\'s Grease Pencil.' },
	{ name: 'Glass Half', year: 2015, minutes: 3, genres: ['Animation', 'Comedy'], width: 3840, height: 2160, frame: 'File:Glass Half - Blender Open Movie-full movie.webm', at: 70, overview: 'Two art critics in a gallery cannot agree on anything, starting with what they are looking at.' },
];

/** The series: the Caminandes shorts, as one season. */
export const OPEN_SERIES = {
	name: 'Caminandes',
	year: 2013,
	frame: 'File:Caminandes 3 - Llamigos - Blender Animated Short.webm', at: 45,
	overview: 'Koro the llama takes on the wilds of Patagonia, one stubborn problem at a time.',
	episodes: [
		// Gran Dillama's video is CC BY-SA: no still of it (the card shows the series').
		{ name: 'Llama Drama', minutes: 2, frame: 'File:Caminandes- Llama Drama - Short Movie.ogv', at: 50 },
		{ name: 'Gran Dillama', minutes: 3 },
		{ name: 'Llamigos', minutes: 3, frame: 'File:Caminandes 3 - Llamigos - Blender Animated Short.webm', at: 100 },
	],
};

/** The film that plays: a 40 s clip of Tears of Steel, with its subtitles. */
const CLIP = {
	video: 'File:Tears of Steel 1080p.webm',
	start: 22,
	duration: 40,
	subtitles: 'https://download.blender.org/demo/movies/ToS/subtitles/TOS-en.srt',
};
/** Chapters of the clip (seconds into it). */
export const CLIP_CHAPTERS = [['The bridge', 0], ['Forty years later', 21], ['Memory sync', 28]];

export function slug(title) {
	return title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
}

async function fetchOk(url) {
	for (let attempt = 0; ; attempt++) {
		const response = await fetch(url, { headers: { 'User-Agent': USER_AGENT } });
		if (response.ok) return response;
		// Commons rate-limits bursts: wait and retry.
		if (attempt >= 4 || ![429, 503].includes(response.status)) throw new Error(`${response.status} for ${url}`);
		await new Promise((resolve) => setTimeout(resolve, 3000 * (attempt + 1)));
	}
}

/** Direct URL of a Commons file, scaled to `width` for images. */
async function commonsUrl(title, width) {
	const params = new URLSearchParams({ action: 'query', titles: title, prop: 'imageinfo', iiprop: 'url', format: 'json', ...(width ? { iiurlwidth: String(width) } : {}) });
	const data = await (await fetchOk(`https://commons.wikimedia.org/w/api.php?${params}`)).json();
	const info = Object.values(data.query.pages)[0].imageinfo?.[0];
	if (!info) throw new Error(`Not on Commons: ${title}`);
	return width && info.thumburl ? info.thumburl : info.url;
}

async function download(url, file) {
	fs.writeFileSync(file, Buffer.from(await (await fetchOk(url)).arrayBuffer()));
}

/** ffmpeg arguments to read a URL (seeking with range requests). */
const remoteInput = (url) => ['-user_agent', USER_AGENT, '-i', url];

/** Runs ffmpeg, retrying (Commons rate-limits bursts) until `output` exists. */
async function ffmpeg(args, output) {
	for (let attempt = 0; ; attempt++) {
		const result = spawnSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', ...args]);
		if (result.status === 0 && (!output || fs.existsSync(output))) return;
		if (attempt >= 4) throw new Error(`ffmpeg failed: ${result.stderr || `no ${output}`}`);
		await new Promise((resolve) => setTimeout(resolve, 5000 * (attempt + 1)));
	}
}

/** "00:01:02,500" → seconds. */
function srtTime(text) {
	const [h, m, s] = text.replace(',', '.').split(':').map(Number);
	return h * 3600 + m * 60 + s;
}

function vttTime(seconds) {
	const pad = (n, width = 2) => String(n).padStart(width, '0');
	const ms = Math.round(seconds * 1000);
	return `${pad(Math.floor(ms / 3_600_000))}:${pad(Math.floor(ms / 60_000) % 60)}:${pad(Math.floor(ms / 1000) % 60)}.${pad(ms % 1000, 3)}`;
}

/** The clip's part of an SRT file, as WebVTT starting at 0. */
function clipSubtitles(srt) {
	const cues = [];
	for (const block of srt.replace(/\r/g, '').split(/\n\n+/)) {
		const lines = block.trim().split('\n');
		const timing = lines.findIndex((line) => line.includes('-->'));
		if (timing < 0) continue;
		const [from, to] = lines[timing].split('-->').map((t) => srtTime(t.trim()) - CLIP.start);
		if (to <= 0 || from >= CLIP.duration) continue;
		cues.push(`${vttTime(Math.max(0, from))} --> ${vttTime(Math.min(CLIP.duration, to))}\n${lines.slice(timing + 1).join('\n')}`);
	}
	return `WEBVTT\n\n${cues.join('\n\n')}\n`;
}

/**
 * Downloads what the open library needs into `dir` (once): posters/<slug>.jpg,
 * frames/<slug>.jpg (made into posters by the fake server), test.mp4,
 * test.vtt and trickplay/<n>.jpg.
 * @returns {Promise<boolean>} false if something could not be downloaded
 */
export async function prepareOpenMovies(dir) {
	try {
		for (const sub of ['posters', 'frames', 'trickplay']) fs.mkdirSync(path.join(dir, sub), { recursive: true });
		const episodes = OPEN_SERIES.episodes.filter((episode) => episode.frame);
		for (const item of [...OPEN_MOVIES, OPEN_SERIES, ...episodes]) {
			const file = path.join(dir, item.poster ? 'posters' : 'frames', `${slug(item.name)}.jpg`);
			if (fs.existsSync(file)) continue;
			console.log(`Downloading ${item.poster ?? item.frame}`);
			if (item.poster || !/\.(webm|ogv)$/.test(item.frame)) {
				// Commons thumbnails keep the format: convert to JPEG.
				const tmp = `${file}.download`;
				await download(await commonsUrl(item.poster ?? item.frame, item.poster ? 600 : 1280), tmp);
				await ffmpeg(['-i', tmp, '-q:v', '3', file], file);
				fs.rmSync(tmp);
			} else {
				// Ogg files can't seek over HTTP: decode up to the frame instead.
				const input = remoteInput(await commonsUrl(item.frame));
				const seek = ['-ss', String(item.at)];
				const args = item.frame.endsWith('.ogv') ? [...input, ...seek] : [...seek, ...input];
				await ffmpeg([...args, '-frames:v', '1', '-vf', 'scale=1280:-2', '-q:v', '3', file], file);
			}
		}
		const clip = path.join(dir, 'test.mp4');
		if (!fs.existsSync(clip)) {
			console.log(`Downloading a ${CLIP.duration} s clip of ${CLIP.video}`);
			// Silent (the soundtrack is CC BY-ND), but with an audio track like a real film.
			await ffmpeg([
				'-ss', String(CLIP.start), ...remoteInput(await commonsUrl(CLIP.video)), '-f', 'lavfi', '-i', 'anullsrc=r=48000:cl=stereo',
				'-t', String(CLIP.duration), '-map', '0:v', '-map', '1:a', '-vf', 'scale=1280:-2',
				'-c:v', 'libx264', '-preset', 'veryfast', '-crf', '20', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-movflags', '+faststart', clip,
			], clip);
			// Seek bar previews: one frame per second, 5 × 5 per tile.
			await ffmpeg(['-i', clip, '-vf', 'fps=1,scale=320:134,tile=5x5', '-q:v', '4', path.join(dir, 'trickplay/%d.jpg')]);
			for (let i = 1; fs.existsSync(path.join(dir, `trickplay/${i}.jpg`)); i++) {
				fs.renameSync(path.join(dir, `trickplay/${i}.jpg`), path.join(dir, `trickplay/tile-${i - 1}.jpg`));
			}
		}
		const vtt = path.join(dir, 'test.vtt');
		if (!fs.existsSync(vtt)) fs.writeFileSync(vtt, clipSubtitles(await (await fetchOk(CLIP.subtitles)).text()));
		return true;
	} catch (error) {
		console.warn(`Could not download the open movies (${error.message}).`);
		return false;
	}
}
