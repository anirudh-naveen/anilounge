/**
 * TV catalog tab filters and sort stages.
 * Utils layer: Mongo match/sort for Popular Right Now, Currently Airing, and Upcoming Highlights.
 */

export const TV_CATALOG_TABS = ['popular', 'airing', 'upcoming']

/**
 * Coerce a query value to a TV catalog tab id.
 * @param {unknown} value - Raw `tab` query param.
 * @returns {'popular'|'airing'|'upcoming'}
 */
export function normalizeTvCatalogTab(value) {
  return TV_CATALOG_TABS.includes(value) ? value : 'popular'
}

/**
 * Extra `$addFields` used so missing air/release dates sort last on airing/upcoming tabs.
 * @param {'popular'|'airing'|'upcoming'} tab
 * @returns {object}
 */
export function catalogTabDateFields(tab) {
  if (tab === 'airing') {
    return {
      hasScheduleDate: { $cond: [{ $ifNull: ['$nextEpisodeAirDate', false] }, 1, 0] },
    }
  }
  if (tab === 'upcoming') {
    return {
      hasScheduleDate: { $cond: [{ $ifNull: ['$releaseDate', false] }, 1, 0] },
    }
  }
  return {}
}

/**
 * Aggregation `$sort` for a TV catalog tab.
 * Popular uses the hidden score. Airing prefers the next episode. Upcoming prefers premiere date.
 * @param {'popular'|'airing'|'upcoming'} tab
 * @returns {object}
 */
export function sortForTvCatalogTab(tab) {
  if (tab === 'airing') {
    return { hasScheduleDate: -1, nextEpisodeAirDate: 1, hiddenSortScore: -1, _id: -1 }
  }
  if (tab === 'upcoming') {
    return { hasScheduleDate: -1, releaseDate: 1, hiddenSortScore: -1, _id: -1 }
  }
  return { hiddenSortScore: -1, _id: -1 }
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
 * Combine a content-type filter with an optional TV catalog tab filter.
 * @param {object} typeQuery - From `matchContentType`.
 * @param {object} tabQuery - From `matchTvCatalogTab`.
 * @returns {object}
 */
export function mergeCatalogQuery(typeQuery, tabQuery) {
  const parts = [typeQuery, tabQuery].filter((part) => part && Object.keys(part).length > 0)
  if (parts.length === 0) return {}
  if (parts.length === 1) return parts[0]
  return { $and: parts }
}
