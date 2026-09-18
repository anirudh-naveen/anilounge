/**
 * publicInfoLookup.js — Allowlisted encyclopedia URLs and summary parsing.
 *
 * Utils layer: Wikipedia REST helpers for catalog-grounded chat. Only
 * en.wikipedia.org is allowed. Topics are titles, studios, voice actors, and genres.
 */

import { collectContentTitles, titlesEqual, uniqueTitles } from './titles.js'

export const WIKIPEDIA_ORIGIN = 'https://en.wikipedia.org'
export const WIKIPEDIA_USER_AGENT =
  'AniLounge/1.0 (https://find-animation.vercel.app; catalog chatbot; wikipedia summary lookup)'

export const PUBLIC_INFO_KINDS = ['title', 'studio', 'voice_actor', 'genre', 'character']

export const ANIMATION_GENRES = [
  'Action',
  'Adventure',
  'Comedy',
  'Drama',
  'Fantasy',
  'Horror',
  'Romance',
  'Science Fiction',
  'Thriller',
  'Family',
  'Mystery',
  'Sports',
  'Mecha',
  'Slice of Life',
  'Supernatural',
  'Psychological',
  'Music',
  'Isekai',
  'Shounen',
  'Seinen',
  'Shoujo',
  'Josei',
]

const MAX_EXTRACT_CHARS = 600
const MAX_TITLE_CANDIDATES = 4

/**
 * Coerce a tool `kind` onto the allowed public-info topics.
 * @param {unknown} kind
 * @returns {'title'|'studio'|'voice_actor'|'genre'|'character'}
 */
export function normalizePublicInfoKind(kind) {
  const value = String(kind || 'title')
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, '_')
  if (value === 'movie' || value === 'series' || value === 'special' || value === 'show') {
    return 'title'
  }
  if (value === 'voiceactor' || value === 'seiyuu' || value === 'va') return 'voice_actor'
  if (value === 'char' || value === 'fictional_character') return 'character'
  if (PUBLIC_INFO_KINDS.includes(value)) return value
  return 'title'
}

/**
 * Whether a name is a known animation genre label.
 * @param {unknown} name
 * @returns {boolean}
 */
export function isKnownGenre(name) {
  const lower = String(name || '')
    .trim()
    .toLowerCase()
  if (!lower) return false
  return ANIMATION_GENRES.some((genre) => genre.toLowerCase() === lower)
}

/**
 * Wikipedia page titles to try for a topic name.
 * @param {string} name
 * @param {string} [kind='title']
 * @returns {string[]}
 */
export function wikiLookupCandidates(name, kind = 'title') {
  const base = String(name || '').trim()
  if (!base) return []
  const topic = normalizePublicInfoKind(kind)
  if (topic === 'studio') {
    return uniqueTitles(base, `${base} (studio)`, `${base} (company)`, `Studio ${base}`)
  }
  if (topic === 'voice_actor') {
    return uniqueTitles(base, `${base} (voice actor)`, `${base} (actress)`, `${base} (actor)`)
  }
  if (topic === 'character') {
    return uniqueTitles(
      base,
      `${base} (character)`,
      `${base} (fictional character)`,
      `${base} (anime)`,
    )
  }
  if (topic === 'genre') {
    return uniqueTitles(base, `${base} (genre)`, `${base} (fiction)`)
  }
  return [base]
}

/**
 * Whether encyclopedia text is about the requested animation topic.
 * @param {string} extract
 * @param {string} [description]
 * @param {string} kind
 * @returns {boolean}
 */
export function extractMatchesTopic(extract, description, kind) {
  const text = `${extract || ''} ${description || ''}`.toLowerCase()
  const topic = normalizePublicInfoKind(kind)
  if (topic === 'studio') {
    return (
      /\b(animation studio|anime studio|film studio|animation company|production studio)\b/.test(
        text,
      ) ||
      (/\bstudio\b/.test(text) && /\banimat/.test(text))
    )
  }
  if (topic === 'voice_actor') {
    return /\b(voice actor|voice actress|seiyuu|seiyū|voice acting)\b/.test(text)
  }
  if (topic === 'character') {
    return /\b(fictional character|anime character|manga character|protagonist|character in|animated character)\b/.test(
      text,
    )
  }
  if (topic === 'genre') {
    return /\b(genre|anime genre|film genre|manga|animation)\b/.test(text)
  }
  return true
}

/**
 * Whether a URL is the English Wikipedia REST or site origin we fetch.
 * @param {unknown} value
 * @returns {boolean}
 */
export function isAllowedWikipediaUrl(value) {
  try {
    const url = new URL(String(value || ''))
    return url.protocol === 'https:' && url.hostname === 'en.wikipedia.org'
  } catch {
    return false
  }
}

/**
 * REST summary URL for a Wikipedia page title.
 * @param {string} pageTitle
 * @returns {string|null}
 */
export function wikipediaSummaryUrl(pageTitle) {
  const title = String(pageTitle || '').trim()
  if (!title) return null
  const slug = encodeURIComponent(title.replace(/ /g, '_'))
  const url = `${WIKIPEDIA_ORIGIN}/api/rest_v1/page/summary/${slug}`
  return isAllowedWikipediaUrl(url) ? url : null
}

/**
 * Catalog title strings to try against Wikipedia, English first.
 * @param {object} [doc]
 * @returns {string[]}
 */
export function wikiTitleCandidates(doc) {
  return collectContentTitles(doc).slice(0, MAX_TITLE_CANDIDATES)
}

/**
 * Whether a Wikipedia page title is close enough to a catalog title to use.
 * @param {string} pageTitle
 * @param {object} doc
 * @returns {boolean}
 */
export function wikipediaPageMatchesCatalog(pageTitle, doc) {
  const page = String(pageTitle || '')
    .replace(/\s*\([^)]*\)\s*$/, '')
    .trim()
  if (!page) return false
  return collectContentTitles(doc).some(
    (title) =>
      titlesEqual(title, page) ||
      title.toLowerCase().includes(page.toLowerCase()) ||
      page.toLowerCase().includes(title.toLowerCase()),
  )
}

/**
 * Parse a Wikipedia REST summary payload. Drops disambiguation and empty extracts.
 * @param {object} [body]
 * @returns {{ title: string, extract: string, sourceUrl: string } | null}
 */
export function parseWikipediaSummary(body) {
  if (!body || typeof body !== 'object') return null
  if (body.type === 'disambiguation') return null
  const extract = String(body.extract || '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_EXTRACT_CHARS)
  if (!extract) return null
  const sourceUrl = body.content_urls?.desktop?.page || body.content_urls?.mobile?.page || ''
  if (sourceUrl && !isAllowedWikipediaUrl(sourceUrl)) return null
  return {
    title: String(body.title || '').trim(),
    extract,
    sourceUrl: sourceUrl || '',
    description: String(body.description || '').trim(),
  }
}
