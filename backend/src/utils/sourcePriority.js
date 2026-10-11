/**
 * Which source a watchable's fields come from. Each source (AniList, MAL, TMDB) gives a
 * normalized snapshot of the same fields (stored in `content_source_data`); a field
 * takes the first value in the row's source order. Anime follows AniList, then MAL,
 * then TMDB; everything else follows TMDB, then AniList, then MAL. Scores and ranks stay
 * per source, and ids from every source are kept.
 *
 * Utils layer: pure. Callers store the resolved fields; `Content.save` re-applies admin
 * edits on top, so they still win.
 */

export const SOURCES = ['anilist', 'mal', 'tmdb']

const ANIME_ORDER = ['anilist', 'mal', 'tmdb']
const DEFAULT_ORDER = ['tmdb', 'anilist', 'mal']

/** Fields resolved by source order. Snapshots use these names. */
export const RESOLVED_FIELDS = [
  'title',
  'romajiTitle',
  'nativeTitle',
  'synonyms',
  'overview',
  'tagline',
  'posterPath',
  'backdropPath',
  'bannerPath',
  'coverColor',
  'releaseDate',
  'endDate',
  'airingStatus',
  'format',
  'episodeCount',
  'episodeRuntime',
  'runtime',
  'startSeason',
  'startYear',
  'broadcastDay',
  'broadcastTime',
  'nextEpisodeAt',
  'nextEpisodeNumber',
  'genres',
  'tags',
  'studios',
  'staff',
  'originCountry',
  'ageRating',
  'sourceMaterial',
  'trailer',
]

/**
 * Fields that always come from one source, whatever the order: each site's own
 * score, vote count, and rank, and TMDB's popularity (the catalog order uses it).
 */
export const FIXED_FIELDS = {
  tmdbScore: ['tmdb', 'score'],
  tmdbVotes: ['tmdb', 'votes'],
  popularity: ['tmdb', 'popularity'],
  malScore: ['mal', 'score'],
  malVotes: ['mal', 'votes'],
  malRank: ['mal', 'rank'],
  anilistScore: ['anilist', 'score'],
}

/**
 * Whether a value counts as missing: null, undefined, blank text, or an empty list.
 * @param {unknown} value
 * @returns {boolean}
 */
export function isMissing(value) {
  if (value == null) return true
  if (typeof value === 'string') return !value.trim()
  if (Array.isArray(value)) return value.length === 0
  if (typeof value === 'number') return !Number.isFinite(value)
  return false
}

/**
 * Whether a row is anime: MAL or AniList lists it.
 * @param {{ malId?: unknown, anilistId?: unknown }} [ids]
 * @param {Record<string, object>} [snapshots]
 * @returns {boolean}
 */
export function isAnime(ids = {}, snapshots = {}) {
  return Boolean(ids.malId || ids.anilistId || snapshots.anilist || snapshots.mal)
}

/**
 * Source order for a row.
 * @param {boolean} anime
 * @returns {string[]}
 */
export function sourceOrder(anime) {
  return anime ? ANIME_ORDER : DEFAULT_ORDER
}

/**
 * Resolve a row's fields from its source snapshots.
 * @param {Record<string, object | null | undefined>} snapshots - `{ anilist, mal, tmdb }`
 * @param {{ anime: boolean }} options
 * @returns {{ fields: Record<string, unknown>, sources: Record<string, string>,
 *   externalIds: Record<string, string> }} `sources` names where each field came from.
 */
export function resolveFields(snapshots, { anime }) {
  const order = sourceOrder(anime)
  const fields = {}
  const sources = {}

  for (const field of RESOLVED_FIELDS) {
    for (const source of order) {
      const value = snapshots[source]?.[field]
      if (isMissing(value)) continue
      fields[field] = value
      sources[field] = source
      break
    }
  }

  for (const [field, [source, key]] of Object.entries(FIXED_FIELDS)) {
    const value = snapshots[source]?.[key]
    if (isMissing(value)) continue
    fields[field] = value
    sources[field] = source
  }

  return { fields, sources, externalIds: mergeExternalIds(snapshots, order) }
}

/**
 * Ids on other sites from every snapshot; the earlier source wins a disagreement.
 * @param {Record<string, object | null | undefined>} snapshots
 * @param {string[]} order
 * @returns {Record<string, string>}
 */
export function mergeExternalIds(snapshots, order) {
  const merged = {}
  for (const source of [...order].reverse()) {
    for (const [site, id] of Object.entries(snapshots[source]?.externalIds || {})) {
      if (!isMissing(id)) merged[site] = String(id)
    }
  }
  return merged
}
