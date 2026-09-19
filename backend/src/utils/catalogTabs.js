/**
 * Catalog tab filters and sort stages for Movies and TV.
 * Utils layer: Mongo match/sort for Popular Right Now, Currently Airing,
 * Now in Theatres, and Upcoming Highlights.
 */

export const TV_CATALOG_TABS = ['popular', 'airing', 'upcoming']
export const MOVIE_CATALOG_TABS = ['popular', 'theatres', 'upcoming']

/** Animated films released in this window are treated as still in theatres. */
export const THEATRICAL_WINDOW_MS = 120 * 24 * 60 * 60 * 1000

/**
 * Coerce a query value to a TV catalog tab id.
 * @param {unknown} value - Raw `tab` query param.
 * @returns {'popular'|'airing'|'upcoming'}
 */
export function normalizeTvCatalogTab(value) {
  return TV_CATALOG_TABS.includes(value) ? value : 'popular'
}

/**
 * Coerce a query value to a movie catalog tab id.
 * @param {unknown} value - Raw `tab` query param.
 * @returns {'popular'|'theatres'|'upcoming'}
 */
export function normalizeMovieCatalogTab(value) {
  return MOVIE_CATALOG_TABS.includes(value) ? value : 'popular'
}

/**
 * Popular Right Now is a single highlight page on movie and TV catalogs.
 * @param {string} tab - Normalized tab id.
 * @returns {boolean}
 */
export function catalogTabIsSinglePage(tab) {
  return tab === 'popular'
}

/**
 * Extra `$addFields` used so missing air/release dates sort last on dated tabs.
 * @param {string} tab
 * @returns {object}
 */
export function catalogTabDateFields(tab) {
  if (tab === 'airing') {
    return {
      hasScheduleDate: { $cond: [{ $ifNull: ['$nextEpisodeAirDate', false] }, 1, 0] },
    }
  }
  if (tab === 'upcoming' || tab === 'theatres') {
    return {
      hasScheduleDate: { $cond: [{ $ifNull: ['$releaseDate', false] }, 1, 0] },
    }
  }
  return {}
}

/**
 * Aggregation `$sort` for a catalog tab.
 * Popular uses the hidden score. Airing prefers the next episode.
 * Theatres prefers newest release. Upcoming prefers premiere date.
 * @param {string} tab
 * @returns {object}
 */
export function sortForCatalogTab(tab) {
  if (tab === 'airing') {
    return { hasScheduleDate: -1, nextEpisodeAirDate: 1, hiddenSortScore: -1, _id: -1 }
  }
  if (tab === 'theatres') {
    return { hasScheduleDate: -1, releaseDate: -1, hiddenSortScore: -1, _id: -1 }
  }
  if (tab === 'upcoming') {
    return { hasScheduleDate: -1, releaseDate: 1, hiddenSortScore: -1, _id: -1 }
  }
  return { hiddenSortScore: -1, _id: -1 }
}

/** @deprecated Use `sortForCatalogTab`. */
export const sortForTvCatalogTab = sortForCatalogTab

/**
 * Upcoming titles: MAL `not_yet_aired`, or a future release with no finished/airing status.
 * @param {Date} from
 * @returns {object}
 */
function matchUpcoming(from) {
  return {
    $or: [
      { malStatus: 'not_yet_aired' },
      {
        malStatus: { $nin: ['finished_airing', 'currently_airing'] },
        releaseDate: { $gt: from },
      },
    ],
  }
}

/**
 * Mongo filter for a TV catalog tab. Popular adds no extra constraints.
 * Airing follows MAL `currently_airing`, with a future TMDB next-episode fallback.
 * Upcoming is MAL `not_yet_aired`, with a future release-date fallback.
 * @param {unknown} tab - Raw tab query value.
 * @param {Date} [from=new Date()] - Clock used for "future" date comparisons.
 * @returns {object} Empty object for popular; otherwise a TV-only match.
 */
export function matchTvCatalogTab(tab, from = new Date()) {
  const normalized = normalizeTvCatalogTab(tab)
  if (normalized === 'popular') return {}

  if (normalized === 'airing') {
    return {
      contentType: 'tv',
      $or: [
        { malStatus: 'currently_airing' },
        {
          malStatus: { $nin: ['finished_airing', 'not_yet_aired'] },
          nextEpisodeAirDate: { $gte: from },
        },
      ],
    }
  }

  return {
    contentType: 'tv',
    ...matchUpcoming(from),
  }
}

/**
 * Mongo filter for a movie catalog tab. Popular adds no extra constraints.
 * Theatres is theatrical movies released in the last four months (OVA/specials excluded).
 * Upcoming is MAL `not_yet_aired`, with a future release-date fallback.
 * @param {unknown} tab - Raw tab query value.
 * @param {Date} [from=new Date()] - Clock used for window comparisons.
 * @returns {object}
 */
export function matchMovieCatalogTab(tab, from = new Date()) {
  const normalized = normalizeMovieCatalogTab(tab)
  if (normalized === 'popular') return {}

  if (normalized === 'theatres') {
    const windowStart = new Date(from.getTime() - THEATRICAL_WINDOW_MS)
    return {
      contentType: 'movie',
      malStatus: { $nin: ['not_yet_aired'] },
      releaseDate: { $gte: windowStart, $lte: from },
    }
  }

  return matchUpcoming(from)
}

/**
 * Combine a content-type filter with an optional catalog tab filter.
 * @param {object} typeQuery - From `matchContentType`.
 * @param {object} tabQuery - From `matchTvCatalogTab` or `matchMovieCatalogTab`.
 * @returns {object}
 */
export function mergeCatalogQuery(typeQuery, tabQuery) {
  const parts = [typeQuery, tabQuery].filter((part) => part && Object.keys(part).length > 0)
  if (parts.length === 0) return {}
  if (parts.length === 1) return parts[0]
  return { $and: parts }
}
