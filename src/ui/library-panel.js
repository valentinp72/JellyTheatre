// Library browser shown when nothing is playing.
//
// Tabs: Continue watching, Next up, New movies, New shows, Movies, Shows
// (whole collection: sort, genre and unwatched filters), Favourites, Search
// (on-screen + physical keyboard). Clicking a card opens a details view
// (movie / episode) or a series view (seasons and episodes), where items can
// be marked watched or favourite. Emits `play-item` { item, startPosition,
// mediaSourceId } and `refresh-request`.

import { describeMedia, describeTranscodeReason } from '../jellyfin/device-profile.js';
import { createSources, episodeNumber, resumeSeconds, runtimeLabel, SORTS } from '../jellyfin/library.js';
import { resolvePlayback } from '../jellyfin/playback.js';
import { getSetting, runSettingAction, setSetting, SETTING_DEFINITIONS } from '../settings.js';
import { formatTime } from './player-controls.js';
import { PLAYBACK_COLORS } from './poster.js';
import { truncate } from './text.js';
import { COLORS, entity, setInteractiveVisible, whenLoaded } from './widgets.js';

const WIDTH = 2.3;
const HEIGHT = 1.42;
const TOP = HEIGHT / 2;
const LEFT = -WIDTH / 2 + 0.07;
const RIGHT = WIDTH / 2 - 0.07;
const CONTENT_TOP = TOP - 0.24;

const COLS = 7;
const PER_PAGE = 14;
const CARD_W = 0.24;
const CARD_H = 0.36;
const CARD_GAP = 0.06;
const ROW_PITCH = 0.47;

const GENRE_COLS = 5;
const GENRE_ROWS = 7;
const GENRES_PER_PAGE = GENRE_COLS * GENRE_ROWS;

const EPISODE_ROWS = 6;
const EPISODES_PER_PAGE = EPISODE_ROWS * 2;
const SEASON_TAB_GAP = 0.012;
const SEASON_ARROW_W = 0.07;

const TABS = [
	{ id: 'resume', label: 'Continue watching', empty: 'Nothing in progress.' },
	{ id: 'nextUp', label: 'Next up', empty: 'No next episodes.' },
	{ id: 'latestMovies', label: 'New movies', empty: 'No movies added recently.' },
	{ id: 'latestShows', label: 'New shows', empty: 'No episodes added recently.' },
	{ id: 'movies', label: 'Movies', type: 'Movie', noun: ['movie', 'movies'], empty: 'No movies in your library.' },
	{ id: 'shows', label: 'Shows', type: 'Series', noun: ['show', 'shows'], empty: 'No shows in your library.' },
	{ id: 'favorites', label: 'Favourites', noun: ['favourite', 'favourites'], empty: 'No favourites yet: add some from a movie or show page.' },
	{ id: 'search', label: 'Search', noun: ['result', 'results'], empty: 'No results.' },
];

const pages = (total, perPage) => Math.max(1, Math.ceil(total / perPage));

