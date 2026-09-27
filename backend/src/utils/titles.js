/**
 * Title normalization helpers shared by catalog ingest and search.
 * Utils layer: English/native/fallback mapping, merge of alternative titles, and Mongo $or matchers.
 */

/**
 * Trim a title string and collapse runs of whitespace; non-strings become empty.
 * @param {unknown} value
 * @returns {string}
 */
export function normalizeTitle(value) {
  if (typeof value !== 'string') return ''
  return value.trim().replace(/\s+/g, ' ')
}

/**
 * Comparison key for a title: full-width forms folded (NFKC), lowercased, and
 * all whitespace removed, so "Re:Zero", "re: zero", and "RE:ZERO" share a key.
 * Must stay in step with `TITLE_KEY_SQL` in `db/mongoFilter.js`.
 * @param {unknown} value
 * @returns {string}
 */
export function titleKey(value) {
  return normalizeTitle(value).normalize('NFKC').toLowerCase().replace(/\s+/g, '')
}

/**
 * Title equality ignoring case and spacing; empty strings never match.
 * @param {unknown} left
 * @param {unknown} right
 * @returns {boolean}
 */
export function titlesEqual(left, right) {
  const a = titleKey(left)
  return Boolean(a) && a === titleKey(right)
}

/**
 * Flatten title groups and drop duplicates by `titleKey`, preserving first-seen casing.
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
      const key = titleKey(title)
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
 * Season and part a title names ("Season 2", "2nd Season", "Part 2"); 1 when absent.
 * @param {unknown} title
 * @returns {{ season: number, part: number }}
 */
export function titleSeason(title) {
  const text = normalizeTitle(title).normalize('NFKC')
  const season = text.match(/\bseason\s*(\d+)\b/i) || text.match(/\b(\d+)(?:st|nd|rd|th)\s+season\b/i)
  const part = text.match(/\b(?:part|cour)\s*(\d+)\b/i)
  return { season: season ? Number(season[1]) : 1, part: part ? Number(part[1]) : 1 }
}

/**
 * Season/part of a content row from its main names (not aliases): the first
 * name that states one wins, otherwise season 1 part 1.
 * @param {object} [content={}]
 * @returns {{ season: number, part: number }}
 */
export function contentSeason(content = {}) {
  const names = [content.title, content.englishTitle, content.nativeTitle, content.originalTitle]
  for (const name of names) {
    const marker = titleSeason(name)
    if (marker.season !== 1 || marker.part !== 1) return marker
  }
  return { season: 1, part: 1 }
}

/**
 * True when two rows' main names place them in different seasons or parts,
 * even if an alias (e.g. TMDB listing every season's name on one show) overlaps.
 * @param {object} [left={}]
 * @param {object} [right={}]
 * @returns {boolean}
 */
export function seasonsConflict(left = {}, right = {}) {
  const a = contentSeason(left)
  const b = contentSeason(right)
  return a.season !== b.season || a.part !== b.part
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
 * True when both rows already have a TMDB, MAL, or AniList id and those ids differ.
 * Same-name franchise entries must stay separate instead of merging into one row.
 * @param {object} [left={}]
 * @param {object} [right={}]
 * @returns {boolean}
 */
export function externalIdsConflict(left = {}, right = {}) {
  return ['tmdbId', 'malId', 'anilistId'].some((field) => {
    const leftId = numericExternalId(left[field])
    const rightId = numericExternalId(right[field])
    return leftId != null && rightId != null && leftId !== rightId
  })
}

/**
 * Filter condition matching a title field by `titleKey` (case and spacing ignored).
 * @param {unknown} title
 * @returns {{ $titleKey: string } | null} null when the title is empty
 */
export function titleKeyMatcher(title) {
  const key = titleKey(title)
  return key ? { $titleKey: key } : null
}

/**
 * Mongo `$or` that matches every searchable name on `content` against every
 * title field, ignoring case and spacing.
 * @param {object} [content={}]
 * @returns {object[]}
 */
export function contentExactTitlesMatchOr(content = {}) {
  return collectContentTitles(content).flatMap((title) => {
    const matcher = titleKeyMatcher(title)
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
