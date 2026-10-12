// Library browser shown when nothing is playing.
//
// Tabs: Continue watching, Next up, New movies, New shows, Movies, Shows
// (whole collection, sortable), Search (on-screen + physical keyboard).
// Clicking a card opens a details view (movie / episode) or a series view
// (seasons and episodes). Emits `play-item` { item, startPosition } and
// `refresh-request`.

import { createSources, episodeNumber, resumeSeconds, runtimeLabel, SORTS } from '../jellyfin/library.js';
import { formatTime } from './player-controls.js';
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

const EPISODE_ROWS = 6;
const EPISODES_PER_PAGE = EPISODE_ROWS * 2;
const MAX_SEASON_TABS = 8;

const TABS = [
	{ id: 'resume', label: 'Continue watching', empty: 'Nothing in progress.' },
	{ id: 'nextUp', label: 'Next up', empty: 'No next episodes.' },
	{ id: 'latestMovies', label: 'New movies', empty: 'No movies added recently.' },
	{ id: 'latestShows', label: 'New shows', empty: 'No episodes added recently.' },
	{ id: 'movies', label: 'Movies', type: 'Movie', noun: ['movie', 'movies'], empty: 'No movies in your library.' },
	{ id: 'shows', label: 'Shows', type: 'Series', noun: ['show', 'shows'], empty: 'No shows in your library.' },
	{ id: 'search', label: 'Search', noun: ['result', 'results'], empty: 'No results.' },
];

const pages = (total, perPage) => Math.max(1, Math.ceil(total / perPage));

