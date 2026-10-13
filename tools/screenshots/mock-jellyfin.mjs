// A fake Jellyfin server for screenshots and manual testing: an invented
// library (fictional titles, generated poster art), Quick Connect sign-in,
// playback info, progress reporting. Media come from `mediaDir` (see
// capture.mjs, which generates a test clip with ffmpeg).

import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';

const TICKS = 10_000_000;

/** Fictional films: title, year, colors for the generated poster, genres. */
const FILMS = [
	['The Lighthouse Keeper\'s Map', 2024, ['#1f3b5c', '#e0a96d'], ['Adventure', 'Drama']],
	['Orbit of Glass', 2025, ['#0b0f2a', '#7fb4ff'], ['Science fiction']],
	['Paper Mountains', 2023, ['#2e4a3b', '#d9cf9f'], ['Animation', 'Family']],
	['A Quiet Harbor', 2022, ['#24324a', '#9fc3d9'], ['Drama']],
	['Neon Tides', 2026, ['#2a0f3a', '#ff5fa2'], ['Thriller']],
	['The Last Train to Aldervale', 2021, ['#3a1f14', '#e6b36a'], ['Mystery']],
	['Salt and Starlight', 2025, ['#13283a', '#f2e3b3'], ['Romance']],
	['Clockwork Garden', 2024, ['#1d2d1a', '#c8e07a'], ['Fantasy']],
	['Winter Static', 2023, ['#20262e', '#cfe3f2'], ['Thriller', 'Drama']],
	['Echoes Under Ice', 2026, ['#0f2633', '#8fe0e8'], ['Documentary']],
	['The Copper Comet', 2022, ['#331a0f', '#ff9a3c'], ['Adventure']],
	['Midnight Cartography', 2025, ['#141a33', '#b4a0ff'], ['Drama']],
];

const SOURCES = {
	uhd: { Container: 'mkv', Bitrate: 52e6, MediaStreams: [{ Index: 0, Type: 'Video', Codec: 'hevc', Width: 3840, Height: 1600, BitDepth: 10, VideoRangeType: 'HDR10' }, { Index: 1, Type: 'Audio', Codec: 'eac3', Channels: 6, Language: 'eng', IsDefault: true }, { Index: 2, Type: 'Subtitle', Codec: 'subrip', IsTextSubtitleStream: true, Language: 'eng' }] },
	hd: { Container: 'mp4', Bitrate: 9e6, MediaStreams: [{ Index: 0, Type: 'Video', Codec: 'h264', Width: 1920, Height: 1080, BitDepth: 8, VideoRangeType: 'SDR' }, { Index: 1, Type: 'Audio', Codec: 'aac', Channels: 2, Language: 'eng', IsDefault: true }, { Index: 2, Type: 'Subtitle', Codec: 'subrip', IsTextSubtitleStream: true, Language: 'eng', IsDefault: true, DisplayTitle: 'English - SRT' }] },
};

function slug(title) {
	return title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
}

const movies = FILMS.map(([name, year, colors, genres], i) => ({
	Id: `film-${slug(name)}`,
	Name: name,
	Type: 'Movie',
	MediaType: 'Video',
	ProductionYear: year,
	RunTimeTicks: (88 + i * 7) * 60 * TICKS,
	CommunityRating: 6.4 + (i % 5) * 0.6,
	OfficialRating: ['PG', 'PG-13', '12', 'R'][i % 4],
	Genres: genres,
	Overview: `${name} is an invented film used for JellyTheatre's screenshots. It follows an unlikely crew across a world drawn entirely from generated shapes and colors.`,
	ImageTags: { Primary: 'poster' },
	MediaSourceCount: 1,
	MediaSources: [{ Id: `film-${slug(name)}`, Name: 'Main', ...(i % 3 === 0 ? SOURCES.uhd : SOURCES.hd) }],
	// Chapters and trickplay match the 40 s test clip.
	Chapters: [['Opening', 0], ['Departure', 10], ['The glass field', 20], ['Landing', 30]].map(([Name, s]) => ({ Name, StartPositionTicks: s * TICKS })),
	Trickplay: { [`film-${slug(name)}`]: { 320: { Width: 320, Height: 180, TileWidth: 5, TileHeight: 5, ThumbnailCount: 40, Interval: 1000, Bandwidth: 0 } } },
	UserData: i === 1 ? { PlaybackPositionTicks: 41 * 60 * TICKS, PlayedPercentage: 38 } : i === 4 ? { PlaybackPositionTicks: 12 * 60 * TICKS, PlayedPercentage: 12 } : i % 4 === 2 ? { Played: true } : {},
	colors,
}));

