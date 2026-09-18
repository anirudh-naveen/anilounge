/**
 * entityService.js — ingest and lookup for catalog characters (and later VAs/studios).
 *
 * Domain service: Jikan anime-character lists and TMDB credits are upserted into
 * Entity documents. Title pages and search read the persisted rows.
 */

import Entity from '../models/Entity.js'
import {
  appearanceRoleRank,
  characterPortraitPath,
  characterUpsertFilter,
  cleanCharacterName,
  entityNamesEqual,
  foldEntityName,
  highlightedCharacters,
  isUsableCharacterName,
  mapJikanCharacterRow,
  mapTmdbCharacterCredits,
  serializeEntity,
  uniqueEntityNames,
} from '../utils/entities.js'

const JIKAN_BASE = 'https://api.jikan.moe/v4'
const TMDB_BASE = 'https://api.themoviedb.org/3'
const STALE_MS = 7 * 24 * 60 * 60 * 1000
const JIKAN_GAP_MS = 450
const FETCH_TIMEOUT_MS = 20000
const MAX_CHARACTERS_PER_TITLE = 80
const JIKAN_HEADERS = {
  Accept: 'application/json',
  'User-Agent': 'AniLounge/1.0 (https://find-animation.vercel.app; catalog characters)',
}

let lastJikanAt = 0
let indexesReady = false

/**
 * @param {number} ms
 * @returns {Promise<void>}
 */
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * GET JSON with a timeout. `fetchImpl` is injectable for tests.
 * @param {string} url
 * @param {{ headers?: object, fetchImpl?: typeof fetch }} [options]
 * @returns {Promise<object|null>}
 */
export async function fetchJson(url, { headers = {}, fetchImpl = fetch } = {}) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
  try {
    const response = await fetchImpl(url, {
      method: 'GET',
      headers: { Accept: 'application/json', ...headers },
      signal: controller.signal,
    })
    if (!response.ok) return null
    return await response.json()
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}

/**
 * Rate-limited Jikan GET.
 * @param {string} path
 * @param {{ fetchImpl?: typeof fetch }} [options]
 * @returns {Promise<object|null>}
 */
export async function jikanGet(path, options = {}) {
  const wait = JIKAN_GAP_MS - (Date.now() - lastJikanAt)
  if (wait > 0) await sleep(wait)
  lastJikanAt = Date.now()
  const body = await fetchJson(`${JIKAN_BASE}${path}`, {
    ...options,
    headers: { ...JIKAN_HEADERS, ...(options.headers || {}) },
  })
  if (!body) {
    await sleep(1000)
    lastJikanAt = Date.now()
    return fetchJson(`${JIKAN_BASE}${path}`, {
      ...options,
      headers: { ...JIKAN_HEADERS, ...(options.headers || {}) },
    })
  }
  return body
}

/**
 * Drop the unique sparse malId index that rejected every TMDB character after
 * the first (`malId: null` is still indexed). Partial unique index is on the schema.
 * @returns {Promise<void>}
 */
export async function ensureEntityIndexes() {
  if (indexesReady) return
  try {
    await Entity.collection.dropIndex('entityType_1_malId_1')
  } catch {
    // Already dropped or never created.
  }
  try {
    await Entity.updateMany({ malId: null }, { $unset: { malId: 1 } })
  } catch (error) {
    console.error('Failed to unset null character malIds:', error.message)
  }
  indexesReady = true
}

/**
 * Whether this title's character list is fresh enough to skip a remote fetch.
 * Uses the title's own sync stamp so a failed/partial ingest is retried.
 * @param {object} content
 * @returns {boolean}
 */
export function charactersAreFresh(content, now = Date.now()) {
  const stamp = content?.characterSyncAt ? new Date(content.characterSyncAt).getTime() : 0
  return stamp > 0 && now - stamp < STALE_MS
}

/**
 * Merge one appearance onto an entity document without duplicating the title.
 * @param {object} entity
 * @param {object} appearance
 * @returns {boolean} True when the document changed.
 */