AFRAME.registerComponent('library-panel', {
	init() {
		this.api = null;
		this.sources = null;
		this.visible = true;
		this.tab = 'resume';
		/** Views opened on top of the tab grid: { type: 'detail' | 'series', item, ... } */
		this.stack = [];
		this.page = 0;
		this.sortIndex = { movies: 0, shows: 0 };
		this.searchText = '';
		this.loadToken = 0;
		this.searchTimer = null;

		this.el.append(entity({ 'ui-rect': `width: ${WIDTH}; height: ${HEIGHT}; radius: 0.04; opacity: 0.95` }));
		this.heading = entity({ position: `${LEFT} ${TOP - 0.065} 0.002`, 'ui-text': 'value: Now showing; fontSize: 0.05; weight: bold; anchorX: left' });
		this.refreshButton = this.button({ label: 'Refresh', width: 0.18 }, RIGHT - 0.09, TOP - 0.065, () => this.el.emit('refresh-request'));
		this.message = entity({ position: '0 0 0.002', 'ui-text': `fontSize: 0.036; maxWidth: ${WIDTH - 0.4}; align: center; color: ${COLORS.muted}` });
		this.notice = entity({ position: `0 ${-TOP - 0.06} 0.002`, 'ui-text': `fontSize: 0.032; maxWidth: ${WIDTH}; align: center; color: #ff6b7a` });
		this.el.append(this.heading, this.refreshButton, this.message, this.notice);

		this.buildTabs();
		this.buildGrid();
		this.buildDetail();
		this.buildSeries();

		// At lap height, in front of the seat ahead (which would hide it further away).
		this.keyboard = entity({ 'ui-keyboard': '', position: '0 -0.5 1.45', rotation: '-40 0 0', scale: '0.85 0.85 0.85' });
		this.keyboard.addEventListener('key', (event) => this.onKey(event.detail.key));
		this.el.appendChild(this.keyboard);

		this.onKeyDown = this.onKeyDown.bind(this);
		window.addEventListener('keydown', this.onKeyDown);
		this.render();
	},

	remove() {
		window.removeEventListener('keydown', this.onKeyDown);
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
			x += width + 0.022;
		}
	},

	buildGrid() {
		this.grid = entity();
		this.el.appendChild(this.grid);
		const toolbarY = CONTENT_TOP - 0.03;
		this.gridInfo = entity({ position: `${RIGHT} ${toolbarY} 0.002`, 'ui-text': `fontSize: 0.026; color: ${COLORS.muted}; anchorX: right` });
		this.sortButton = this.button({ label: 'Sort', width: 0.34 }, LEFT + 0.17, toolbarY, () => this.cycleSort(), this.grid);
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
		this.detailOverview = this.text({ fontSize: 0.028, maxWidth, lineHeight: 1.35 }, x, CONTENT_TOP - 0.19, this.detail);

		const y = CONTENT_TOP - 0.72;
		this.detailPlay = this.button({ label: 'Play', width: 0.42, activeColor: COLORS.accent, active: true }, x + 0.21, y, () => this.playFromDetail(true), this.detail);
		this.detailRestart = this.button({ label: 'Play from start', width: 0.32 }, x + 0.42 + 0.03 + 0.16, y, () => this.playFromDetail(false), this.detail);
		this.detailSeries = this.button({ label: 'Go to series', width: 0.26 }, x + 0.77 + 0.03 + 0.13, y, () => this.openSeriesOf(this.top().item), this.detail);
		this.detailBack = this.button({ label: '‹ Back', width: 0.2 }, RIGHT - 0.1, y, () => this.back(), this.detail);
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
		if (item.Type === 'Series') this.stack.push({ type: 'series', item, seasonIndex: 0, episodePage: 0, episodeSources: {} });
		else this.stack.push({ type: 'detail', item });
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
		const { item } = this.top();
		this.el.emit('play-item', { item, startPosition: resume ? undefined : 0 });
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
		for (const tab of TABS) {
			const el = this.tabEls[tab.id];
			el.setAttribute('ui-button', 'active', tab.id === this.tab);
			this.show(el, signedIn);
		}
		this.show(this.grid, signedIn && !view);
		this.show(this.detail, signedIn && view?.type === 'detail');
		this.show(this.series, signedIn && view?.type === 'series');
		this.keyboard.components['ui-keyboard']?.setVisible(this.searchActive() && signedIn);
		this.setMessage(signedIn ? '' : 'Sign in from the lobby to see your library.');
		if (!signedIn || !this.visible) return;

		if (!view) this.renderGrid();
		else if (view.type === 'detail') this.renderDetail(view);
		else this.renderSeries(view);
	},

	setMessage(text) {
		this.message.setAttribute('ui-text', 'value', text);
	},

	gridSource(tab) {
		if (tab.id === 'movies' || tab.id === 'shows') return this.sources.collection(tab.type, SORTS[this.sortIndex[tab.id]]);
		if (tab.id === 'search') return this.sources.search(this.searchText.trim());
		return this.sources[tab.id];
	},

	async renderGrid() {
		const tab = TABS.find((t) => t.id === this.tab);
		const sortable = tab.id === 'movies' || tab.id === 'shows';
		const isSearch = tab.id === 'search';
		this.show(this.sortButton, sortable);
		this.show(this.searchField, isSearch);
		if (sortable) this.sortButton.setAttribute('ui-button', 'label', `Sort: ${SORTS[this.sortIndex[tab.id]].label}`);
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
		this.detailOverview.setAttribute('ui-text', 'value', truncate(item.Overview ?? '', 640));

		const resume = resumeSeconds(item);
		this.detailPlay.setAttribute('ui-button', 'label', resume > 0 ? `Resume from ${formatTime(resume)}` : 'Play');
		this.show(this.detailRestart, resume > 0);
		this.show(this.detailSeries, isEpisode && Boolean(item.SeriesId));
		// Without "Play from start", "Go to series" moves next to "Play".
		this.detailSeries.object3D.position.x = this.detailX + (resume > 0 ? 0.93 : 0.58);
	},

	async renderSeries(view) {
		const { item } = view;
		whenLoaded(this.seriesPoster, () => this.seriesPoster.components['ui-poster'].setItem(this.api, item));
		this.seriesTitle.setAttribute('ui-text', 'value', truncate(item.Name, 48));
		this.seriesOverview.setAttribute('ui-text', 'value', truncate(item.Overview ?? '', 300));
		this.show(this.seriesPlayNext, Boolean(view.nextUp));

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

	renderSeasonTabs(view) {
		this.seasonRow.replaceChildren();
		const width = 0.19;
		view.seasons.slice(0, MAX_SEASON_TABS).forEach((season, index) => {
			this.button(
				{ label: truncate(season.Name, 13), width, height: 0.06, fontSize: 0.024, active: index === view.seasonIndex },
				this.seriesX + width / 2 + index * (width + 0.015),
				0,
				() => {
					view.seasonIndex = index;
					view.episodePage = 0;
					this.render();
				},
				this.seasonRow,
			);
		});
		this.show(this.seasonRow, true);
	},
});

function episodeLabel(episode) {
	const number = episode.IndexNumber != null ? `${episode.IndexNumber}. ` : '';
	let status = runtimeLabel(episode);
	if (episode.UserData?.Played) status = 'Watched';
	else if (episode.UserData?.PlayedPercentage) status = `${Math.round(episode.UserData.PlayedPercentage)}% watched`;
	return `${number}${episode.Name}${status ? `  ·  ${status}` : ''}`;
}