const series = { Id: 'series-cartographers', Name: 'The Cartographers', Type: 'Series', ProductionYear: 2024, ImageTags: { Primary: 'poster' }, Overview: 'An invented series about people mapping places that keep moving.', UserData: { UnplayedItemCount: 14 }, colors: ['#1a2b3c', '#f0c27a'] };
const seasons = [1, 2].map((n) => ({ Id: `season-${n}`, Name: `Season ${n}`, IndexNumber: n, SeriesId: series.Id, Type: 'Season' }));
const episodes = (season) => Array.from({ length: season === 1 ? 10 : 8 }, (_, i) => ({
	Id: `episode-${season}-${i + 1}`,
	Name: ['The Blank Margin', 'North by Guesswork', 'Contour Lines', 'Ink and Weather', 'The Moving Coast', 'Scale Model', 'Legend', 'True North', 'Uncharted', 'The Last Survey'][i % 10],
	Type: 'Episode',
	MediaType: 'Video',
	SeriesId: series.Id,
	SeriesName: series.Name,
	SeriesPrimaryImageTag: 'poster',
	ParentIndexNumber: season,
	IndexNumber: i + 1,
	RunTimeTicks: 46 * 60 * TICKS,
	ImageTags: {},
	MediaSources: [{ Id: `episode-${season}-${i + 1}`, Name: 'Main', ...SOURCES.hd }],
	UserData: season === 1 && i < 3 ? { Played: true } : season === 1 && i === 3 ? { PlaybackPositionTicks: 20 * 60 * TICKS, PlayedPercentage: 43 } : {},
}));
const allItems = [...movies, series, ...episodes(1), ...episodes(2)];

/** Poster art: a gradient, a few shapes and the title. */
function posterSvg(item) {
	const [dark, light] = item.colors ?? series.colors;
	const words = item.Name.split(' ');
	const lines = [];
	for (const word of words) {
		const last = lines[lines.length - 1];
		if (last && (last + ' ' + word).length <= 14) lines[lines.length - 1] = `${last} ${word}`;
		else lines.push(word);
	}
	const seed = [...item.Name].reduce((a, c) => a + c.charCodeAt(0), 0);
	const circles = Array.from({ length: 5 }, (_, i) => {
		const x = (seed * (i + 3) * 37) % 300;
		const y = 80 + ((seed * (i + 7) * 53) % 260);
		const r = 20 + ((seed * (i + 1)) % 70);
		return `<circle cx="${x}" cy="${y}" r="${r}" fill="${light}" opacity="${0.08 + (i % 3) * 0.07}"/>`;
	}).join('');
	const title = lines.map((line, i) => `<text x="150" y="${330 + i * 30}" text-anchor="middle" font-family="Georgia, serif" font-size="26" font-weight="bold" fill="${light}">${line.replace(/&/g, '&amp;').replace(/'/g, '&#39;')}</text>`).join('');
	return `<svg xmlns="http://www.w3.org/2000/svg" width="300" height="450" viewBox="0 0 300 450">
		<defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${light}" stop-opacity="0.35"/><stop offset="0.55" stop-color="${dark}"/><stop offset="1" stop-color="#05060a"/></linearGradient></defs>
		<rect width="300" height="450" fill="${dark}"/><rect width="300" height="450" fill="url(#g)"/>${circles}
		<path d="M0 300 L70 230 L120 270 L190 190 L300 290 L300 450 L0 450 Z" fill="#05060a" opacity="0.55"/>${title}
	</svg>`;
}

/** A trickplay tile: 5 × 5 numbered frames (320 × 180 each). */
function trickplayTile(tile) {
	const frames = [];
	for (let i = 0; i < 25; i++) {
		const n = tile * 25 + i;
		const x = (i % 5) * 320;
		const y = Math.floor(i / 5) * 180;
		const hue = (n * 37) % 360;
		frames.push(`<rect x="${x}" y="${y}" width="320" height="180" fill="hsl(${hue}, 55%, 35%)"/><circle cx="${x + 160}" cy="${y + 90}" r="${40 + (n % 5) * 8}" fill="hsl(${(hue + 160) % 360}, 70%, 60%)"/><text x="${x + 16}" y="${y + 166}" font-family="sans-serif" font-size="28" fill="#fff">0:${String(n).padStart(2, '0')}</text>`);
	}
	return `<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="900" viewBox="0 0 1600 900">${frames.join('')}</svg>`;
}

/**
 * Starts the fake server.
 * @param {{ port?: number, mediaDir: string }} options mediaDir holds test.mp4 / test.vtt
 * @returns {Promise<http.Server>}
 */
