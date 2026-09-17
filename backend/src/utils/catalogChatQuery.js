/**
 * catalogChatQuery.js — Mongo filters and intent parsing for catalog-grounded chat.
 *
 * Utils layer: turn chatbot tool args or a natural-language message into a
 * Content.find filter. Callers execute the query; this module stays DB-free.
 */

import { contentTitleMatchOr } from './titles.js'
import { matchTvCatalogTab } from './catalogTabs.js'

const MOVIE_LIKE_TYPES = ['movie', 'special']
const ANIME_SEASONS = ['winter', 'spring', 'summer', 'fall']
const CONTENT_TYPES = ['all', 'movie', 'tv', 'special']
const STATUSES = ['all', 'airing', 'upcoming', 'completed']

const GENRE_ALIASES = {
  action: 'Action',
  adventure: 'Adventure',
  comedy: 'Comedy',
  drama: 'Drama',
  fantasy: 'Fantasy',
  horror: 'Horror',
  romance: 'Romance',
  'sci-fi': 'Science Fiction',
  'sci fi': 'Science Fiction',
  'science fiction': 'Science Fiction',
  thriller: 'Thriller',
  family: 'Family',
  mystery: 'Mystery',
  sports: 'Sports',
  mecha: 'Mecha',
  'slice of life': 'Slice of Life',
  supernatural: 'Supernatural',
  psychological: 'Psychological',
  music: 'Music',
  isekai: 'Isekai',
  shounen: 'Shounen',
  seinen: 'Seinen',
}

const STUDIO_ALIASES = [
  { pattern: /\bghibli\b/i, studio: 'Ghibli' },
  { pattern: /\bkyoto animation\b|\bkyoani\b/i, studio: 'Kyoto Animation' },
  { pattern: /\bmappa\b/i, studio: 'MAPPA' },
  { pattern: /\bufotable\b/i, studio: 'ufotable' },
  { pattern: /\bbones\b/i, studio: 'Bones' },
  { pattern: /\btoei\b/i, studio: 'Toei' },
  { pattern: /\bsunrise\b/i, studio: 'Sunrise' },
  { pattern: /\bwit studio\b/i, studio: 'Wit Studio' },
  { pattern: /\btrigger\b/i, studio: 'Trigger' },
  { pattern: /\bmadhouse\b/i, studio: 'Madhouse' },
  { pattern: /\bproduction i\.?g\b/i, studio: 'Production I.G' },
  { pattern: /\bpixar\b/i, studio: 'Pixar' },
  { pattern: /\bdreamworks\b/i, studio: 'DreamWorks' },
  { pattern: /\bstudio colorido\b/i, studio: 'Studio Colorido' },
]

/**
 * Escape a user string for safe use inside a Mongo `$regex`.
 * @param {unknown} value
 * @returns {string}
 */