export function mergeAppearance(entity, appearance) {
  const contentId = String(appearance.content)
  const existing = (entity.appearances || []).find(
    (row) => String(row.content) === contentId,
  )
  if (!existing) {
    entity.appearances = [...(entity.appearances || []), appearance]
    return true
  }
  let changed = false
  if (appearance.role && existing.role !== appearance.role) {
    existing.role = appearance.role
    changed = true
  }
  if (
    Number.isFinite(Number(appearance.importance)) &&
    Number(appearance.importance) > (Number(existing.importance) || 0)
  ) {
    existing.importance = appearance.importance
    changed = true
  }
  const seen = new Set(
    (existing.voiceActors || []).map((va) => `${foldEntityName(va.name)}:${va.language || ''}`),
  )
  for (const credit of appearance.voiceActors || []) {
    const key = `${foldEntityName(credit.name)}:${credit.language || ''}`
    if (seen.has(key)) continue
    seen.add(key)
    existing.voiceActors = [...(existing.voiceActors || []), credit]
    changed = true
  }
  return changed
}

/**
 * Upsert mapped character payloads for one title. One failed row does not abort the rest.
 * @param {Array<object>} payloads
 * @returns {Promise<object[]>}
 */
async function upsertCharacterPayloads(payloads) {
  const saved = []
  const now = new Date()
  for (const payload of payloads) {
    try {
      const cleanedName = cleanCharacterName(payload.name) || payload.name
      if (!isUsableCharacterName(cleanedName)) continue

      let entity = await Entity.findOne(characterUpsertFilter({ ...payload, name: cleanedName }))
      const malId = Number(payload.malId)
      const hasMalId = Number.isFinite(malId) && malId > 0

      if (!entity) {
        entity = new Entity({
          entityType: 'character',
          name: cleanedName,
          englishName: cleanedName,
          nativeName: payload.nativeName || '',
          alternativeNames: payload.alternativeNames || [],
          imagePath: characterPortraitPath(payload.imagePath),
          appearances: [payload.appearance],
          lastSyncedAt: now,
        })
        if (hasMalId) entity.malId = malId
        if (payload.tmdbId) entity.tmdbId = payload.tmdbId
        await entity.save()
        saved.push(entity)
        continue
      }

      mergeAppearance(entity, payload.appearance)
      if (cleanedName && entity.name !== cleanedName) {
        entity.name = cleanedName
        entity.englishName = cleanedName
      }
      if (characterPortraitPath(payload.imagePath) && !characterPortraitPath(entity.imagePath)) {
        entity.imagePath = payload.imagePath
      }
      if (payload.nativeName && !entity.nativeName) entity.nativeName = payload.nativeName
      const names = uniqueEntityNames(entity.alternativeNames, payload.alternativeNames)
      if (names.length) entity.alternativeNames = names
      if (entity.malId == null) entity.set('malId', undefined)
      entity.lastSyncedAt = now
      await entity.save()
      saved.push(entity)
    } catch (error) {
      console.error(`Character upsert failed for ${payload?.name}:`, error.message)
    }
  }
  return saved
}

/**
 * Pull Jikan characters for a MAL anime id.
 * @param {object} content
 * @param {{ fetchImpl?: typeof fetch }} [options]
 * @returns {Promise<object[]>}
 */
export async function ingestJikanCharacters(content, options = {}) {
  const malId = Number(content?.malId)
  if (!Number.isFinite(malId) || malId < 1) return []
  const body = await jikanGet(`/anime/${malId}/characters`, options)
  const rows = Array.isArray(body?.data) ? body.data : []
  const payloads = rows
    .map((row) => mapJikanCharacterRow(row, content._id))
    .filter(Boolean)
    .sort(
      (left, right) =>
        (right.appearance?.importance || 0) - (left.appearance?.importance || 0) ||
        appearanceRoleRank(left.appearance?.role) - appearanceRoleRank(right.appearance?.role),
    )
    .slice(0, MAX_CHARACTERS_PER_TITLE)
  return upsertCharacterPayloads(payloads)
}

