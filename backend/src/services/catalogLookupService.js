/**
 * catalogLookupService.js — Mongo catalog lookups used by Gemini chat tools.
 *
 * Domain service: search, title lookup, and similar-title queries against Content.
 * Returns lean documents the chat API can send to the UI as Search cards.
 */

import Content from '../models/Content.js'
import { contentTitleMatchOr } from '../utils/titles.js'
import { buildCatalogChatQuery, escapeRegex } from '../utils/catalogChatQuery.js'

const DEFAULT_LIMIT = 8
const MAX_LIMIT = 20

const CATALOG_PROJECTION = {
  title: 1,
  englishTitle: 1,
  nativeTitle: 1,
  originalTitle: 1,
  overview: 1,
  contentType: 1,
  posterPath: 1,
  backdropPath: 1,
  releaseDate: 1,
  genres: 1,
  studios: 1,
  productionCompanies: 1,
  originCountries: 1,
  unifiedScore: 1,
  popularity: 1,
  voteAverage: 1,
  voteCount: 1,
  malScore: 1,
  malScoredBy: 1,
  userRatingAverage: 1,
  userRatingCount: 1,
  malStatus: 1,
  runtime: 1,
  episodeCount: 1,
  malEpisodes: 1,
  seasonCount: 1,
  startSeasonYear: 1,
  startSeason: 1,
  lastAirDate: 1,
  nextEpisodeAirDate: 1,
  nextEpisodeNumber: 1,
  franchise: 1,
  tmdbId: 1,
  malId: 1,
  alternativeTitles: 1,
}

/**
 * JSON-safe catalog row for the chat UI (same fields Search cards already read).
 * @param {object|null} doc
 * @returns {object|null}
 */
export function serializeCatalogDoc(doc) {
  if (!doc) return null
  return {
    ...doc,
    _id: String(doc._id),
  }
}

function clampLimit(value) {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return DEFAULT_LIMIT
  return Math.min(Math.max(Math.trunc(parsed), 1), MAX_LIMIT)
}

/**
 * Compact title card the model may cite; never a substitute for a catalog row.
 * @param {object} doc
 * @param {{ fullOverview?: boolean }} [options]
 * @returns {object}
 */
export function summarizeForModel(doc, options = {}) {
  const overview = String(doc.overview || '')
  return {
    id: String(doc._id),
    title: doc.englishTitle || doc.title,
    nativeTitle: doc.nativeTitle || undefined,
    contentType: doc.contentType,
    genres: (doc.genres || []).map((genre) => genre.name || genre).filter(Boolean).slice(0, 5),
    studios: (doc.studios || doc.productionCompanies || []).slice(0, 4),
    originCountries: doc.originCountries || [],
    score: doc.unifiedScore || doc.malScore || doc.voteAverage || null,
    malStatus: doc.malStatus || undefined,
    releaseDate: doc.releaseDate || undefined,
    startSeasonYear: doc.startSeasonYear || undefined,
    startSeason: doc.startSeason || undefined,
    overview: overview.slice(0, options.fullOverview ? 800 : 220),
  }
}

/**
 * Find the best catalog match for a title string.
 * @param {string} title
 * @returns {Promise<object|null>}
 */
export async function findByTitle(title) {
  const needle = String(title || '').trim()
  if (!needle) return null
  const matcher = { $regex: escapeRegex(needle), $options: 'i' }
  return Content.findOne({ $or: contentTitleMatchOr(matcher) })
    .select(CATALOG_PROJECTION)
    .sort({ unifiedScore: -1, popularity: -1 })
    .lean()
}

async function findSimilarTo(title, filters, limit) {
  const seed = await findByTitle(title)
  if (!seed) return []
  const names = (seed.genres || []).map((genre) => genre.name).filter(Boolean)
  const typeFilter =
    seed.contentType === 'special'
      ? { contentType: { $in: ['movie', 'special'] } }
      : { contentType: seed.contentType }
  const query = buildCatalogChatQuery(
    {
      ...filters,
      query: undefined,
      similarTo: undefined,
      contentType: undefined,
      genre: undefined,
      excludeIds: [...(filters.excludeIds || []), seed._id],
    },
    filters.from,
  )
  const similarQuery = {
    ...typeFilter,
    ...(names.length ? { 'genres.name': { $in: names } } : {}),
    ...query,
    _id: { $nin: [seed._id, ...(filters.excludeIds || [])] },
  }
  return Content.find(similarQuery)
    .select(CATALOG_PROJECTION)
    .sort({ unifiedScore: -1, popularity: -1 })
    .limit(limit)
    .lean()
}

/**
 * Search the animated catalog. `similarTo` ranks titles sharing the seed's type/genres.
 * @param {object} [filters]
 * @returns {Promise<object[]>}
 */
export async function searchCatalog(filters = {}) {
  const limit = clampLimit(filters.limit)
  if (filters.lookupTitle) {
    const match = await findByTitle(filters.lookupTitle)
    return match ? [match] : []
  }
  if (filters.similarTo) {
    return findSimilarTo(filters.similarTo, filters, limit)
  }
  return Content.find(buildCatalogChatQuery(filters, filters.from))
    .select(CATALOG_PROJECTION)
    .sort({ unifiedScore: -1, popularity: -1 })
    .limit(limit)
    .lean()
}
