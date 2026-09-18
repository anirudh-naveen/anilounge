/**
 * Title normalization helpers shared by catalog ingest and search.
 * Utils layer: English/native/fallback mapping, merge of alternative titles, and Mongo $or matchers.
 */

/**
 * Trim a title string; non-strings become empty.
 * @param {unknown} value
 * @returns {string}
 */
export function normalizeTitle(value) {
  if (typeof value !== 'string') return ''
  return value.trim()
}

/**
 * Case-insensitive equality after trim; empty strings never match.
 * @param {unknown} left
 * @param {unknown} right
 * @returns {boolean}
 */
export function titlesEqual(left, right) {
  const a = normalizeTitle(left).toLowerCase()
  const b = normalizeTitle(right).toLowerCase()
  return Boolean(a) && a === b
}

/**
 * Flatten title groups and drop case-insensitive duplicates, preserving first-seen casing.
 * @param {...(string | string[] | undefined)} groups
 * @returns {string[]}
 */
export function uniqueTitles(...groups) {
  const seen = new Set()
  const result = []

  for (const group of groups) {
    const values = Array.isArray(group) ? group : [group]
    for (const value of values) {
      const title = normalizeTitle(value)
      if (!title) continue
      const key = title.toLowerCase()
      if (seen.has(key)) continue
      seen.add(key)
      result.push(title)
    }
  }

  return result
}

/**
 * All searchable title fields on a content document.
 * @param {{ englishTitle?: string, title?: string, nativeTitle?: string, originalTitle?: string, alternativeTitles?: string[] }} [content={}]
 * @returns {string[]}
 */
export function collectContentTitles(content = {}) {
  return uniqueTitles(
    content.englishTitle,
    content.title,
    content.nativeTitle,
    content.originalTitle,
    content.alternativeTitles,
  )
}

/**
 * True when any searchable name on the left matches any searchable name on the right.
 * Catches TMDB/MAL duplicates whose English and native titles are swapped across sources.
 * @param {object} [left={}]
 * @param {object} [right={}]
 * @returns {boolean}
 */
export function contentTitlesOverlap(left = {}, right = {}) {
  const rightTitles = collectContentTitles(right)
  return collectContentTitles(left).some((leftTitle) =>
    rightTitles.some((rightTitle) => titlesEqual(leftTitle, rightTitle)),
  )
}

/**
 * Positive numeric TMDB/MAL id, or null when missing.
 * @param {unknown} value
 * @returns {number | null}
 */
function numericExternalId(value) {
  if (value == null || value === '') return null
  const id = Number(value)
  return Number.isFinite(id) && id > 0 ? id : null
}

/**
 * True when both rows already have a TMDB id or both have a MAL id, and those ids differ.
 * Same-name franchise entries must stay separate instead of merging into one row.
 * @param {object} [left={}]
 * @param {object} [right={}]
 * @returns {boolean}
 */
export function externalIdsConflict(left = {}, right = {}) {
  const leftTmdb = numericExternalId(left.tmdbId)
  const rightTmdb = numericExternalId(right.tmdbId)
  if (leftTmdb != null && rightTmdb != null && leftTmdb !== rightTmdb) {
    return true
  }

  const leftMal = numericExternalId(left.malId)
  const rightMal = numericExternalId(right.malId)
  if (leftMal != null && rightMal != null && leftMal !== rightMal) {
    return true
  }

  return false
}

/**
 * Escape a title for an exact, case-insensitive Mongo regex.
 * @param {unknown} title
 * @returns {object | null} `{ $regex, $options }` or null when empty
 */
export function exactTitleMatcher(title) {
  const escaped = normalizeTitle(title).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  if (!escaped) return null
  return { $regex: `^${escaped}$`, $options: 'i' }
}

/**
 * Mongo `$or` that exact-matches every searchable name on `content` against every title field.
 * @param {object} [content={}]
 * @returns {object[]}
 */
export function contentExactTitlesMatchOr(content = {}) {
  return collectContentTitles(content).flatMap((title) => {
    const matcher = exactTitleMatcher(title)
    return matcher ? contentTitleMatchOr(matcher) : []
  })
}

/**
 * Map API title fields onto the Content schema.
 * Canonical `title` prefers English, then fallback, then native. `originalTitle` mirrors native.
 * Alternatives exclude values already stored as title/english/native.
 * @param {{ englishTitle?: string, nativeTitle?: string, fallbackTitle?: string, alternativeTitles?: string[] }} [fields]
 * @returns {{ title: string, englishTitle?: string, nativeTitle?: string, originalTitle?: string, alternativeTitles: string[] }}
 */
export function buildTitleFields({
  englishTitle,
  nativeTitle,
  fallbackTitle,
  alternativeTitles = [],
} = {}) {
  const english = normalizeTitle(englishTitle)
  const native = normalizeTitle(nativeTitle)
  const fallback = normalizeTitle(fallbackTitle)
  const title = english || fallback || native
  const alternatives = uniqueTitles(fallback, alternativeTitles).filter(
    (candidate) =>
      !titlesEqual(candidate, title) &&
      !titlesEqual(candidate, english) &&
      !titlesEqual(candidate, native),
  )

  return {
    title: title || 'Unknown Title',
    englishTitle: english || undefined,
    nativeTitle: native || undefined,
    originalTitle: native || undefined,
    alternativeTitles: alternatives,
  }
}

/**
 * Merge incoming TMDB/MAL titles into an existing document.
 * TMDB merges prefer incoming English; MAL merges prefer incoming native.
 * @param {object} [existing={}]
 * @param {object} [incoming={}]
 * @param {{ preferIncomingEnglish?: boolean, preferIncomingNative?: boolean }} [options={}]
 * @returns {ReturnType<typeof buildTitleFields>}
 */
export function applyTitleFields(existing = {}, incoming = {}, options = {}) {
  const preferIncomingEnglish = options.preferIncomingEnglish === true
  const preferIncomingNative = options.preferIncomingNative === true

  const englishTitle = preferIncomingEnglish
    ? incoming.englishTitle || existing.englishTitle
    : existing.englishTitle || incoming.englishTitle
  const nativeTitle = preferIncomingNative
    ? incoming.nativeTitle || existing.nativeTitle
    : existing.nativeTitle || incoming.nativeTitle

  return buildTitleFields({
    englishTitle,
    nativeTitle,
    fallbackTitle: englishTitle || existing.title || incoming.title,
    alternativeTitles: [
      existing.title,
      incoming.title,
      existing.englishTitle,
      incoming.englishTitle,
      existing.nativeTitle,
      incoming.nativeTitle,
      existing.originalTitle,
      incoming.originalTitle,
      ...(existing.alternativeTitles || []),
      ...(incoming.alternativeTitles || []),
    ],
  })
}

/**
 * Mongo `$or` clauses that match a title matcher against every title field.
 * @param {object} matcher - e.g. `{ $regex, $options }`
 * @returns {object[]}
 */
export function contentTitleMatchOr(matcher) {
  return [
    { title: matcher },
    { englishTitle: matcher },
    { nativeTitle: matcher },
    { originalTitle: matcher },
    { alternativeTitles: matcher },
  ]
}