/**
 * Pull TMDB movie/TV credits when MAL characters are unavailable.
 * @param {object} content
 * @param {{ fetchImpl?: typeof fetch, tmdbToken?: string }} [options]
 * @returns {Promise<object[]>}
 */
export async function ingestTmdbCharacters(content, options = {}) {
  const tmdbId = Number(content?.tmdbId)
  const apiKey = options.tmdbToken || process.env.TMDB_API_KEY
  if (!Number.isFinite(tmdbId) || tmdbId < 1 || !apiKey) return []
  const path =
    content.contentType === 'tv'
      ? `/tv/${tmdbId}/aggregate_credits`
      : `/movie/${tmdbId}/credits`
  const body = await fetchJson(
    `${TMDB_BASE}${path}?api_key=${encodeURIComponent(apiKey)}`,
    options,
  )
  const cast = Array.isArray(body?.cast) ? body.cast : []
  const payloads = mapTmdbCharacterCredits(cast, content._id).slice(0, MAX_CHARACTERS_PER_TITLE)
  return upsertCharacterPayloads(payloads)
}

/**
 * Drop leftover TMDB "(voice)" / unnamed credits, and TMDB-only rows on MAL titles.
 * @param {object} content
 * @returns {Promise<void>}
 */
async function cleanupStaleCharacterAppearances(content) {
  const contentId = content?._id
  if (!contentId) return
  try {
    await Entity.updateMany(
      {
        entityType: 'character',
        'appearances.content': contentId,
        $or: [
          { name: /^\s*$/ },
          { name: /\(\s*voices?\s*\)/i },
          {
            name: /^(self|himself|herself|unnamed|unknown|additional voices?|voice|voices)$/i,
          },
        ],
      },
      { $pull: { appearances: { content: contentId } } },
    )
    if (content.malId) {
      await Entity.updateMany(
        {
          entityType: 'character',
          'appearances.content': contentId,
          $or: [{ malId: { $exists: false } }, { malId: null }],
        },
        { $pull: { appearances: { content: contentId } } },
      )
    }
  } catch (error) {
    console.error('Failed to clean stale character appearances:', error.message)
  }
}

/**
 * Whether stored characters for this title should be fetched again.
 * @param {object} content
 * @param {object[]} docs
 * @returns {boolean}
 */
function needsCharacterRefresh(content, docs) {
  if (!charactersAreFresh(content) || !docs.length) return true
  if (docs.some((doc) => !isUsableCharacterName(doc.name))) return true
  if (docs.some((doc) => /\(\s*voices?\s*\)/i.test(String(doc.name || '')))) return true
  if (content.malId && docs.some((doc) => !doc.malId)) return true
  if (content.malId && docs.every((doc) => !characterPortraitPath(doc.imagePath))) return true
  return false
}

/**
 * Characters attached to a title, ingesting from Jikan/TMDB when stale or empty.
 * @param {object} content
 * @param {{ fetchImpl?: typeof fetch }} [options]
 * @returns {Promise<object[]>}
 */
export async function ensureCharactersForContent(content, options = {}) {
  if (!content?._id) return []
  await ensureEntityIndexes()

  let docs = await Entity.find({
    entityType: 'character',
    'appearances.content': content._id,
  })

  if (!needsCharacterRefresh(content, docs)) {
    return highlightedCharacters(docs, content._id, MAX_CHARACTERS_PER_TITLE)
  }

  if (content.malId) {
    try {
      await ingestJikanCharacters(content, options)
    } catch (error) {
      console.error('Jikan character ingest failed:', error.message)
    }
  } else if (content.tmdbId) {
    try {
      await ingestTmdbCharacters(content, options)
    } catch (error) {
      console.error('TMDB character ingest failed:', error.message)
    }
  }

  await cleanupStaleCharacterAppearances(content)

  docs = await Entity.find({
    entityType: 'character',
    'appearances.content': content._id,
  })

  if (docs.length) {
    content.characterSyncAt = new Date()
    try {
      await content.save()
    } catch (error) {
      console.error('Failed to stamp characterSyncAt:', error.message)
    }
  }

  return highlightedCharacters(docs, content._id, MAX_CHARACTERS_PER_TITLE)
}

