import { getGenreApi } from '@jellyfin/sdk/lib/utils/api/genre-api';
import { getLibraryApi } from '@jellyfin/sdk/lib/utils/api/library-api';
import { getMediaSegmentApi } from '@jellyfin/sdk/lib/utils/api/media-segment-api';
import { getShowApi } from '@jellyfin/sdk/lib/utils/api/show-api';
import { getUserDataApi } from '@jellyfin/sdk/lib/utils/api/user-data-api';
import { TICKS_PER_SECOND } from './playback.js';

// MediaSources: quality badges and the compatibility estimate on posters.
const FIELDS = ['Overview', 'MediaSourceCount', 'MediaSources', 'PrimaryImageAspectRatio', 'Genres', 'ChildCount'];
const IMAGE_TYPES = ['Primary', 'Thumb', 'Backdrop'];
const LATEST_LIMIT = 42;

/**
 * @typedef {object} Page
 * @property {object[]} items
 * @property {number} total
 */

/**
 * @typedef {object} Source A paged list of items.
 * @property {(startIndex: number, limit: number) => Promise<Page>} load
 */

export const SORTS = [
	{ label: 'Name', sortBy: ['SortName'], sortOrder: ['Ascending'] },
	{ label: 'Date added', sortBy: ['DateCreated', 'SortName'], sortOrder: ['Descending', 'Ascending'] },
	{ label: 'Release date', sortBy: ['PremiereDate', 'SortName'], sortOrder: ['Descending', 'Ascending'] },
	{ label: 'Rating', sortBy: ['CommunityRating', 'SortName'], sortOrder: ['Descending', 'Ascending'] },
];

/** Wraps a fixed list (APIs without server-side paging) as a Source. */
function listSource(fetchAll) {
	let cache = null;
	return {
		async load(startIndex, limit) {
			cache ??= await fetchAll();
			return { items: cache.slice(startIndex, startIndex + limit), total: cache.length };
		},
	};
}

/**
 * The browsing sources behind the library panel's tabs.
 * @param {import('@jellyfin/sdk').Api} api
 * @param {string} userId
 */
export function createSources(api, userId) {
	const common = { userId, fields: FIELDS, enableImageTypes: IMAGE_TYPES, imageTypeLimit: 1, enableUserData: true };
	const library = getLibraryApi(api);
	const shows = getShowApi(api);
	const latestCache = {};
	const page = ({ data }) => ({ items: data.Items ?? [], total: data.TotalRecordCount ?? data.Items?.length ?? 0 });

	return {
		resume: {
			load: (startIndex, limit) => library.getResumeItems({ ...common, startIndex, limit, mediaTypes: ['Video'], enableTotalRecordCount: true }).then(page),
		},
		nextUp: {
			load: (startIndex, limit) => shows.getNextUp({ ...common, startIndex, limit, enableResumable: false, enableTotalRecordCount: true }).then(page),
		},
		/**
		 * Recently added movies ('Movie') or episodes ('Episode', grouped: a show
		 * with several new episodes appears once, as the series).
		 */
		latest(type) {
			latestCache[type] ??= listSource(async () => (await library.getLatestMedia({
				...common,
				limit: LATEST_LIMIT,
				includeItemTypes: [type],
				groupItems: type === 'Episode',
			})).data ?? []);
			return latestCache[type];
		},
		/**
		 * @param {'Movie' | 'Series'} type
		 * @param {{ sortBy: string[], sortOrder: string[] }} sort
		 * @param {{ genreId?: string, unwatched?: boolean }} [filters]
		 */
		collection(type, sort, filters = {}) {
			return {
				load: (startIndex, limit) => library.getItems({
					...common,
					startIndex,
					limit,
					includeItemTypes: [type],
					recursive: true,
					sortBy: sort.sortBy,
					sortOrder: sort.sortOrder,
					genreIds: filters.genreId ? [filters.genreId] : undefined,
					isPlayed: filters.unwatched ? false : undefined,
					enableTotalRecordCount: true,
				}).then(page),
			};
		},
		favorites: {
			load: (startIndex, limit) => library.getItems({
				...common,
				startIndex,
				limit,
				includeItemTypes: ['Movie', 'Series', 'Episode'],
				recursive: true,
				isFavorite: true,
				sortBy: ['SortName'],
				enableTotalRecordCount: true,
			}).then(page),
		},
		/** @param {'Movie' | 'Series'} type */
		genres: async (type) => (await getGenreApi(api).getGenres({ userId, includeItemTypes: [type], sortBy: ['SortName'] })).data.Items ?? [],
		search(term) {
			return {
				load: (startIndex, limit) => library.getItems({
					...common,
					startIndex,
					limit,
					searchTerm: term,
					includeItemTypes: ['Movie', 'Series', 'Episode'],
					recursive: true,
					enableTotalRecordCount: true,
				}).then(page),
			};
		},
		seasons: async (seriesId) => (await shows.getSeasons({ ...common, seriesId })).data.Items ?? [],
		episodes(seriesId, seasonId) {
			return listSource(async () => (await shows.getEpisodes({ ...common, seriesId, seasonId })).data.Items ?? []);
		},
		/** Fresh copy of an item (e.g. its resume point after watching), with its media versions. */
		item: async (id) => (await library.getItems({ ...common, fields: [...FIELDS, 'Chapters', 'Trickplay'], ids: [id] })).data.Items?.[0] ?? null,
		/** @returns {Promise<object>} the updated UserData */
		setPlayed: async (itemId, played) => {
			const userData = getUserDataApi(api);
			const { data } = played
				? await userData.markPlayedItem({ itemId, userId })
				: await userData.markUnplayedItem({ itemId, userId });
			return data;
		},
		setFavorite: async (itemId, favorite) => {
			const userData = getUserDataApi(api);
			const { data } = favorite
				? await userData.markFavoriteItem({ itemId, userId })
				: await userData.unmarkFavoriteItem({ itemId, userId });
			return data;
		},
		/** Start of the end credits in seconds (needs media segments on the server), or null. */
		/**
		 * Intros, recaps, previews, commercials and credits (needs media segment
		 * detection on the server), sorted by start, in seconds.
		 * @returns {Promise<Array<{ type: string, start: number, end: number }>>}
		 */
		segments: async (itemId) => {
			try {
				const { data } = await getMediaSegmentApi(api).getItemSegments({ itemId });
				return (data.Items ?? [])
					.map((s) => ({ type: s.Type, start: s.StartTicks / TICKS_PER_SECOND, end: s.EndTicks / TICKS_PER_SECOND }))
					.filter((s) => s.end > s.start)
					.sort((a, b) => a.start - b.start);
			} catch {
				return [];
			}
		},
		/** The episode after `episode` in its series (across seasons), or null. */
		nextEpisode: async (episode) => {
			const { data } = await shows.getEpisodes({ ...common, seriesId: episode.SeriesId, startItemId: episode.Id, limit: 2 });
			const [current, next] = data.Items ?? [];
			return current?.Id === episode.Id ? (next ?? null) : null;
		},
		nextUpForSeries: async (seriesId) => (await shows.getNextUp({ ...common, seriesId, limit: 1 })).data.Items?.[0] ?? null,
	};
}

