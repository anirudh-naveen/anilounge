/**
 * recommendationRank.js — Chat recommendation order: genre, studio, rating.
 *
 * Utils layer: score catalog rows so chatbot picks follow that hierarchy.
 * Ratings never outrank a better genre or studio match.
 */

const SKIP_GENRES = new Set(['animation'])

function normalizeName(value) {
  return String(value || '').trim().toLowerCase()
}

function uniqueNames(values) {
  const seen = new Set()
  const names = []
  for (const value of values || []) {
    const normalized = normalizeName(value)
    if (!normalized || seen.has(normalized)) continue
    seen.add(normalized)
    names.push(String(value).trim())
  }
  return names
}

/**
 * Genre labels on a catalog row, skipping the generic Animation tag.
 * @param {object} [doc]
 * @returns {string[]}
 */
export function catalogGenreNames(doc) {
  return uniqueNames(
    (doc?.genres || [])
      .map((genre) => (typeof genre === 'string' ? genre : genre?.name))
      .filter((name) => name && !SKIP_GENRES.has(normalizeName(name))),
  )
}

/**
 * Studio / production-company names on a catalog row.
 * @param {object} [doc]
 * @returns {string[]}
 */
export function catalogStudioNames(doc) {
  return uniqueNames([...(doc?.studios || []), ...(doc?.productionCompanies || [])])
}

/**
 * Unified catalog score, or null when the row has no usable rating.
 * @param {object} [doc]
 * @returns {number|null}
 */
export function catalogRatingScore(doc) {
  const score = Number(doc?.unifiedScore || doc?.malScore || doc?.voteAverage)
  return Number.isFinite(score) && score > 0 ? score : null
}

function preferredGenreNeedles(context = {}) {
  return uniqueNames([
    context.genre,
    ...(context.seedGenres || []),
    ...(context.favoriteGenres || []),
  ]).filter((name) => !SKIP_GENRES.has(normalizeName(name)))
}

function preferredStudioNeedles(context = {}) {
  return uniqueNames([
    context.studio,
    ...(context.seedStudios || []),
    ...(context.favoriteStudios || []),
  ])
}

function exactOverlapCount(haystack, needles) {
  const have = new Set((haystack || []).map(normalizeName))
  return (needles || []).filter((needle) => have.has(normalizeName(needle))).length
}

function studioOverlapCount(haystack, needles) {
  const names = (haystack || []).map(normalizeName).filter(Boolean)
  return (needles || []).filter((needle) => {
    const pref = normalizeName(needle)
    return names.some((name) => name === pref || name.includes(pref) || pref.includes(name))
  }).length
}

/**
 * Merge explicit chat filters with seed metadata stashed on similar-to rows.
 * @param {object[]} [docs]
 * @param {object} [context]
 * @returns {object}
 */
export function resolveRecommendationContext(docs = [], context = {}) {
  const seeded = (docs || []).find((doc) => doc?._recommendationRank)?._recommendationRank
  return { ...context, ...(seeded || {}) }
}

/**
 * Stash ranking needles on rows so a later re-sort keeps the same hierarchy.
 * @param {object[]} docs
 * @param {object} [meta]
 * @returns {object[]}
 */
export function withRecommendationRankMeta(docs, meta) {
  if (!meta) return docs || []
  return (docs || []).map((doc) => ({ ...doc, _recommendationRank: meta }))
}

/**
 * Comparable ranking signals. Higher values rank first at each level.
 * @param {object} doc
 * @param {object} [context]
 * @returns {{ genre: number, studio: number, rating: number, popularity: number, airing: number }}
 */
export function recommendationSignals(doc, context = {}) {
  const genres = catalogGenreNames(doc)
  const studios = catalogStudioNames(doc)
  const rating = catalogRatingScore(doc)
  const popularity = Number(doc?.popularity)
  return {
    genre: exactOverlapCount(genres, preferredGenreNeedles(context)),
    studio: studioOverlapCount(studios, preferredStudioNeedles(context)),
    rating: rating == null ? 0 : rating,
    popularity: Number.isFinite(popularity) ? popularity : 0,
    airing: doc?.malStatus === 'currently_airing' ? 1 : 0,
  }
}

/**
 * Sort comparator: genres, then studios, then ratings, then popularity/airing.
 * @param {object} a
 * @param {object} b
 * @param {object} [context]
 * @returns {number}
 */
export function compareRecommendationRank(a, b, context = {}) {
  const left = recommendationSignals(a, context)
  const right = recommendationSignals(b, context)
  return (
    right.genre - left.genre ||
    right.studio - left.studio ||
    right.rating - left.rating ||
    right.popularity - left.popularity ||
    right.airing - left.airing
  )
}

/**
 * Rank catalog rows for chatbot recommendations.
 * @param {object[]} docs
 * @param {object} [context]
 * @returns {object[]}
 */
export function sortByRecommendationRank(docs, context = {}) {
  const resolved = resolveRecommendationContext(docs, context)
  return [...(docs || [])].sort((a, b) => compareRecommendationRank(a, b, resolved))
}