export function startMockJellyfin({ port = 8096, mediaDir }) {
	const pageOf = (list, url) => {
		const start = Number(url.searchParams.get('startIndex') || 0);
		const limit = Number(url.searchParams.get('limit') || 100);
		return { Items: list.slice(start, start + limit), TotalRecordCount: list.length };
	};
	const server = http.createServer((req, res) => {
		const url = new URL(req.url, 'http://localhost');
		const p = url.pathname;
		const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*', 'Access-Control-Allow-Methods': '*' };
		const send = (status, body, type = 'application/json') => {
			res.writeHead(status, { 'Content-Type': type, ...cors });
			res.end(body === undefined ? '' : typeof body === 'string' ? body : JSON.stringify(body));
		};
		const file = (name, type) => {
			const filePath = path.join(mediaDir, name);
			if (!fs.existsSync(filePath)) return send(404);
			const size = fs.statSync(filePath).size;
			const range = req.headers.range?.match(/bytes=(\d+)-(\d*)/);
			const start = range ? Number(range[1]) : 0;
			const end = range && range[2] ? Number(range[2]) : size - 1;
			res.writeHead(range ? 206 : 200, { ...cors, 'Content-Type': type, 'Accept-Ranges': 'bytes', 'Content-Length': end - start + 1, ...(range ? { 'Content-Range': `bytes ${start}-${end}/${size}` } : {}) });
			fs.createReadStream(filePath, { start, end }).pipe(res);
		};
		if (req.method === 'OPTIONS') return send(204);
		let body = '';
		req.on('data', (chunk) => { body += chunk; });
		req.on('end', () => {
			if (p.includes('/Images/')) {
				const id = p.split('/')[2];
				return send(200, posterSvg(allItems.find((i) => i.Id === id) ?? series), 'image/svg+xml');
			}
			if (/\/stream\.\w+$/.test(p)) return file('test.mp4', 'video/mp4');
			if (p.includes('/Trickplay/')) return send(200, trickplayTile(Number(p.split('/').pop().split('.')[0])), 'image/svg+xml');
			if (p.startsWith('/MediaSegments/')) {
				return send(200, { Items: [
					{ Type: 'Intro', StartTicks: 2 * TICKS, EndTicks: 15 * TICKS },
					{ Type: 'Outro', StartTicks: 32 * TICKS, EndTicks: 40 * TICKS },
				] });
			}
			if (p.endsWith('.vtt')) return file('test.vtt', 'text/vtt');
			if (/^\/Items\/[^/]+\/PlaybackInfo$/.test(p)) {
				const id = p.split('/')[2];
				const item = allItems.find((i) => i.Id === id) ?? movies[1];
				const source = { ...(item.MediaSources?.[0] ?? { Id: id, ...SOURCES.hd }), Container: 'mp4', SupportsDirectPlay: true, SupportsDirectStream: true, ETag: 'e' };
				source.MediaStreams = source.MediaStreams.map((s) => (s.Type === 'Subtitle' ? { ...s, DeliveryMethod: 'External', DeliveryUrl: `/Videos/${id}/${id}/Subtitles/${s.Index}/0/Stream.vtt` } : s));
				return send(200, { MediaSources: [source], PlaySessionId: 'screenshots' });
			}
			if (p.startsWith('/Sessions/') || p.startsWith('/UserPlayedItems/') || p.startsWith('/UserFavoriteItems/') || p === '/Videos/ActiveEncodings') return send(204);
			switch (p) {
				case '/System/Info/Public': return send(200, { ServerName: 'Home', Version: '10.11.0', ProductName: 'Jellyfin Server', Id: 'fake', StartupWizardCompleted: true });
				case '/QuickConnect/Enabled': return send(200, true);
				case '/QuickConnect/Initiate': return send(200, { Code: '381947', Secret: 's', Authenticated: false });
				case '/QuickConnect/Connect': return send(200, { Authenticated: false, Secret: 's' });
				case '/Users/Me': return send(200, { Id: 'user', Name: 'Alex' });
				case '/UserItems/Resume': return send(200, { Items: [movies[1], movies[4], episodes(1)[3]], TotalRecordCount: 3 });
				case '/Shows/NextUp': return send(200, url.searchParams.get('seriesId') ? { Items: [episodes(1)[3]] } : { Items: [episodes(1)[3]], TotalRecordCount: 1 });
				case '/Items/Latest': {
					const latest = url.searchParams.get('includeItemTypes') === 'Movie' ? movies.slice(0, 9) : [series];
					return send(200, url.searchParams.get('isPlayed') === 'false' ? latest.filter((i) => !i.UserData?.Played) : latest);
				}
				case `/Shows/${series.Id}/Seasons`: return send(200, { Items: seasons });
				case `/Shows/${series.Id}/Episodes`: return send(200, { Items: episodes(Number((url.searchParams.get('seasonId') ?? 'season-1').split('-')[1])) });
				case '/Genres': return send(200, { Items: [...new Set(FILMS.flatMap((f) => f[3]))].map((name, i) => ({ Id: `genre-${i}`, Name: name })) });
				case '/Items': {
					const ids = url.searchParams.getAll('ids');
					if (ids.length) return send(200, { Items: allItems.filter((i) => ids.includes(i.Id)), TotalRecordCount: ids.length });
					const term = url.searchParams.get('searchTerm')?.toLowerCase();
					if (term) return send(200, pageOf(allItems.filter((i) => i.Name.toLowerCase().includes(term)), url));
					if (url.searchParams.get('isFavorite')) return send(200, pageOf([movies[2], series], url));
					const list = url.searchParams.get('includeItemTypes') === 'Series' ? [series] : movies;
					return send(200, pageOf(url.searchParams.get('isPlayed') === 'false' ? list.filter((i) => !i.UserData?.Played) : list, url));
				}
				default: return send(404);
			}
		});
	});
	return new Promise((resolve) => server.listen(port, () => resolve(server)));
}