/**
 * Portrait poster URL for an item (series poster for episodes).
 * @param {import('@jellyfin/sdk').Api} api
 */
export function posterUrl(api, item, height = 720) {
	let id = item.Id;
	let tag = item.ImageTags?.Primary;
	if (item.Type === 'Episode' && item.SeriesPrimaryImageTag) {
		id = item.SeriesId;
		tag = item.SeriesPrimaryImageTag;
	}
	if (!tag) return null;
	return api.getUri(`/Items/${id}/Images/Primary`, { fillHeight: height, quality: 90, tag });
}

export function episodeNumber(item) {
	if (item.ParentIndexNumber == null || item.IndexNumber == null) return '';
	return `S${item.ParentIndexNumber}:E${item.IndexNumber}`;
}

/** Display title and subtitle for a card or the player. */
export function describeItem(item) {
	if (item.Type === 'Episode') {
		const number = episodeNumber(item);
		return { title: item.SeriesName ?? item.Name, subtitle: number ? `${number} · ${item.Name}` : item.Name };
	}
	if (item.Type === 'Series') {
		const unplayed = item.UserData?.UnplayedItemCount;
		const years = item.ProductionYear ? String(item.ProductionYear) : 'Series';
		return { title: item.Name, subtitle: unplayed ? `${years} · ${unplayed} unwatched` : years };
	}
	return { title: item.Name, subtitle: item.ProductionYear ? String(item.ProductionYear) : '' };
}

/** Played fraction (0-1) of an item: 1 when watched, 0 when untouched. */
export function playedFraction(item) {
	if (item.UserData?.Played) return 1;
	return item.UserData?.PlayedPercentage ? item.UserData.PlayedPercentage / 100 : 0;
}

export function resumeSeconds(item) {
	return (item.UserData?.PlaybackPositionTicks ?? 0) / TICKS_PER_SECOND;
}

export function runtimeLabel(item) {
	const minutes = Math.round((item.RunTimeTicks ?? 0) / TICKS_PER_SECOND / 60);
	if (!minutes) return '';
	return minutes >= 60 ? `${Math.floor(minutes / 60)} h ${minutes % 60} min` : `${minutes} min`;
}

/**
 * Seek bar previews (Jellyfin trickplay): thumbnails packed in tiles.
 * @returns {{ width: number, height: number, columns: number, rows: number, count: number, interval: number, tileUrl: (index: number) => string } | null}
 */
export function trickplayInfo(api, item, mediaSourceId) {
	const resolutions = item.Trickplay?.[mediaSourceId] ?? Object.values(item.Trickplay ?? {})[0];
	if (!resolutions) return null;
	// The smallest resolution of at least 240 px wide is plenty for a preview.
	const infos = Object.values(resolutions).sort((a, b) => a.Width - b.Width);
	const info = infos.find((i) => i.Width >= 240) ?? infos[infos.length - 1];
	if (!info?.ThumbnailCount) return null;
	return {
		width: info.Width,
		height: info.Height,
		columns: info.TileWidth,
		rows: info.TileHeight,
		count: info.ThumbnailCount,
		interval: info.Interval / 1000,
		tileUrl: (index) => api.getUri(`/Videos/${item.Id}/Trickplay/${info.Width}/${index}.jpg`, { mediaSourceId, api_key: api.accessToken }),
	};
}

/** Chapters, in seconds. */
export function chapters(item) {
	return (item.Chapters ?? []).map((c) => ({ start: c.StartPositionTicks / TICKS_PER_SECOND, name: c.Name ?? '' }));
}