export function escapeRegex(value) {
  return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * Mongo content-type filter. `movie` includes specials, matching Search.
 * @param {string|undefined} contentType
 * @returns {object}
 */
export function matchChatContentType(contentType) {
  if (!contentType || contentType === 'all') return {}
  if (contentType === 'movie') return { contentType: { $in: MOVIE_LIKE_TYPES } }
  return { contentType }
}

function matchOriginCountry(code) {
  const country = String(code || '').trim().toUpperCase()
  if (!country || country === 'ALL') return {}
  if (country === 'JP') {
    return {
      $or: [
        { originCountries: 'JP' },
        { malId: { $type: 'number' }, originCountries: { $exists: false } },
        { malId: { $type: 'number' }, originCountries: { $size: 0 } },
      ],
    }
  }
  return { originCountries: country }
}

function matchStatus(status, from) {
  if (!status || status === 'all') return {}
  if (status === 'airing') return matchTvCatalogTab('airing', from)
  if (status === 'upcoming') {
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
  if (status === 'completed') {
    return {
      $and: [
        { malStatus: { $ne: 'currently_airing' } },
        { malStatus: { $ne: 'not_yet_aired' } },
        {
          $or: [{ releaseDate: { $exists: false } }, { releaseDate: { $lte: from } }],
        },
      ],
    }
  }
  return {}
}

function matchYear(year) {
  const parsed = Number(year)
  if (!Number.isFinite(parsed) || parsed < 1900 || parsed > 2100) return {}
  const start = new Date(Date.UTC(parsed, 0, 1))
  const end = new Date(Date.UTC(parsed, 11, 31, 23, 59, 59, 999))
  return {
    $or: [{ releaseDate: { $gte: start, $lte: end } }, { startSeasonYear: parsed }],
  }
}

function mergeParts(parts) {
  const cleaned = parts.filter((part) => part && Object.keys(part).length > 0)
  if (cleaned.length === 0) return {}
  if (cleaned.length === 1) return cleaned[0]
  return { $and: cleaned }
}

/**
 * Build a Mongo filter from chatbot search_catalog arguments.
 * @param {object} [filters]
 * @param {Date} [from]
 * @returns {object}
 */
export function buildCatalogChatQuery(filters = {}, from = new Date()) {
  const parts = [matchChatContentType(filters.contentType)]

  const query = String(filters.query || '').trim()
  if (query) {
    const matcher = { $regex: escapeRegex(query), $options: 'i' }
    parts.push({
      $or: [
        ...contentTitleMatchOr(matcher),
        { overview: matcher },
        { studios: matcher },
        { productionCompanies: matcher },
      ],
    })
  }

  const genre = String(filters.genre || '').trim()
  if (genre) {
    parts.push({ 'genres.name': { $regex: `^${escapeRegex(genre)}$`, $options: 'i' } })
  }

  const studio = String(filters.studio || '').trim()
  if (studio) {
    const matcher = { $regex: escapeRegex(studio), $options: 'i' }
    parts.push({ $or: [{ studios: matcher }, { productionCompanies: matcher }] })
  }

  parts.push(matchOriginCountry(filters.originCountry))
  parts.push(matchStatus(filters.status, from))
  parts.push(matchYear(filters.year))

  const season = String(filters.season || '').trim().toLowerCase()
  if (ANIME_SEASONS.includes(season)) {
    parts.push({ startSeason: season })
  }

  const minRating = Number(filters.minRating)
  if (Number.isFinite(minRating) && minRating > 0) {
    parts.push({
      $or: [
        { unifiedScore: { $gte: minRating } },
        { malScore: { $gte: minRating } },
        { voteAverage: { $gte: minRating } },
      ],
    })
  }

  const excludeIds = Array.isArray(filters.excludeIds) ? filters.excludeIds.filter(Boolean) : []
  if (excludeIds.length > 0) {
    parts.push({ _id: { $nin: excludeIds } })
  }

  return mergeParts(parts)
}

/**
 * Whether inferred filters or discovery phrasing mean we should query the catalog.
 * @param {string} message
 * @returns {boolean}
 */
export function hasCatalogIntent(message) {
  const filters = inferCatalogFiltersFromMessage(message)
  return Boolean(
    filters.query ||
      filters.genre ||
      filters.studio ||
      filters.originCountry ||
      filters.status ||
      filters.season ||
      filters.year ||
      filters.similarTo ||
      filters.lookupTitle ||
      (filters.contentType && filters.contentType !== 'all'),
  )
}

function extractQuotedOrRemainder(match) {
  return String(match?.[1] || '')
    .replace(/[.?!]+$/, '')
    .trim()
}

/**
 * Heuristic tool args from a chat message, used when Gemini is unavailable
 * or did not call tools for a discovery question.
 * @param {string} message
 * @returns {object}
 */
export function inferCatalogFiltersFromMessage(message) {
  const text = String(message || '').trim()
  const filters = {}
  if (!text) return filters

  const lower = text.toLowerCase()

  const about = text.match(
    /\b(?:tell me about|information about|info(?:rmation)? (?:on|about))\s+["']?([^"'?\n]+)/i,
  )
  const lookupTitle = extractQuotedOrRemainder(about)
  if (lookupTitle.length >= 2) filters.lookupTitle = lookupTitle

  const like = text.match(/\b(?:like|similar to)\s+["']?([^"'?\n]+)/i)
  const similarTo = extractQuotedOrRemainder(like)
  if (similarTo.length >= 2) filters.similarTo = similarTo

  if (/\bmovies?\b/.test(lower) && !/\b(tv|series|shows?)\b/.test(lower)) {
    filters.contentType = 'movie'
  } else if (/\b(tv|series|shows?)\b/.test(lower)) {
    filters.contentType = 'tv'
  }

  const genreKey = Object.keys(GENRE_ALIASES)
    .sort((a, b) => b.length - a.length)
    .find((alias) => lower.includes(alias))
  if (genreKey) filters.genre = GENRE_ALIASES[genreKey]

  const studioHit = STUDIO_ALIASES.find((entry) => entry.pattern.test(text))
  if (studioHit) filters.studio = studioHit.studio

  if (/\b(japan|japanese|anime)\b/.test(lower)) filters.originCountry = 'JP'
  else if (/\b(korea|korean|k-anim)\b/.test(lower)) filters.originCountry = 'KR'
  else if (/\b(china|chinese|donghua)\b/.test(lower)) filters.originCountry = 'CN'
  else if (/\b(american|disney|pixar|dreamworks|united states|\bus\b)\b/.test(lower)) {
    filters.originCountry = 'US'
  }

  if (/\b(currently airing|airing now|this season)\b/.test(lower) || /\bairing\b/.test(lower)) {
    filters.status = 'airing'
  } else if (/\b(upcoming|coming soon|not yet aired)\b/.test(lower)) {
    filters.status = 'upcoming'
  }

  for (const season of ANIME_SEASONS) {
    if (new RegExp(`\\b${season}\\b`, 'i').test(lower)) {
      filters.season = season
      break
    }
  }

  const year = lower.match(/\b((?:19|20)\d{2})\b/)
  if (year) filters.year = Number(year[1])

  if (!filters.lookupTitle && !filters.similarTo) {
    const leftover = text
      .replace(
        /\b(please|can you|could you|find me|find|recommend|suggest|show me|i want|i'm looking for|looking for|what are|what's|what is|the best|best|some|any|tell me about)\b/gi,
        ' ',
      )
      .replace(/\b(anime|movies?|series|shows?|films?|animation|animated content)\b/gi, ' ')
      .replace(/\b(action|adventure|comedy|drama|fantasy|horror|romance|sci-fi|thriller)\b/gi, ' ')
      .replace(
        /\b(currently|airing|upcoming|coming soon|season|winter|spring|summer|fall|japan(?:ese)?|korean|american)\b/gi,
        ' ',
      )
      .replace(/[?!.,]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
    const smallTalk = /^(hi|hello|hey|thanks|thank you|ok|okay|yo|sup)$/i
    if (leftover.length >= 3 && leftover.length <= 80 && !smallTalk.test(leftover)) {
      filters.query = leftover
    }
  }

  return filters
}

export { CONTENT_TYPES, STATUSES, ANIME_SEASONS, MOVIE_LIKE_TYPES }