AFRAME.registerComponent('library-panel', {
	schema: {
		// The on-screen keyboard (kept at lap height, outside the panel).
		keyboard: { type: 'selector', default: '[ui-keyboard]' },
	},

	init() {
		this.api = null;
		this.sources = null;
		this.visible = true;
		this.tab = 'resume';
		/** Views opened on top of the tab grid: { type: 'detail' | 'series', item, ... } */
		this.stack = [];
		this.page = 0;
		this.sortIndex = { movies: 0, shows: 0 };
		this.filters = { movies: { genre: null, unwatched: false }, shows: { genre: null, unwatched: false } };
		this.searchText = '';
		this.loadToken = 0;
		this.searchTimer = null;

		this.el.append(entity({ 'ui-rect': `width: ${WIDTH}; height: ${HEIGHT}; radius: 0.04; opacity: 0.95` }));
		this.heading = entity({ position: `${LEFT} ${TOP - 0.065} 0.002`, 'ui-text': 'value: Now showing; fontSize: 0.05; weight: bold; anchorX: left' });
		this.refreshButton = this.button({ label: 'Refresh', width: 0.18 }, RIGHT - 0.09, TOP - 0.065, () => this.el.emit('refresh-request'));
		this.settingsButton = this.button({ label: 'Settings', width: 0.2 }, RIGHT - 0.18 - 0.02 - 0.1, TOP - 0.065, () => {
			if (this.top()?.type !== 'settings') this.stack.push({ type: 'settings' });
			this.render();
		});
		this.message = entity({ position: '0 0 0.002', 'ui-text': `fontSize: 0.036; maxWidth: ${WIDTH - 0.4}; align: center; color: ${COLORS.muted}` });
		// In the header, between the title and the buttons: below the panel it
		// would end up inside the stage when the panel is on the cinema screen.
		this.notice = entity({ position: `${LEFT + 0.78} ${TOP - 0.065} 0.002`, 'ui-text': 'fontSize: 0.026; maxWidth: 0.8; anchorX: left; color: #ff6b7a' });
		this.el.append(this.heading, this.refreshButton, this.message, this.notice);

		this.buildTabs();
		this.buildGrid();
		this.buildDetail();
		this.buildSeries();
		this.buildGenres();
		this.buildSettings();
		this.onSettingChange = () => {
			if (this.top()?.type === 'settings') this.render();
		};
		window.addEventListener('settingchange', this.onSettingChange);

		this.keyboard = this.data.keyboard;
		this.keyboard.addEventListener('key', (event) => this.onKey(event.detail.key));

		this.onKeyDown = this.onKeyDown.bind(this);
		window.addEventListener('keydown', this.onKeyDown);
		this.render();
	},

	remove() {
		window.removeEventListener('keydown', this.onKeyDown);
		window.removeEventListener('settingchange', this.onSettingChange);
	},

	// --- building blocks ---------------------------------------------------

	button(options, x, y, onClick, parent = this.el) {
		const el = entity({
			position: `${x} ${y} 0.002`,
			'ui-button': { height: 0.065, fontSize: 0.026, ...options },
		});
		el.addEventListener('click', onClick);
		parent.appendChild(el);
		return el;
	},

	text(options, x, y, parent) {
		const el = entity({ position: `${x} ${y} 0.002`, 'ui-text': { anchorX: 'left', anchorY: 'top', ...options } });
		parent.appendChild(el);
		return el;
	},

	show(el, visible) {
		setInteractiveVisible(el, this.visible && visible);
	},

	buildTabs() {
		this.tabEls = {};
		let x = LEFT;
		for (const tab of TABS) {
			const width = 0.06 + tab.label.length * 0.0165;
			this.tabEls[tab.id] = this.button({ label: tab.label, width }, x + width / 2, TOP - 0.16, () => this.showTab(tab.id));
			x += width + 0.018;
		}
	},

	buildGrid() {
		this.grid = entity();
		this.el.appendChild(this.grid);
		const toolbarY = CONTENT_TOP - 0.03;
		this.gridInfo = entity({ position: `${RIGHT} ${toolbarY} 0.002`, 'ui-text': `fontSize: 0.026; color: ${COLORS.muted}; anchorX: right` });
		this.sortButton = this.button({ label: 'Sort', width: 0.34 }, LEFT + 0.17, toolbarY, () => this.cycleSort(), this.grid);
		this.genreButton = this.button({ label: 'Genre: All', width: 0.36 }, LEFT + 0.36 + 0.18, toolbarY, () => {
			this.stack.push({ type: 'genres', tab: this.tab, page: 0 });
			this.render();
		}, this.grid);
		this.unwatchedButton = this.button({ label: 'Unwatched only', width: 0.28 }, LEFT + 0.74 + 0.14, toolbarY, () => {
			const filters = this.filters[this.tab];
			filters.unwatched = !filters.unwatched;
			this.page = 0;
			this.render();
		}, this.grid);
		this.searchField = entity({ position: `${LEFT + 0.5} ${toolbarY} 0.002`, 'ui-rect': `width: 1; height: 0.065; radius: 0.02; color: ${COLORS.button}` });
		this.searchText3d = entity({ position: '-0.47 0 0.002', 'ui-text': 'fontSize: 0.03; anchorX: left' });
		this.searchField.appendChild(this.searchText3d);
		this.grid.append(this.gridInfo, this.searchField);

		this.cards = [];
		const rowWidth = COLS * CARD_W + (COLS - 1) * CARD_GAP;
		const firstRowY = toolbarY - 0.06 - CARD_H / 2;
		for (let i = 0; i < PER_PAGE; i++) {
			const col = i % COLS;
			const row = Math.floor(i / COLS);
			const card = entity({
				position: `${-rowWidth / 2 + CARD_W / 2 + col * (CARD_W + CARD_GAP)} ${firstRowY - row * ROW_PITCH} 0.002`,
				'ui-poster': { width: CARD_W, height: CARD_H },
			});
			card.addEventListener('click', () => {
				const item = card.components['ui-poster']?.item;
				if (item) this.open(item);
			});
			this.grid.appendChild(card);
			this.cards.push(card);
		}

		const pagerY = -TOP + 0.09;
		this.gridPrev = this.button({ label: '‹ Previous', width: 0.26 }, -0.32, pagerY, () => this.setPage(this.page - 1), this.grid);
		this.gridNext = this.button({ label: 'Next ›', width: 0.26 }, 0.32, pagerY, () => this.setPage(this.page + 1), this.grid);
		this.gridPage = entity({ position: `0 ${pagerY} 0.002`, 'ui-text': `fontSize: 0.026; color: ${COLORS.muted}` });
		this.grid.appendChild(this.gridPage);
	},

	buildDetail() {
		this.detail = entity();
		this.el.appendChild(this.detail);
		const posterW = 0.4;
		const posterH = 0.6;
		this.detailPoster = entity({
			position: `${LEFT + posterW / 2} ${CONTENT_TOP - posterH / 2} 0.002`,
			'ui-poster': { width: posterW, height: posterH, captions: false, hover: false },
		});
		this.detail.appendChild(this.detailPoster);
		const x = LEFT + posterW + 0.07;
		const maxWidth = RIGHT - x;
		this.detailX = x;
		this.detailTitle = this.text({ fontSize: 0.055, weight: 'bold', maxWidth }, x, CONTENT_TOP + 0.01, this.detail);
		this.detailSubtitle = this.text({ fontSize: 0.034, maxWidth }, x, CONTENT_TOP - 0.07, this.detail);
		this.detailMeta = this.text({ fontSize: 0.026, color: COLORS.muted, maxWidth }, x, CONTENT_TOP - 0.13, this.detail);
		// Media info: what the file is, and how it will play here.
		this.detailVideo = this.text({ fontSize: 0.024, maxWidth }, x, CONTENT_TOP - 0.18, this.detail);
		this.detailAudio = this.text({ fontSize: 0.024, maxWidth }, x, CONTENT_TOP - 0.215, this.detail);
		this.detailSubs = this.text({ fontSize: 0.024, maxWidth }, x, CONTENT_TOP - 0.25, this.detail);
		this.detailPlayback = this.text({ fontSize: 0.026, weight: 'bold', maxWidth }, x, CONTENT_TOP - 0.29, this.detail);
		this.detailOverview = this.text({ fontSize: 0.026, maxWidth, lineHeight: 1.35 }, x, CONTENT_TOP - 0.35, this.detail);

		const y = CONTENT_TOP - 0.72;
		this.detailPlay = this.button({ label: 'Play', width: 0.42, activeColor: COLORS.accent, active: true }, x + 0.21, y, () => this.playFromDetail(true), this.detail);
		this.detailRestart = this.button({ label: 'Play from start', width: 0.32 }, x + 0.42 + 0.03 + 0.16, y, () => this.playFromDetail(false), this.detail);
		this.detailSeries = this.button({ label: 'Go to series', width: 0.26 }, x + 0.77 + 0.03 + 0.13, y, () => this.openSeriesOf(this.top().item), this.detail);
		this.detailBack = this.button({ label: '‹ Back', width: 0.2 }, RIGHT - 0.1, y, () => this.back(), this.detail);

		const y2 = y - 0.09;
		this.detailPlayed = this.button({ label: 'Mark watched', width: 0.3 }, x + 0.15, y2, () => this.togglePlayed(this.top()), this.detail);
		this.detailFavorite = this.button({ label: 'Add to favourites', width: 0.34 }, x + 0.3 + 0.03 + 0.17, y2, () => this.toggleFavorite(this.top()), this.detail);
		this.detailVersion = this.button({ label: 'Version', width: 0.5 }, x + 0.67 + 0.03 + 0.25, y2, () => {
			const view = this.top();
			view.versionIndex = (view.versionIndex + 1) % view.item.MediaSources.length;
			this.render();
		}, this.detail);
	},

	buildSeries() {
		this.series = entity();
		this.el.appendChild(this.series);
		const posterW = 0.36;
		const posterH = 0.54;
		this.seriesPoster = entity({
			position: `${LEFT + posterW / 2} ${CONTENT_TOP - posterH / 2} 0.002`,
			'ui-poster': { width: posterW, height: posterH, captions: false, hover: false },
		});
		this.series.appendChild(this.seriesPoster);
		const x = LEFT + posterW + 0.07;
		const maxWidth = RIGHT - x;
		this.seriesX = x;
		this.seriesTitle = this.text({ fontSize: 0.05, weight: 'bold', maxWidth }, x, CONTENT_TOP + 0.01, this.series);
		this.seriesMeta = this.text({ fontSize: 0.026, color: COLORS.muted, maxWidth }, x, CONTENT_TOP - 0.065, this.series);
		this.seriesOverview = this.text({ fontSize: 0.025, maxWidth, lineHeight: 1.35 }, x, CONTENT_TOP - 0.11, this.series);

		const buttonsY = CONTENT_TOP - 0.29;
		this.seriesPlayNext = this.button({ label: 'Play next', width: 0.42, active: true }, x + 0.21, buttonsY, () => {
			const next = this.top().nextUp;
			if (next) this.el.emit('play-item', { item: next });
		}, this.series);
		this.seriesPlayed = this.button({ label: 'Mark watched', width: 0.3 }, x + 0.42 + 0.03 + 0.15, buttonsY, () => this.togglePlayed(this.top()), this.series);
		this.seriesFavorite = this.button({ label: 'Add to favourites', width: 0.34 }, x + 0.75 + 0.03 + 0.17, buttonsY, () => this.toggleFavorite(this.top()), this.series);
		this.seriesBack = this.button({ label: '‹ Back', width: 0.2 }, RIGHT - 0.1, buttonsY, () => this.back(), this.series);

		this.seasonRow = entity({ position: `0 ${CONTENT_TOP - 0.39} 0` });
		this.series.appendChild(this.seasonRow);

		const columnW = (maxWidth - 0.02) / 2;
		this.episodeEls = [];
		for (let i = 0; i < EPISODES_PER_PAGE; i++) {
			const col = Math.floor(i / EPISODE_ROWS);
			const row = i % EPISODE_ROWS;
			const el = this.button(
				{ label: '', width: columnW, height: 0.062, fontSize: 0.024, align: 'left' },
				x + columnW / 2 + col * (columnW + 0.02),
				CONTENT_TOP - 0.48 - row * 0.072,
				() => {
					const episode = this.top().episodes?.[i];
					if (episode) this.open(episode);
				},
				this.series,
			);
			this.episodeEls.push(el);
		}
		const pagerY = -TOP + 0.09;
		this.episodePrev = this.button({ label: '‹ Previous', width: 0.26 }, x + 0.13, pagerY, () => this.setEpisodePage(-1), this.series);
		this.episodeNext = this.button({ label: 'Next ›', width: 0.26 }, RIGHT - 0.13, pagerY, () => this.setEpisodePage(1), this.series);
		this.episodePage = entity({ position: `${(x + RIGHT) / 2} ${pagerY} 0.002`, 'ui-text': `fontSize: 0.026; color: ${COLORS.muted}` });
		this.series.appendChild(this.episodePage);
	},

	buildGenres() {
		this.genres = entity();
		this.el.appendChild(this.genres);
		this.genresTitle = this.text({ fontSize: 0.04, weight: 'bold' }, LEFT, CONTENT_TOP + 0.01, this.genres);
		this.genresAll = this.button({ label: 'All genres', width: 0.26 }, RIGHT - 0.2 - 0.03 - 0.13, CONTENT_TOP - 0.02, () => this.chooseGenre(null), this.genres);
		this.genresBack = this.button({ label: '‹ Back', width: 0.2 }, RIGHT - 0.1, CONTENT_TOP - 0.02, () => this.back(), this.genres);
		const width = (RIGHT - LEFT - (GENRE_COLS - 1) * 0.02) / GENRE_COLS;
		this.genreEls = [];
		for (let i = 0; i < GENRES_PER_PAGE; i++) {
			const col = i % GENRE_COLS;
			const row = Math.floor(i / GENRE_COLS);
			const el = this.button(
				{ label: '', width, height: 0.07, fontSize: 0.026 },
				LEFT + width / 2 + col * (width + 0.02),
				CONTENT_TOP - 0.13 - row * 0.085,
				() => {
					const view = this.top();
					const genre = view.list?.[view.page * GENRES_PER_PAGE + i];
					if (genre) this.chooseGenre(genre);
				},
				this.genres,
			);
			this.genreEls.push(el);
		}
		const pagerY = -TOP + 0.09;
		this.genresPrev = this.button({ label: '‹ Previous', width: 0.26 }, -0.32, pagerY, () => this.setGenrePage(-1), this.genres);
		this.genresNext = this.button({ label: 'Next ›', width: 0.26 }, 0.32, pagerY, () => this.setGenrePage(1), this.genres);
	},

	buildSettings() {
		this.settings = entity();
		this.el.appendChild(this.settings);
		this.text({ value: 'Settings', fontSize: 0.05, weight: 'bold' }, LEFT, CONTENT_TOP + 0.01, this.settings);
		this.button({ label: '‹ Back', width: 0.2 }, RIGHT - 0.1, CONTENT_TOP - 0.02, () => this.back(), this.settings);
		// Two columns of settings.
		const valueW = 0.18;
		const columnGap = 0.08;
		const columnW = (RIGHT - LEFT - columnGap) / 2;
		const textWidth = columnW - valueW - 0.04;
		const perColumn = Math.ceil(SETTING_DEFINITIONS.length / 2);
		this.settingRows = SETTING_DEFINITIONS.map((setting, i) => {
			const column = Math.floor(i / perColumn);
			const x = LEFT + column * (columnW + columnGap);
			const y = CONTENT_TOP - 0.12 - (i % perColumn) * 0.2;
			this.text({ value: setting.label, fontSize: 0.03, maxWidth: textWidth }, x, y, this.settings);
			this.text({ value: setting.description, fontSize: 0.022, color: COLORS.muted, maxWidth: textWidth, lineHeight: 1.3 }, x, y - 0.042, this.settings);
			const value = this.button({ label: setting.action ?? '', width: valueW, height: 0.065 }, x + columnW - valueW / 2, y - 0.04, () => {
				if (setting.type === 'action') {
					runSettingAction(setting.name);
				} else if (setting.type === 'choice') {
					// Cycle through the options.
					const index = setting.options.findIndex((option) => option.value === getSetting(setting.name));
					setSetting(setting.name, setting.options[(index + 1) % setting.options.length].value);
				} else {
					setSetting(setting.name, !getSetting(setting.name));
				}
			}, this.settings);
			return { setting, value };
		});
	},

	renderSettings() {
		for (const { setting, value } of this.settingRows) {
			if (setting.type === 'action') continue;
			if (setting.type === 'choice') {
				const current = setting.options.find((option) => option.value === getSetting(setting.name));
				value.setAttribute('ui-button', { label: current?.label ?? '', active: false });
				continue;
			}
			const on = getSetting(setting.name);
			value.setAttribute('ui-button', { label: on ? 'On' : 'Off', active: on });
		}
	},

	chooseGenre(genre) {
		const view = this.top();
		this.filters[view.tab].genre = genre;
		this.page = 0;
		this.back();
	},

	setGenrePage(delta) {
		const view = this.top();
		view.page = Math.max(0, view.page + delta);
		this.render();
	},

	async renderGenres(view) {
		const tab = TABS.find((t) => t.id === view.tab);
		const current = this.filters[view.tab].genre;
		this.genresTitle.setAttribute('ui-text', 'value', `${tab.label}: choose a genre`);
		this.genresAll.setAttribute('ui-button', 'active', !current);
		const token = ++this.loadToken;
		if (!view.list) {
			this.genreEls.forEach((el) => this.show(el, false));
			this.show(this.genresPrev, false);
			this.show(this.genresNext, false);
			this.setMessage('Loading…');
			try {
				view.list = await this.sources.genres(tab.type);
			} catch (error) {
				console.error(error);
				if (token === this.loadToken) this.setMessage('Could not load the genres.');
				return;
			}
			if (token !== this.loadToken || this.top() !== view) return;
			this.setMessage(view.list.length ? '' : 'No genres.');
		}
		const pageCount = pages(view.list.length, GENRES_PER_PAGE);
		this.genreEls.forEach((el, i) => {
			const genre = view.list[view.page * GENRES_PER_PAGE + i];
			if (genre) el.setAttribute('ui-button', { label: truncate(genre.Name, 24), active: genre.Id === current?.Id });
			this.show(el, Boolean(genre));
		});
		this.show(this.genresPrev, view.page > 0);
		this.show(this.genresNext, view.page < pageCount - 1);
	},

	// --- public API --------------------------------------------------------

	/** @param {import('@jellyfin/sdk').Api} api */
	setSession(api, user) {
		this.api = api;
		this.user = user;
		this.sources = createSources(api, user.Id);
		this.heading.setAttribute('ui-text', 'value', `Now showing for ${user.Name}`);
		this.stack = [];
		this.showTab('resume');
	},

	clearSession() {
		this.api = null;
		this.sources = null;
		this.stack = [];
		this.heading.setAttribute('ui-text', 'value', 'Now showing');
		this.render();
	},

	setVisible(visible) {
		this.visible = visible;
		this.el.object3D.visible = visible;
		this.render();
	},

	/** One-line notice under the panel (errors…); '' to clear. */
	setNotice(text) {
		this.notice.setAttribute('ui-text', 'value', text);
	},

	/** Reloads everything (e.g. after watching: resume points changed). */
	async refresh() {
		if (!this.api) return;
		this.sources = createSources(this.api, this.user.Id);
		for (const view of this.stack) {
			view.seasons = null;
			view.episodeSources = {};
			try {
				view.item = (await this.sources.item(view.item.Id)) ?? view.item;
			} catch (error) {
				console.warn('[library] could not refresh item', error);
			}
		}
		this.render();
	},

	// --- navigation --------------------------------------------------------

	top() {
		return this.stack[this.stack.length - 1];
	},

	showTab(id) {
		this.tab = id;
		this.stack = [];
		this.page = 0;
		this.render();
	},

	open(item) {
		if (item.Type === 'Series') {
			this.stack.push({ type: 'series', item, seasonIndex: 0, episodePage: 0, episodeSources: {} });
		} else {
			const view = { type: 'detail', item, versionIndex: 0 };
			this.stack.push(view);
			if (item.MediaSourceCount > 1 && !item.MediaSources) {
				// Fetch the list of versions.
				this.sources.item(item.Id).then((full) => {
					if (full) view.item = full;
					if (this.top() === view) this.render();
				}).catch(() => {});
			}
		}
		this.render();
	},

	openSeriesOf(episode) {
		this.open({
			Id: episode.SeriesId,
			Name: episode.SeriesName,
			Type: 'Series',
			ImageTags: episode.SeriesPrimaryImageTag ? { Primary: episode.SeriesPrimaryImageTag } : {},
		});
		// Fetch the full series item (overview, year…) in the background.
		const view = this.top();
		this.sources.item(episode.SeriesId).then((series) => {
			if (series && this.top() === view) {
				view.item = series;
				this.render();
			}
		}).catch(() => {});
	},

	back() {
		this.stack.pop();
		this.render();
	},

	setPage(page) {
		this.page = Math.max(0, page);
		this.render();
	},

	cycleSort() {
		this.sortIndex[this.tab] = (this.sortIndex[this.tab] + 1) % SORTS.length;
		this.page = 0;
		this.render();
	},

	setEpisodePage(delta) {
		const view = this.top();
		view.episodePage = Math.max(0, view.episodePage + delta);
		this.render();
	},

	playFromDetail(resume) {
		const { item, versionIndex } = this.top();
		const mediaSourceId = item.MediaSources?.length > 1 ? item.MediaSources[versionIndex].Id : undefined;
		this.el.emit('play-item', { item, startPosition: resume ? undefined : 0, mediaSourceId });
	},

	async togglePlayed(view) {
		const { item } = view;
		try {
			const userData = await this.sources.setPlayed(item.Id, !item.UserData?.Played);
			item.UserData = { ...item.UserData, ...userData };
			// A series' episodes changed too.
			if (view.type === 'series') {
				view.seasons = null;
				view.episodeSources = {};
			}
		} catch (error) {
			console.error(error);
			this.setNotice('Could not update the watched status.');
		}
		if (this.top() === view) this.render();
	},

	async toggleFavorite(view) {
		const { item } = view;
		try {
			const userData = await this.sources.setFavorite(item.Id, !item.UserData?.IsFavorite);
			item.UserData = { ...item.UserData, ...userData };
		} catch (error) {
			console.error(error);
			this.setNotice('Could not update favourites.');
		}
		if (this.top() === view) this.render();
	},

	// --- search input ------------------------------------------------------

	searchActive() {
		return this.visible && this.tab === 'search' && this.stack.length === 0;
	},

	onKey(key) {
		if (key === 'Backspace') this.searchText = this.searchText.slice(0, -1);
		else if (key === 'Clear') this.searchText = '';
		else if (this.searchText.length < 40) this.searchText += key;
		this.renderSearchField();
		clearTimeout(this.searchTimer);
		this.searchTimer = setTimeout(() => {
			this.page = 0;
			this.render();
		}, 400);
	},

	onKeyDown(event) {
		if (!this.searchActive() || !document.getElementById('lobby')?.hidden) return;
		if (event.target instanceof HTMLInputElement || event.ctrlKey || event.metaKey || event.altKey) return;
		if (event.key === 'Backspace') this.onKey('Backspace');
		else if (event.key === 'Escape') this.onKey('Clear');
		else if (event.key.length === 1) this.onKey(event.key);
		else return;
		event.preventDefault();
	},

	renderSearchField() {
		const text = this.searchText;
		this.searchText3d.setAttribute('ui-text', {
			value: text ? `${text}|` : 'Type to search movies, shows and episodes…',
			color: text ? COLORS.text : COLORS.muted,
		});
	},

	// --- rendering ---------------------------------------------------------

	render() {
		const view = this.top();
		const signedIn = this.sources !== null;
		this.show(this.refreshButton, signedIn);
		this.show(this.settingsButton, signedIn);
		for (const tab of TABS) {
			const el = this.tabEls[tab.id];
			el.setAttribute('ui-button', 'active', tab.id === this.tab);
			this.show(el, signedIn);
		}
		this.show(this.grid, signedIn && !view);
		this.show(this.detail, signedIn && view?.type === 'detail');
		this.show(this.series, signedIn && view?.type === 'series');
		this.show(this.genres, signedIn && view?.type === 'genres');
		this.show(this.settings, signedIn && view?.type === 'settings');
		this.keyboard.components['ui-keyboard']?.setVisible(this.searchActive() && signedIn);
		this.setMessage(signedIn ? '' : 'Sign in from the lobby to see your library.');
		if (!signedIn || !this.visible) return;

		if (!view) this.renderGrid();
		else if (view.type === 'detail') this.renderDetail(view);
		else if (view.type === 'genres') this.renderGenres(view);
		else if (view.type === 'settings') this.renderSettings();
		else this.renderSeries(view);
	},

	setMessage(text) {
		this.message.setAttribute('ui-text', 'value', text);
	},

	gridSource(tab) {
		if (tab.id === 'movies' || tab.id === 'shows') {
			const { genre, unwatched } = this.filters[tab.id];
			return this.sources.collection(tab.type, SORTS[this.sortIndex[tab.id]], { genreId: genre?.Id, unwatched });
		}
		if (tab.id === 'search') return this.sources.search(this.searchText.trim());
		return this.sources[tab.id];
	},

	async renderGrid() {
		const tab = TABS.find((t) => t.id === this.tab);
		const sortable = tab.id === 'movies' || tab.id === 'shows';
		const isSearch = tab.id === 'search';
		this.show(this.sortButton, sortable);
		this.show(this.genreButton, sortable);
		this.show(this.unwatchedButton, sortable);
		this.show(this.searchField, isSearch);
		if (sortable) {
			const { genre, unwatched } = this.filters[tab.id];
			this.sortButton.setAttribute('ui-button', 'label', `Sort: ${SORTS[this.sortIndex[tab.id]].label}`);
			this.genreButton.setAttribute('ui-button', { label: `Genre: ${truncate(genre?.Name ?? 'All', 16)}`, active: Boolean(genre) });
			this.unwatchedButton.setAttribute('ui-button', 'active', unwatched);
		}
		if (isSearch) this.renderSearchField();

		const token = ++this.loadToken;
		this.fillCards([]);
		this.gridInfo.setAttribute('ui-text', 'value', '');
		this.gridPage.setAttribute('ui-text', 'value', '');
		this.show(this.gridPrev, false);
		this.show(this.gridNext, false);

		if (isSearch && this.searchText.trim().length < 2) {
			this.setMessage('Type at least 2 letters, with the keyboard below or a physical keyboard.');
			return;
		}
		this.setMessage('Loading…');
		let result;
		try {
			result = await this.gridSource(tab).load(this.page * PER_PAGE, PER_PAGE);
		} catch (error) {
			console.error(error);
			if (token === this.loadToken) this.setMessage('Could not load your library. Check your connection, then press Refresh.');
			return;
		}
		if (token !== this.loadToken) return;
		const pageCount = pages(result.total, PER_PAGE);
		if (this.page >= pageCount && this.page > 0) {
			this.page = pageCount - 1;
			this.render();
			return;
		}
		this.setMessage(result.items.length ? '' : tab.empty);
		this.fillCards(result.items);
		if (tab.noun) this.gridInfo.setAttribute('ui-text', 'value', `${result.total} ${tab.noun[result.total === 1 ? 0 : 1]}`);
		if (pageCount > 1) this.gridPage.setAttribute('ui-text', 'value', `Page ${this.page + 1} / ${pageCount}`);
		this.show(this.gridPrev, this.page > 0);
		this.show(this.gridNext, this.page < pageCount - 1);
	},

	fillCards(items) {
		this.cards.forEach((card, i) => {
			const item = items[i] ?? null;
			whenLoaded(card, () => card.components['ui-poster'].setItem(this.api, item));
			this.show(card, item !== null);
		});
	},

	renderDetail(view) {
		const { item } = view;
		const isEpisode = item.Type === 'Episode';
		whenLoaded(this.detailPoster, () => this.detailPoster.components['ui-poster'].setItem(this.api, item));
		this.detailTitle.setAttribute('ui-text', 'value', truncate(isEpisode ? item.SeriesName : item.Name, 48));
		this.detailSubtitle.setAttribute('ui-text', 'value', isEpisode ? truncate(`${episodeNumber(item)} · ${item.Name}`, 70) : '');
		const meta = [
			item.ProductionYear,
			runtimeLabel(item),
			item.OfficialRating,
			item.CommunityRating ? `Rating ${item.CommunityRating.toFixed(1)}` : '',
			(item.Genres ?? []).slice(0, 3).join(', '),
			item.UserData?.Played ? 'Watched' : '',
		].filter(Boolean).join('  ·  ');
		this.detailMeta.setAttribute('ui-text', 'value', meta);
		this.detailOverview.setAttribute('ui-text', 'value', truncate(item.Overview ?? '', 420));
		this.renderMediaInfo(view);

		const resume = resumeSeconds(item);
		this.detailPlay.setAttribute('ui-button', 'label', resume > 0 ? `Resume from ${formatTime(resume)}` : 'Play');
		this.show(this.detailRestart, resume > 0);
		this.show(this.detailSeries, isEpisode && Boolean(item.SeriesId));
		// Without "Play from start", "Go to series" moves next to "Play".
		this.detailSeries.object3D.position.x = this.detailX + (resume > 0 ? 0.93 : 0.58);

		this.detailPlayed.setAttribute('ui-button', 'label', item.UserData?.Played ? 'Mark unwatched' : 'Mark watched');
		this.detailFavorite.setAttribute('ui-button', {
			label: item.UserData?.IsFavorite ? 'Remove favourite' : 'Add to favourites',
			active: Boolean(item.UserData?.IsFavorite),
		});
		const versions = item.MediaSources ?? [];
		this.show(this.detailVersion, versions.length > 1);
		if (versions.length > 1) {
			const name = versions[view.versionIndex]?.Name ?? `Version ${view.versionIndex + 1}`;
			this.detailVersion.setAttribute('ui-button', 'label', `Version: ${truncate(name, 26)}`);
		}
	},

	renderMediaInfo(view) {
		const source = view.item.MediaSources?.[view.versionIndex];
		const media = source ? describeMedia(source) : null;
		this.detailVideo.setAttribute('ui-text', 'value', media ? `Video   ${media.video}` : '');
		this.detailAudio.setAttribute('ui-text', 'value', media ? `Audio   ${media.audio}` : '');
		this.detailSubs.setAttribute('ui-text', 'value', media ? `Subtitles   ${media.subtitles}` : '');

		// Ask the server how it would actually play (no stream is started).
		const sourceId = source?.Id;
		if (!view.check || view.check.sourceId !== sourceId) {
			const check = { sourceId, status: 'loading' };
			view.check = check;
			resolvePlayback(this.api, { item: view.item, userId: this.user.Id, mediaSourceId: sourceId })
				.then((result) => Object.assign(check, { status: 'done', mode: result.mode, reasons: result.transcodeReasons }))
				.catch(() => Object.assign(check, { status: 'error' }))
				.finally(() => {
					if (this.top() === view && view.check === check) this.renderMediaInfo(view);
				});
		}
		const check = view.check;
		let text = 'Checking playback…';
		let color = COLORS.muted;
		if (check.status === 'error') {
			text = 'Could not check how this plays.';
		} else if (check.status === 'done') {
			const reasons = check.reasons.map(describeTranscodeReason).join(', ');
			color = PLAYBACK_COLORS[check.mode];
			text = {
				direct: 'Direct play: no transcoding',
				remux: `Remux, video not transcoded (${reasons})`,
				transcode: `Needs transcoding (${reasons})`,
			}[check.mode];
		}
		this.detailPlayback.setAttribute('ui-text', { value: text, color });
	},

	async renderSeries(view) {
		const { item } = view;
		whenLoaded(this.seriesPoster, () => this.seriesPoster.components['ui-poster'].setItem(this.api, item));
		this.seriesTitle.setAttribute('ui-text', 'value', truncate(item.Name, 48));
		this.seriesOverview.setAttribute('ui-text', 'value', truncate(item.Overview ?? '', 300));
		this.show(this.seriesPlayNext, Boolean(view.nextUp));
		this.seriesPlayed.setAttribute('ui-button', 'label', item.UserData?.Played ? 'Mark unwatched' : 'Mark watched');
		this.seriesFavorite.setAttribute('ui-button', {
			label: item.UserData?.IsFavorite ? 'Remove favourite' : 'Add to favourites',
			active: Boolean(item.UserData?.IsFavorite),
		});

		const token = ++this.loadToken;
		if (!view.seasons) {
			this.seasonRow.replaceChildren();
			this.episodeEls.forEach((el) => this.show(el, false));
			this.show(this.episodePrev, false);
			this.show(this.episodeNext, false);
			this.episodePage.setAttribute('ui-text', 'value', '');
			this.setMessage('Loading…');
			try {
				const [seasons, nextUp] = await Promise.all([
					this.sources.seasons(item.Id),
					this.sources.nextUpForSeries(item.Id),
				]);
				view.seasons = seasons;
				view.nextUp = nextUp;
			} catch (error) {
				console.error(error);
				if (token === this.loadToken) this.setMessage('Could not load this series.');
				return;
			}
			if (token !== this.loadToken || this.top() !== view) return;
			this.setMessage('');
		}

		const meta = [item.ProductionYear, `${view.seasons.length} season${view.seasons.length === 1 ? '' : 's'}`, item.OfficialRating]
			.filter(Boolean).join('  ·  ');
		this.seriesMeta.setAttribute('ui-text', 'value', meta);
		const next = view.nextUp;
		if (next) {
			const resume = resumeSeconds(next);
			this.seriesPlayNext.setAttribute('ui-button', 'label', `${resume > 0 ? 'Resume' : 'Play'} ${episodeNumber(next) || next.Name}`);
		}
		this.show(this.seriesPlayNext, Boolean(next));
		this.renderSeasonTabs(view);
		if (!view.seasons.length) {
			this.setMessage('No episodes.');
			return;
		}

		// Hide the previous page's episodes while this one loads.
		view.episodes = null;
		this.episodeEls.forEach((el) => this.show(el, false));
		const season = view.seasons[view.seasonIndex];
		view.episodeSources[season.Id] ??= this.sources.episodes(item.Id, season.Id);
		let result;
		try {
			result = await view.episodeSources[season.Id].load(view.episodePage * EPISODES_PER_PAGE, EPISODES_PER_PAGE);
		} catch (error) {
			console.error(error);
			if (token === this.loadToken) this.setMessage('Could not load the episodes.');
			return;
		}
		if (token !== this.loadToken || this.top() !== view) return;
		view.episodes = result.items;
		this.episodeEls.forEach((el, i) => {
			const episode = result.items[i];
			if (episode) el.setAttribute('ui-button', 'label', truncate(episodeLabel(episode), 52));
			this.show(el, Boolean(episode));
		});
		const pageCount = pages(result.total, EPISODES_PER_PAGE);
		this.episodePage.setAttribute('ui-text', 'value', pageCount > 1 ? `Page ${view.episodePage + 1} / ${pageCount}` : '');
		this.show(this.episodePrev, view.episodePage > 0);
		this.show(this.episodeNext, view.episodePage < pageCount - 1);
	},

	/** One tab per season; ‹ › scroll through them when they don't all fit. */
	renderSeasonTabs(view) {
		this.seasonRow.replaceChildren();
		const labels = view.seasons.map(seasonLabel);
		const widths = labels.map((label) => 0.05 + label.length * 0.017);
		const available = RIGHT - this.seriesX;
		const total = widths.reduce((sum, w) => sum + w + SEASON_TAB_GAP, -SEASON_TAB_GAP);
		const scrolling = total > available;
		const room = scrolling ? available - 2 * (SEASON_ARROW_W + SEASON_TAB_GAP) : available;

		// Visible window: as many tabs as fit, starting at the scroll offset.
		view.seasonOffset = Math.min(view.seasonOffset ?? 0, labels.length - 1);
		const start = scrolling ? view.seasonOffset : 0;
		let end = start;
		for (let used = 0; end < labels.length; end++) {
			used += widths[end] + (end > start ? SEASON_TAB_GAP : 0);
			if (used > room) break;
		}

		let x = this.seriesX;
		const tabOptions = { height: 0.06, fontSize: 0.024 };
		if (scrolling) {
			this.button({ ...tabOptions, label: '‹', width: SEASON_ARROW_W, disabled: start === 0 }, x + SEASON_ARROW_W / 2, 0, () => {
				// Scroll back by a full window.
				let offset = start;
				for (let used = 0; offset > 0; offset--) {
					used += widths[offset - 1] + SEASON_TAB_GAP;
					if (used > room) break;
				}
				view.seasonOffset = offset;
				this.render();
			}, this.seasonRow);
			x += SEASON_ARROW_W + SEASON_TAB_GAP;
		}
		for (let index = start; index < end; index++) {
			this.button(
				{ ...tabOptions, label: labels[index], width: widths[index], active: index === view.seasonIndex },
				x + widths[index] / 2,
				0,
				() => {
					view.seasonIndex = index;
					view.episodePage = 0;
					this.render();
				},
				this.seasonRow,
			);
			x += widths[index] + SEASON_TAB_GAP;
		}
		if (scrolling) {
			this.button({ ...tabOptions, label: '›', width: SEASON_ARROW_W, disabled: end >= labels.length }, RIGHT - SEASON_ARROW_W / 2, 0, () => {
				view.seasonOffset = end;
				this.render();
			}, this.seasonRow);
		}
		this.show(this.seasonRow, true);
	},
});

/** Short season label: "S01", "S12", "Specials". */
function seasonLabel(season) {
	if (season.IndexNumber === 0) return 'Specials';
	if (season.IndexNumber != null) return `S${String(season.IndexNumber).padStart(2, '0')}`;
	return truncate(season.Name, 12);
}

function episodeLabel(episode) {
	const number = episode.IndexNumber != null ? `${episode.IndexNumber}. ` : '';
	let status = runtimeLabel(episode);
	if (episode.UserData?.Played) status = 'Watched';
	else if (episode.UserData?.PlayedPercentage) status = `${Math.round(episode.UserData.PlayedPercentage)}% watched`;
	return `${number}${episode.Name}${status ? `  ·  ${status}` : ''}`;
}