/**
 * Fill `about` from Jikan when a character detail page is opened.
 * @param {object} entity
 * @param {{ fetchImpl?: typeof fetch }} [options]
 * @returns {Promise<object>}
 */
export async function ensureCharacterAbout(entity, options = {}) {
  if (!entity || entity.entityType !== 'character') return entity
  const needsPortrait = !characterPortraitPath(entity.imagePath)
  if (entity.about && entity.nativeName && !needsPortrait) return entity
  const malId = Number(entity.malId)
  if (!Number.isFinite(malId) || malId < 1) {
    if (needsPortrait && entity.imagePath) {
      entity.imagePath = ''
      await entity.save()
    }
    return entity
  }
  const body = await jikanGet(`/characters/${malId}`, options)
  const data = body?.data
  if (!data) return entity
  if (!entity.about && data.about) entity.about = String(data.about).trim()
  if (!entity.nativeName && data.name_kanji) entity.nativeName = String(data.name_kanji).trim()
  const nicknames = uniqueEntityNames(entity.alternativeNames, data.nicknames)
  if (nicknames.length) entity.alternativeNames = nicknames
  const jpg =
    data.images?.jpg?.large_image_url ||
    data.images?.jpg?.image_url ||
    data.images?.webp?.image_url
  if (needsPortrait && jpg && !/questionmark/i.test(String(jpg))) entity.imagePath = jpg
  const cleanedName = cleanCharacterName(data.name) || entity.name
  if (isUsableCharacterName(cleanedName) && entity.name !== cleanedName) {
    entity.name = cleanedName
    if (!entity.englishName) entity.englishName = cleanedName
  }
  await entity.save()
  return entity
}

/**
 * Regex-safe substring search across name fields.
 * @param {string} query
 * @param {{ entityType?: string, limit?: number }} [options]
 * @returns {Promise<object[]>}
 */
export async function searchEntities(query, { entityType = 'character', limit = 20 } = {}) {
  const term = String(query || '').trim()
  if (!term || term.length < 1) return []
  const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const regex = new RegExp(escaped, 'i')
  const typeFilter = entityType && entityType !== 'all' ? { entityType } : {}
  return Entity.find({
    ...typeFilter,
    $or: [
      { name: regex },
      { englishName: regex },
      { nativeName: regex },
      { alternativeNames: regex },
    ],
  })
    .sort({ favoritesCount: -1, name: 1 })
    .limit(Math.min(Number(limit) || 20, 50))
}

/**
 * Name lookup used by the chatbot (exact/folded match first, then regex).
 * @param {string} name
 * @param {string} [entityType='character']
 * @returns {Promise<object|null>}
 */
export async function findEntityByName(name, entityType = 'character') {
  const term = String(name || '').trim()
  if (!term) return null
  const candidates = await searchEntities(term, { entityType, limit: 12 })
  return (
    candidates.find((doc) =>
      uniqueEntityNames(doc.name, doc.englishName, doc.nativeName, doc.alternativeNames).some(
        (candidate) => entityNamesEqual(candidate, term),
      ),
    ) ||
    candidates[0] ||
    null
  )
}

/**
 * Populate appearance titles for a detail payload.
 * @param {object} entity
 * @param {{ isFavorited?: boolean }} [options]
 * @returns {Promise<object|null>}
 */
export async function serializeEntityDetails(entity, options = {}) {
  if (!entity) return null
  await entity.populate({
    path: 'appearances.content',
    select: 'title englishTitle nativeTitle posterPath contentType',
  })
  return serializeEntity(entity, options)
}

export { serializeEntity }
