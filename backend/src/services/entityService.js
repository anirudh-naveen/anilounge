/**
 * entityService.js — ingest and lookup for catalog characters, voice actors, and studios.
 *
 * Domain service: Jikan (MAL) and AniList anime-character lists, then TMDB
 * credits as a fallback, are upserted into Entity documents. Rows from different
 * sources merge by MAL/AniList/TMDB id, then by name within the title's
 * franchise. Studio rows come from title sync; their logo and about are filled
 * from Jikan producers or TMDB companies. Title pages and search read the
 * persisted rows.
 */

import { query } from '../../config/postgres.js'
import Entity from '../models/Entity.js'
import Content from '../models/Content.js'
import {
  charactersInHome,
  findCharacterForPayload,
  mergeFranchiseCharactersForWork,
  siblingMalId,
} from './characterMerge.js'
import {
  ANILIST_CHARACTERS_PER_TITLE,
  anilistImage,
  cleanAnilistText,
  getAnilistCharacter,
  getAnilistMedia,
  getAnilistStaff,
  mapAnilistCharacterEdge,
} from './anilistService.js'
import {
  appearanceRoleRank,
  canonicalCharacterName,
  characterImportanceScore,
  characterNamesEqual,
  characterPortraitPath,
  characterUpsertFilter,
  cleanCharacterName,
  displayPersonName,
  entityNamesEqual,
  foldEntityName,
  highlightedCharacters,
  highlightedVoiceActors,
  isUsableCharacterName,
  knownVoiceLanguage,
  mapJikanCharacterRow,
  mapJikanPersonVoiceRow,
  mapJikanProducer,
  mapTmdbCharacterCredits,
  mapVoiceActorFromCredit,
  pickJikanProducer,
  pickTmdbCompany,
  serializeEntity,
  studioImagePath,
  studioNamesEqual,
  uniqueEntityNames,
  normalizeEntityName,
  voiceActorImagePath,
} from '../utils/entities.js'

const JIKAN_BASE = 'https://api.jikan.moe/v4'
const TMDB_BASE = 'https://api.themoviedb.org/3'
const STALE_MS = 7 * 24 * 60 * 60 * 1000
const JIKAN_GAP_MS = 450
const FETCH_TIMEOUT_MS = 20000
const MAX_CHARACTERS_PER_TITLE = 12
/** A failed or partial Jikan/TMDB ingest is not retried on every page view. */
const CHARACTER_RETRY_MS = 6 * 60 * 60 * 1000
const characterSyncAttempts = new Map()
const studioSyncAttempts = new Map()
const CHARACTER_UPSERT_CONCURRENCY = 4
const voiceActorLocks = new Map()

/**
 * Serialize work per voice actor so concurrent character upserts sharing an
 * actor do not create the same person twice.
 * @template T
 * @param {string} key
 * @param {() => Promise<T>} fn
 * @returns {Promise<T>}
 */
async function withVoiceActorLock(key, fn) {
  const previous = voiceActorLocks.get(key) || Promise.resolve()
  const run = previous.then(fn, fn)
  const settled = run.catch(() => {})
  voiceActorLocks.set(key, settled)
  try {
    return await run
  } finally {
    if (voiceActorLocks.get(key) === settled) voiceActorLocks.delete(key)
  }
}
const MAX_VOICED_CHARACTERS = 600
const JIKAN_HEADERS = {
  Accept: 'application/json',
  'User-Agent': 'AniLounge/1.0 (https://find-animation.vercel.app; catalog characters)',
}

/** Jikan allows 3 requests/second and 60/minute per client. */
const JIKAN_WINDOW_MS = 60 * 1000
const JIKAN_MAX_PER_WINDOW = 55
const JIKAN_RETRIES = 3
const JIKAN_BACKOFF_MS = 2000
const JIKAN_OUTAGE_THRESHOLD = 5
const JIKAN_OUTAGE_COOLDOWN_MS = 2 * 60 * 1000
const jikanWindow = []
const jikanOutage = { failures: 0, downUntil: 0 }

let lastJikanAt = 0
let indexesReady = false
const ingestLocks = new Map()

/**
 * @param {number} ms
 * @returns {Promise<void>}
 */
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * GET JSON with a timeout, keeping the HTTP status (0 on network failure).
 * @param {string} url
 * @param {{ headers?: object, fetchImpl?: typeof fetch }} [options]
 * @returns {Promise<{ status: number, body: object|null }>}
 */
async function requestJson(url, { headers = {}, fetchImpl = fetch } = {}) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
  try {
    const response = await fetchImpl(url, {
      method: 'GET',
      headers: { Accept: 'application/json', ...headers },
      signal: controller.signal,
    })
    if (!response.ok) return { status: response.status, body: null }
    return { status: response.status, body: await response.json() }
  } catch {
    return { status: 0, body: null }
  } finally {
    clearTimeout(timer)
  }
}

/**
 * GET JSON with a timeout. `fetchImpl` is injectable for tests.
 * @param {string} url
 * @param {{ headers?: object, fetchImpl?: typeof fetch }} [options]
 * @returns {Promise<object|null>}
 */
export async function fetchJson(url, options = {}) {
  return (await requestJson(url, options)).body
}

/**
 * Wait until another Jikan request fits both the per-request gap and the
 * 60-per-minute window.
 * @returns {Promise<void>}
 */
async function reserveJikanSlot() {
  for (;;) {
    const now = Date.now()
    while (jikanWindow.length && now - jikanWindow[0] >= JIKAN_WINDOW_MS) jikanWindow.shift()
    const gapWait = JIKAN_GAP_MS - (now - lastJikanAt)
    const windowWait =
      jikanWindow.length >= JIKAN_MAX_PER_WINDOW ? JIKAN_WINDOW_MS - (now - jikanWindow[0]) : 0
    const wait = Math.max(gapWait, windowWait)
    if (wait <= 0) break
    await sleep(wait)
  }
  lastJikanAt = Date.now()
  jikanWindow.push(lastJikanAt)
}

/**
 * Jikan outage state: consecutive calls that ended in 5xx/network failure, and
 * the time until which calls are skipped.
 * @returns {{ consecutiveFailures: number, downUntil: number, available: boolean }}
 */
export function jikanStatus() {
  return {
    consecutiveFailures: jikanOutage.failures,
    downUntil: jikanOutage.downUntil,
    available: Date.now() >= jikanOutage.downUntil,
  }
}

/**
 * Whether Jikan can currently reach MyAnimeList (its root reports 5xx when not).
 * @returns {Promise<boolean>}
 */
export async function probeJikan() {
  const { body } = await requestJson(JIKAN_BASE, { headers: JIKAN_HEADERS })
  return Boolean(body) && !(Number(body.status) >= 500)
}

/**
 * Rate-limited Jikan GET. 429 backs off up to three times; 5xx/network
 * failures retry once; 404 and other client errors return null immediately.
 * After repeated outage failures Jikan is skipped for a cooldown so callers
 * fall back to TMDB without waiting.
 * @param {string} path
 * @param {{ fetchImpl?: typeof fetch }} [options]
 * @returns {Promise<object|null>}
 */
export async function jikanGet(path, options = {}) {
  if (!jikanStatus().available) return null
  const request = {
    ...options,
    headers: { ...JIKAN_HEADERS, ...(options.headers || {}) },
  }
  let serverRetries = 0
  for (let attempt = 0; attempt <= JIKAN_RETRIES; attempt += 1) {
    await reserveJikanSlot()
    const { status, body } = await requestJson(`${JIKAN_BASE}${path}`, request)
    if (body) {
      jikanOutage.failures = 0
      return body
    }
    if (status === 429 && attempt < JIKAN_RETRIES) {
      await sleep(JIKAN_BACKOFF_MS * 2 ** attempt)
      continue
    }
    const outage = status === 0 || status >= 500
    if (outage && serverRetries < 1) {
      serverRetries += 1
      await sleep(1000)
      continue
    }
    if (outage) {
      jikanOutage.failures += 1
      if (jikanOutage.failures >= JIKAN_OUTAGE_THRESHOLD) {
        jikanOutage.downUntil = Date.now() + JIKAN_OUTAGE_COOLDOWN_MS
      }
    }
    return null
  }
  return null
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
  const contentId = appearance.content ? String(appearance.content._id || appearance.content) : ''
  const characterId = appearance.character
    ? String(appearance.character._id || appearance.character)
    : ''
  const characterKey = foldEntityName(appearance.characterName || '')
  const existing = (entity.appearances || []).find((row) => {
    const rowContent = row.content ? String(row.content._id || row.content) : ''
    const rowCharacterId = row.character ? String(row.character._id || row.character) : ''
    if (entity.entityType === 'voice_actor') {
      if (characterId && rowCharacterId) return characterId === rowCharacterId
      if (characterKey) return foldEntityName(row.characterName || '') === characterKey
      return false
    }
    if (!contentId) return false
    return rowContent === contentId
  })
  if (!existing) {
    entity.appearances = [...(entity.appearances || []), appearance]
    return true
  }
  let changed = false
  if (appearance.role && existing.role !== appearance.role) {
    existing.role = appearance.role
    changed = true
  }
  if (appearance.character && !existing.character) {
    existing.character = appearance.character
    changed = true
  }
  if (appearance.characterName && existing.characterName !== appearance.characterName) {
    existing.characterName = appearance.characterName
    changed = true
  }
  if (appearance.content && !existing.content) {
    existing.content = appearance.content
    changed = true
  }
  if (appearance.language && existing.language !== appearance.language) {
    existing.language = appearance.language
    changed = true
  }
  if (
    Number.isFinite(Number(appearance.importance)) &&
    Number(appearance.importance) > (Number(existing.importance) || 0)
  ) {
    existing.importance = appearance.importance
    changed = true
  }
  for (const credit of appearance.voiceActors || []) {
    const name = foldEntityName(credit.name)
    const language = knownVoiceLanguage(credit.language)
    const sameActor = (existing.voiceActors || []).filter((va) => foldEntityName(va.name) === name)
    if (sameActor.some((va) => knownVoiceLanguage(va.language) === language)) continue
    const unlabeled = language && sameActor.find((va) => !knownVoiceLanguage(va.language))
    if (unlabeled) {
      unlabeled.language = language
    } else if (!language && sameActor.length) {
      continue
    } else {
      existing.voiceActors = [...(existing.voiceActors || []), credit]
    }
    changed = true
  }
  return changed
}

const PERSON_ID_FIELDS = ['malId', 'anilistId', 'tmdbId']

/**
 * @param {unknown} value
 * @returns {number | null}
 */
function positiveId(value) {
  const id = Number(value)
  return Number.isInteger(id) && id > 0 ? id : null
}

/**
 * Whether two people carry different ids from the same source.
 * @param {object} left
 * @param {object} right
 * @returns {boolean}
 */
export function personIdsConflict(left, right) {
  return PERSON_ID_FIELDS.some((field) => {
    const a = positiveId(left?.[field])
    const b = positiveId(right?.[field])
    return a != null && b != null && a !== b
  })
}

/**
 * Native names disagree only when both are present and differ ignoring spaces.
 * @param {object} left
 * @param {object} right
 * @returns {boolean}
 */
function nativeNamesAgree(left, right) {
  const a = normalizeEntityName(left?.nativeName).replace(/\s+/g, '')
  const b = normalizeEntityName(right?.nativeName).replace(/\s+/g, '')
  return !a || !b || a === b
}

/**
 * Exact, case-insensitive name filter value.
 * @param {string} name
 * @returns {{ $regex: string, $options: string }}
 */
function exactName(name) {
  return { $regex: `^${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, $options: 'i' }
}

/**
 * Existing voice actor for a payload: MAL, AniList, or TMDB id, then the same
 * display name when ids and native names do not conflict.
 * @param {object} payload
 * @param {string} name
 * @returns {Promise<object|null>}
 */
async function findVoiceActorForPayload(payload, name) {
  for (const field of PERSON_ID_FIELDS) {
    const id = positiveId(payload?.[field])
    if (!id) continue
    const found = await Entity.findOne({ entityType: 'voice_actor', [field]: id })
    if (found) return found
  }
  const byName = await Entity.find({ entityType: 'voice_actor', name: exactName(name) }).limit(10)
  const match = byName.find(
    (doc) => !personIdsConflict(doc, payload) && nativeNamesAgree(doc, payload),
  )
  if (match) return match
  const native = normalizeEntityName(payload?.nativeName).replace(/\s+/g, '')
  if (!native) return null
  const { rows } = await query(
    `SELECT id::text AS id FROM content
     WHERE kind = 'voice' AND replace(native_name, ' ', '') = $1
     LIMIT 5`,
    [native],
  )
  for (const row of rows) {
    const doc = await Entity.findById(row.id)
    if (doc && !personIdsConflict(doc, payload)) return doc
  }
  return null
}

/**
 * Copy external ids the entity lacks from a payload, skipping ids another row
 * of the same kind already owns (unique per kind).
 * @param {object} entity
 * @param {object} payload
 * @param {string[]} fields
 * @returns {Promise<void>}
 */
async function fillSourceIds(entity, payload, fields) {
  for (const field of fields) {
    const id = positiveId(payload?.[field])
    if (!id || positiveId(entity[field])) continue
    const owner = await Entity.findOne({ entityType: entity.entityType, [field]: id })
    if (owner && String(owner._id) !== String(entity._id)) continue
    entity[field] = id
  }
}

/**
 * Upsert one voice-actor payload and return the saved document.
 * @param {object} payload
 * @param {Date} now
 * @returns {Promise<object|null>}
 */
async function upsertVoiceActorPayload(payload, now = new Date()) {
  const name = displayPersonName(payload?.name)
  if (!name) return null
  return withVoiceActorLock(`name:${foldEntityName(name)}`, () =>
    upsertVoiceActorPayloadUnlocked(payload, name, now),
  )
}

async function upsertVoiceActorPayloadUnlocked(payload, name, now) {
  let entity = await findVoiceActorForPayload(payload, name)
  const imagePath = voiceActorImagePath(payload.imagePath)

  if (!entity) {
    entity = new Entity({
      entityType: 'voice_actor',
      name,
      englishName: name,
      nativeName: payload.nativeName || '',
      alternativeNames: payload.alternativeNames || [],
      imagePath,
      appearances: payload.appearance ? [payload.appearance] : [],
      lastSyncedAt: now,
    })
    await fillSourceIds(entity, payload, PERSON_ID_FIELDS)
    await entity.save()
    return entity
  }

  if (payload.appearance) mergeAppearance(entity, payload.appearance)
  // MAL spelling wins; other sources keep the stored name and add theirs as an alias.
  if (entity.name !== name && (positiveId(payload.malId) || !entity.name)) {
    entity.alternativeNames = uniqueEntityNames(entity.alternativeNames, entity.name)
    entity.name = name
    if (!entity.englishName) entity.englishName = name
  }
  if (imagePath && !voiceActorImagePath(entity.imagePath)) entity.imagePath = imagePath
  if (payload.nativeName && !entity.nativeName) entity.nativeName = payload.nativeName
  const names = uniqueEntityNames(entity.alternativeNames, payload.alternativeNames, name).filter(
    (alias) => alias !== entity.name,
  )
  entity.alternativeNames = names
  await fillSourceIds(entity, payload, PERSON_ID_FIELDS)
  entity.lastSyncedAt = now
  await entity.save()
  return entity
}

/**
 * Persist voice actors from a character payload's credits and attach entity ids.
 * @param {object} payload
 * @param {Date} now
 * @returns {Promise<void>}
 */
async function attachVoiceActorsToPayload(payload, now, characterId) {
  const credits = payload?.appearance?.voiceActors || []
  for (const credit of credits) {
    const vaPayload = mapVoiceActorFromCredit(credit, {
      contentId: payload.appearance?.content,
      characterName: payload.name,
      role: payload.appearance?.role,
      characterId,
    })
    if (!vaPayload) continue
    try {
      const voiceActor = await upsertVoiceActorPayload(vaPayload, now)
      if (voiceActor) credit.entity = voiceActor._id
    } catch (error) {
      console.error(`Voice actor upsert failed for ${credit?.name}:`, error.message)
    }
  }
}

/**
 * Upsert mapped character payloads for one title. One failed row does not abort the rest.
 * @param {Array<object>} payloads
 * @returns {Promise<object[]>}
 */
async function upsertCharacterPayloads(payloads) {
  const now = new Date()
  const workId = payloads.find((payload) => payload?.appearance?.content)?.appearance?.content
  const homeCharacters = workId ? await charactersInHome(workId) : []
  const rememberHome = (entity) => {
    if (!entity?._id) return
    const id = String(entity._id)
    const index = homeCharacters.findIndex((row) => String(row._id) === id)
    if (index >= 0) homeCharacters[index] = entity
    else homeCharacters.push(entity)
  }

  const upsertOne = async (payload) => {
    const cleanedName = canonicalCharacterName(payload.name) || payload.name
    if (!isUsableCharacterName(cleanedName)) return null
    payload.name = cleanedName
    const rowWorkId = payload.appearance?.content || workId
    const aliases = uniqueEntityNames(
      payload.alternativeNames,
      payload.name,
      cleanCharacterName(payload.name),
    )

    let entity = await findCharacterForPayload(
      { ...payload, name: cleanedName },
      rowWorkId,
      homeCharacters,
    )

    if (!entity) {
      entity = new Entity({
        entityType: 'character',
        name: cleanedName,
        englishName: cleanedName,
        nativeName: payload.nativeName || '',
        alternativeNames: aliases,
        imagePath: characterPortraitPath(payload.imagePath),
        appearances: [payload.appearance],
        lastSyncedAt: now,
      })
      await fillSourceIds(entity, payload, PERSON_ID_FIELDS)
    } else {
      mergeAppearance(entity, payload.appearance)
      // MAL spelling wins; AniList/TMDB names become aliases of a MAL character.
      const renames = positiveId(payload.malId) || !positiveId(entity.malId)
      if (cleanedName && entity.name !== cleanedName && renames) {
        entity.alternativeNames = uniqueEntityNames(entity.alternativeNames, entity.name)
        entity.name = cleanedName
        entity.englishName = cleanedName
      }
      if (characterPortraitPath(payload.imagePath) && !characterPortraitPath(entity.imagePath)) {
        entity.imagePath = payload.imagePath
      }
      if (payload.nativeName && !entity.nativeName) entity.nativeName = payload.nativeName
      const names = uniqueEntityNames(entity.alternativeNames, aliases)
      if (names.length) entity.alternativeNames = names
      await fillSourceIds(entity, payload, PERSON_ID_FIELDS)
      entity.lastSyncedAt = now
    }

    // Credits are shared by reference with entity.appearances, so VA ids land before the save.
    await attachVoiceActorsToPayload(payload, now, entity._id)
    await entity.save()
    rememberHome(entity)
    return entity
  }

  const results = await mapWithConcurrency(payloads, CHARACTER_UPSERT_CONCURRENCY, async (payload) => {
    try {
      return await upsertOne(payload)
    } catch (error) {
      console.error(`Character upsert failed for ${payload?.name}:`, error.message)
      return null
    }
  })
  return results.filter(Boolean)
}

/**
 * `Promise.all` over `items` with at most `limit` in flight; keeps input order.
 * @template T, R
 * @param {T[]} items
 * @param {number} limit
 * @param {(item: T) => Promise<R>} fn
 * @returns {Promise<R[]>}
 */
async function mapWithConcurrency(items, limit, fn) {
  const results = new Array(items.length)
  let next = 0
  const worker = async () => {
    while (next < items.length) {
      const index = next++
      results[index] = await fn(items[index])
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker))
  return results
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
 * Record a title's AniList id when it has none and no other row of its kind owns it.
 * @param {unknown} contentId
 * @param {number} anilistId
 * @returns {Promise<void>}
 */
async function rememberTitleAnilistId(contentId, anilistId) {
  if (!contentId || !positiveId(anilistId)) return
  await query(
    `UPDATE content c SET anilist_id = $2, updated_at = now()
     WHERE c.id = $1 AND c.anilist_id IS NULL AND c.kind IN ('movie', 'series', 'special')
       AND NOT EXISTS (SELECT 1 FROM content o WHERE o.kind = c.kind AND o.anilist_id = $2)`,
    [String(contentId), anilistId],
  )
}

/**
 * Pull AniList characters (with Japanese/English voice actors) for a title by
 * its AniList id, else its MAL id. `ownMalId` marks the MAL id as the title's
 * own (not a franchise sibling's), so the AniList id can be stored on it.
 * @param {object} content
 * @param {{ fetchImpl?: typeof fetch, ownMalId?: boolean }} [options]
 * @returns {Promise<object[]>}
 */
export async function ingestAnilistCharacters(content, options = {}) {
  const anilistId = positiveId(content?.anilistId)
  const malId = positiveId(content?.malId)
  if (!anilistId && !malId) return []
  const media = await getAnilistMedia(
    { anilistId, malId },
    { withCharacters: true, fetchImpl: options.fetchImpl },
  )
  if (!media) return []
  if (!anilistId && options.ownMalId && positiveId(media.idMal) === malId) {
    await rememberTitleAnilistId(content._id, media.id)
    content.anilistId = media.id
  }
  const payloads = (media.characters?.edges || [])
    .map((edge) => mapAnilistCharacterEdge(edge, content._id))
    .filter(Boolean)
    .sort(
      (left, right) =>
        (right.appearance?.importance || 0) - (left.appearance?.importance || 0) ||
        appearanceRoleRank(left.appearance?.role) - appearanceRoleRank(right.appearance?.role),
    )
    .slice(0, Math.min(MAX_CHARACTERS_PER_TITLE, ANILIST_CHARACTERS_PER_TITLE))
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
 * Whether a character row came from MAL or AniList (not only TMDB credits).
 * @param {object} doc
 * @returns {boolean}
 */
function hasSourceId(doc) {
  return Boolean(positiveId(doc?.malId) || positiveId(doc?.anilistId))
}

/**
 * Drop leftover TMDB "(voice)" / unnamed credits, and TMDB-only rows once the
 * title has MAL or AniList characters.
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
    const sourcedCharacter = await Entity.findOne({
      entityType: 'character',
      'appearances.content': contentId,
      $or: [{ malId: { $gt: 0 } }, { anilistId: { $gt: 0 } }],
    })
    if (sourcedCharacter) {
      await Entity.updateMany(
        {
          entityType: 'character',
          'appearances.content': contentId,
          malId: null,
          anilistId: null,
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
function needsCharacterRefresh(content, docs, malId) {
  if (!docs.length) return true
  if (docs.some((doc) => !isUsableCharacterName(doc.name))) return true
  if (docs.some((doc) => /\(\s*voices?\s*\)/i.test(String(doc.name || '')))) return true
  const catalogMalId = positiveId(malId) || positiveId(content.malId)
  const catalogSourced = Boolean(catalogMalId || positiveId(content.anilistId))
  const hasSourced = docs.some(hasSourceId)
  if (catalogSourced && hasSourced && docs.some((doc) => !hasSourceId(doc))) return true
  if (catalogSourced && docs.every((doc) => !characterPortraitPath(doc.imagePath))) return true
  if (catalogSourced && !hasSourced) return true
  // AniList-only rows on a MAL title pick up MAL ids once Jikan is reachable.
  if (catalogMalId && jikanStatus().available && docs.every((doc) => !positiveId(doc.malId))) {
    return true
  }
  return false
}

/**
 * Characters attached to a title, ingesting from Jikan/TMDB when stale or empty.
 * `force` re-fetches even when stored characters look complete.
 * @param {object} content
 * @param {{ fetchImpl?: typeof fetch, force?: boolean }} [options]
 * @returns {Promise<object[]>}
 */
export async function ensureCharactersForContent(content, options = {}) {
  if (!content?._id) return []
  const key = String(content._id)
  if (ingestLocks.has(key)) return ingestLocks.get(key)
  const pending = loadCharactersForContent(content, options)
  ingestLocks.set(key, pending)
  try {
    return await pending
  } finally {
    ingestLocks.delete(key)
  }
}

/**
 * Unlocked character ingest used by `ensureCharactersForContent`.
 * @param {object} content
 * @param {{ fetchImpl?: typeof fetch }} [options]
 * @returns {Promise<object[]>}
 */
async function loadCharactersForContent(content, options = {}) {
  await ensureEntityIndexes()

  let docs = await Entity.find({
    entityType: 'character',
    'appearances.content': content._id,
  })

  const key = String(content._id)
  const lastAttempt = characterSyncAttempts.get(key) || 0
  if (!options.force && docs.length && Date.now() - lastAttempt < CHARACTER_RETRY_MS) {
    return highlightedCharacters(docs, content._id, MAX_CHARACTERS_PER_TITLE)
  }

  const malId = Number(content.malId) > 0 ? Number(content.malId) : await siblingMalId(content._id)
  const ingestContent = malId ? { ...content, malId } : content

  if (!options.force && !needsCharacterRefresh(content, docs, malId)) {
    characterSyncAttempts.set(key, Date.now())
    return highlightedCharacters(docs, content._id, MAX_CHARACTERS_PER_TITLE)
  }
  characterSyncAttempts.set(key, Date.now())

  if (malId) {
    try {
      await ingestJikanCharacters(ingestContent, options)
    } catch (error) {
      console.error('Jikan character ingest failed:', error.message)
    }
  }

  if (malId || positiveId(content.anilistId)) {
    try {
      await ingestAnilistCharacters(ingestContent, {
        ...options,
        ownMalId: positiveId(content.malId) === malId,
      })
      if (positiveId(ingestContent.anilistId)) content.anilistId = ingestContent.anilistId
    } catch (error) {
      console.error('AniList character ingest failed:', error.message)
    }
  }

  docs = await Entity.find({
    entityType: 'character',
    'appearances.content': content._id,
  })
  if (content.tmdbId && !docs.some(hasSourceId)) {
    try {
      await ingestTmdbCharacters(content, options)
    } catch (error) {
      console.error('TMDB character ingest failed:', error.message)
    }
  }

  await cleanupStaleCharacterAppearances(ingestContent)

  try {
    await mergeFranchiseCharactersForWork(content._id)
  } catch (error) {
    console.error('Franchise character merge failed:', error.message)
  }

  docs = await Entity.find({
    entityType: 'character',
    'appearances.content': content._id,
  })

  const missingPortraits = docs.filter(
    (doc) => !characterPortraitPath(doc.imagePath) && hasSourceId(doc),
  )
  for (const doc of missingPortraits.slice(0, MAX_CHARACTERS_PER_TITLE)) {
    try {
      await ensureCharacterAbout(doc, options)
    } catch (error) {
      console.error(`Character portrait backfill failed for ${doc.name}:`, error.message)
    }
  }

  docs = await Entity.find({
    entityType: 'character',
    'appearances.content': content._id,
  })

  if (docs.length) {
    content.characterSyncAt = new Date()
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
  const malId = positiveId(entity.malId)
  if (!malId && !positiveId(entity.anilistId)) {
    if (needsPortrait && entity.imagePath) {
      entity.imagePath = ''
      await entity.save()
    }
    return entity
  }
  const body = malId ? await jikanGet(`/characters/${malId}`, options) : null
  const data = body?.data
  if (!data) return fillCharacterFromAnilist(entity, needsPortrait, options)
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
 * Fill a character's about, native name, aliases, and portrait from AniList.
 * @param {object} entity
 * @param {boolean} needsPortrait
 * @param {{ fetchImpl?: typeof fetch }} options
 * @returns {Promise<object>}
 */
async function fillCharacterFromAnilist(entity, needsPortrait, options) {
  const data = await getAnilistCharacter(entity.anilistId, options)
  if (!data) return entity
  const about = cleanAnilistText(data.description)
  if (!entity.about && about) entity.about = about
  if (!entity.nativeName && data.name?.native) entity.nativeName = normalizeEntityName(data.name.native)
  const aliases = uniqueEntityNames(entity.alternativeNames, data.name?.alternative || [])
  if (aliases.length) entity.alternativeNames = aliases.filter((alias) => alias !== entity.name)
  const image = anilistImage(data.image?.large)
  if (needsPortrait && image) entity.imagePath = image
  await entity.save()
  return entity
}

/**
 * Fill a voice actor's about, native name, aliases, and photo from AniList.
 * @param {object} entity
 * @param {boolean} needsImage
 * @param {{ fetchImpl?: typeof fetch }} options
 * @returns {Promise<object>}
 */
async function fillVoiceActorFromAnilist(entity, needsImage, options) {
  const data = await getAnilistStaff(entity.anilistId, options)
  if (!data) return entity
  const about = cleanAnilistText(data.description)
  if (!entity.about && about) entity.about = about
  if (!entity.nativeName && data.name?.native) entity.nativeName = normalizeEntityName(data.name.native)
  const aliases = uniqueEntityNames(entity.alternativeNames, data.name?.alternative || [])
  if (aliases.length) entity.alternativeNames = aliases.filter((alias) => alias !== entity.name)
  const image = anilistImage(data.image?.large)
  if (needsImage && image) entity.imagePath = image
  await entity.save()
  return entity
}

/**
 * Voice actors attached to a title (created while ingesting its characters).
 * @param {object} content
 * @param {{ fetchImpl?: typeof fetch }} [options]
 * @returns {Promise<object[]>}
 */
export async function ensureVoiceActorsForContent(content, options = {}) {
  if (!content?._id) return []
  await ensureCharactersForContent(content, options)
  const docs = await Entity.find({
    entityType: 'voice_actor',
    'appearances.content': content._id,
  })
  return highlightedVoiceActors(docs, content._id)
}

/**
 * Persist missing voice-actor entities from a character's credits.
 * @param {object} character
 * @returns {Promise<object>}
 */
export async function ensureVoiceActorsForCharacter(character) {
  if (!character || character.entityType !== 'character') return character
  const now = new Date()
  let changed = false
  for (const appearance of character.appearances || []) {
    const contentId = appearance.content?._id || appearance.content
    for (const credit of appearance.voiceActors || []) {
      if (credit.entity) continue
      const vaPayload = mapVoiceActorFromCredit(credit, {
        contentId,
        characterName: character.name,
        role: appearance.role,
        characterId: character._id,
      })
      if (!vaPayload) continue
      try {
        const voiceActor = await upsertVoiceActorPayload(vaPayload, now)
        if (voiceActor) {
          credit.entity = voiceActor._id
          changed = true
        }
      } catch (error) {
        console.error(`Voice actor link failed for ${credit?.name}:`, error.message)
      }
    }
  }
  if (changed) await character.save()
  return character
}

/**
 * Fill biography and portrait from Jikan `/people/{id}` when a VA page is opened.
 * @param {object} entity
 * @param {{ fetchImpl?: typeof fetch }} [options]
 * @returns {Promise<object>}
 */
export async function ensureVoiceActorAbout(entity, options = {}) {
  if (!entity || entity.entityType !== 'voice_actor') return entity
  const needsImage = !voiceActorImagePath(entity.imagePath)
  if (entity.about && !needsImage) return entity
  const malId = positiveId(entity.malId)
  const body = malId ? await jikanGet(`/people/${malId}`, options) : null
  const data = body?.data
  if (!data) {
    return positiveId(entity.anilistId)
      ? fillVoiceActorFromAnilist(entity, needsImage, options)
      : entity
  }
  if (!entity.about && data.about) entity.about = String(data.about).trim()
  const given = String(data.given_name || '').trim()
  const family = String(data.family_name || '').trim()
  if (!entity.nativeName && (family || given)) {
    entity.nativeName = [family, given].filter(Boolean).join(' ')
  }
  const names = uniqueEntityNames(entity.alternativeNames, data.alternate_names, data.name)
  if (names.length) entity.alternativeNames = names
  const jpg = data.images?.jpg?.large_image_url || data.images?.jpg?.image_url
  if (needsImage && jpg && !/questionmark/i.test(String(jpg))) entity.imagePath = jpg
  const display = displayPersonName(data.name) || entity.name
  if (display && entity.name !== display) {
    entity.alternativeNames = uniqueEntityNames(entity.alternativeNames, entity.name)
    entity.name = display
    entity.englishName = display
  }
  await entity.save()
  return entity
}

/**
 * Whether Jikan `/people/{id}/voices` should be fetched again.
 * @param {object} entity
 * @returns {boolean}
 */
function voiceCreditsAreFresh(entity) {
  if (!entity?.voiceCreditsSyncedAt) return false
  return Date.now() - new Date(entity.voiceCreditsSyncedAt).getTime() < STALE_MS
}

/**
 * Attach catalog character ids onto voice-actor appearances that only have names.
 * @param {object} entity
 * @returns {Promise<boolean>}
 */
async function attachLocalCharactersToVoiceActor(entity) {
  let changed = false
  for (const appearance of entity.appearances || []) {
    if (appearance.character) continue
    const name = canonicalCharacterName(appearance.characterName)
    if (!isUsableCharacterName(name)) continue
    const contentId = appearance.content?._id || appearance.content
    let match = contentId ? await findCharacterForPayload({ name }, contentId) : null
    if (!match) {
      match = await Entity.findOne(characterUpsertFilter({ name }))
    }
    if (!match) continue
    appearance.character = match._id
    if (!appearance.characterName) appearance.characterName = match.name
    changed = true
  }
  return changed
}

/**
 * Cache key for a voiced-character row (MAL id, else AniList id).
 * @param {{ malId?: number, anilistId?: number }} mapped
 * @returns {string}
 */
function voicedCharacterKey(mapped) {
  return positiveId(mapped.malId) ? `mal:${mapped.malId}` : `al:${mapped.anilistId}`
}

/**
 * Upsert a character from a Jikan or AniList voiced-character row so the VA
 * page can link it.
 * @param {{ malId?: number, anilistId?: number, name: string, nativeName?: string, imagePath?: string, role: string }} mapped
 * @param {object|null} content
 * @param {Date} now
 * @param {Map<string, object>} known
 * @returns {Promise<object|null>}
 */
async function upsertCharacterFromVoiceRow(mapped, content, now, known) {
  const cleanedName = canonicalCharacterName(mapped.name) || mapped.name
  const key = voicedCharacterKey(mapped)
  let character = known.get(key) || null
  if (!character) {
    character = await findCharacterForPayload(
      { ...mapped, name: cleanedName },
      content?._id || null,
    )
  }
  if (character) known.set(key, character)
  if (!character) {
    character = new Entity({
      entityType: 'character',
      name: cleanedName,
      englishName: cleanedName,
      nativeName: mapped.nativeName || '',
      imagePath: characterPortraitPath(mapped.imagePath),
      appearances: content
        ? [
            {
              content: content._id,
              role: mapped.role,
              importance: characterImportanceScore({ role: mapped.role }),
            },
          ]
        : [],
      lastSyncedAt: now,
    })
    await fillSourceIds(character, mapped, ['malId', 'anilistId'])
    await character.save()
    known.set(key, character)
    return character
  }

  let changed = false
  if (content) {
    changed = mergeAppearance(character, {
      content: content._id,
      role: mapped.role,
      importance: characterImportanceScore({ role: mapped.role }),
    })
  }
  if (characterPortraitPath(mapped.imagePath) && !characterPortraitPath(character.imagePath)) {
    character.imagePath = mapped.imagePath
    changed = true
  }
  const renames = positiveId(mapped.malId) || !positiveId(character.malId)
  if (renames && character.name !== cleanedName && isUsableCharacterName(cleanedName)) {
    character.alternativeNames = uniqueEntityNames(character.alternativeNames, character.name)
    character.name = cleanedName
    if (!character.englishName) character.englishName = cleanedName
    changed = true
  }
  if (mapped.nativeName && !character.nativeName) {
    character.nativeName = mapped.nativeName
    changed = true
  }
  const before = `${character.malId}:${character.anilistId}`
  await fillSourceIds(character, mapped, ['malId', 'anilistId'])
  if (`${character.malId}:${character.anilistId}` !== before) changed = true
  if (changed) await character.save()
  return character
}

/**
 * Voiced-character rows from Jikan `/people/{id}/voices`.
 * @param {object} entity
 * @param {{ fetchImpl?: typeof fetch }} options
 * @returns {Promise<object[] | null>} null when Jikan returned nothing.
 */
async function jikanVoicedRows(entity, options) {
  const malId = positiveId(entity.malId)
  if (!malId) return null
  const body = await jikanGet(`/people/${malId}/voices`, options)
  if (!body) return null
  return (Array.isArray(body?.data) ? body.data : [])
    .map((row) => mapJikanPersonVoiceRow(row))
    .filter(Boolean)
    .map((row) => ({ ...row, language: 'Japanese' }))
}

/**
 * Voiced-character rows from AniList staff `characterMedia`.
 * @param {object} entity
 * @param {{ fetchImpl?: typeof fetch }} options
 * @returns {Promise<object[] | null>} null when AniList returned nothing.
 */
async function anilistVoicedRows(entity, options) {
  const staff = await getAnilistStaff(entity.anilistId, { ...options, withCharacters: true })
  if (!staff) return null
  const language = staff.languageV2 || 'Japanese'
  const rows = []
  for (const edge of staff.characterMedia?.edges || []) {
    if (edge?.node?.type && edge.node.type !== 'ANIME') continue
    const role = { MAIN: 'Main', SUPPORTING: 'Supporting', BACKGROUND: 'Cameo' }[edge?.characterRole]
    for (const character of edge?.characters || []) {
      const mapped = mapAnilistCharacterEdge(
        { role: edge.characterRole, node: character, voiceActorRoles: [] },
        null,
      )
      if (!mapped) continue
      rows.push({
        anilistId: mapped.anilistId,
        name: mapped.name,
        nativeName: mapped.nativeName,
        imagePath: mapped.imagePath,
        role: role || 'Supporting',
        language,
        animeAnilistId: positiveId(edge.node?.id),
        animeMalId: positiveId(edge.node?.idMal),
      })
    }
  }
  return rows
}

/**
 * Pull every voiced character for a voice actor (not only visited titles):
 * Jikan by MAL id, else AniList by AniList id. AniList rows are linked only for
 * titles already in the catalog.
 * @param {object} entity
 * @param {{ fetchImpl?: typeof fetch }} [options]
 * @returns {Promise<object>}
 */
async function ingestVoiceActorCredits(entity, options = {}) {
  await ensureEntityIndexes()
  const now = new Date()
  let changed = await attachLocalCharactersToVoiceActor(entity)

  let mappedRows = await jikanVoicedRows(entity, options)
  const fromAnilist = !mappedRows && positiveId(entity.anilistId)
  if (fromAnilist) mappedRows = await anilistVoicedRows(entity, options)
  if (!mappedRows) {
    if (changed) await entity.save()
    return entity
  }
  mappedRows = mappedRows.slice(0, MAX_VOICED_CHARACTERS)

  const characterMalIds = [...new Set(mappedRows.map((row) => row.malId).filter(Boolean))]
  const characterAnilistIds = [...new Set(mappedRows.map((row) => row.anilistId).filter(Boolean))]
  const animeMalIds = [...new Set(mappedRows.map((row) => row.animeMalId).filter(Boolean))]
  const animeAnilistIds = [...new Set(mappedRows.map((row) => row.animeAnilistId).filter(Boolean))]
  const characterIdFilters = [
    characterMalIds.length ? { malId: { $in: characterMalIds } } : null,
    characterAnilistIds.length ? { anilistId: { $in: characterAnilistIds } } : null,
  ].filter(Boolean)
  const contentIdFilters = [
    animeMalIds.length ? { malId: { $in: animeMalIds } } : null,
    animeAnilistIds.length ? { anilistId: { $in: animeAnilistIds } } : null,
  ].filter(Boolean)
  const [existingCharacters, contents] = await Promise.all([
    characterIdFilters.length
      ? Entity.find({ entityType: 'character', $or: characterIdFilters })
      : Promise.resolve([]),
    contentIdFilters.length
      ? Content.find({ $or: contentIdFilters }).select('_id malId anilistId')
      : Promise.resolve([]),
  ])
  const known = new Map()
  for (const doc of existingCharacters) {
    if (positiveId(doc.malId)) known.set(`mal:${doc.malId}`, doc)
    if (positiveId(doc.anilistId)) known.set(`al:${doc.anilistId}`, doc)
  }
  const contentByMal = new Map(contents.map((doc) => [Number(doc.malId), doc]))
  const contentByAnilist = new Map(contents.map((doc) => [Number(doc.anilistId), doc]))

  for (const mapped of mappedRows) {
    try {
      const content =
        (mapped.animeAnilistId && contentByAnilist.get(mapped.animeAnilistId)) ||
        (mapped.animeMalId && contentByMal.get(mapped.animeMalId)) ||
        null
      if (fromAnilist && !content) continue
      const character = await upsertCharacterFromVoiceRow(mapped, content, now, known)
      if (!character) continue
      const appearance = {
        character: character._id,
        characterName: mapped.name,
        role: mapped.role,
        language: mapped.language,
        importance: characterImportanceScore({ role: mapped.role }),
      }
      if (content) appearance.content = content._id
      if (mergeAppearance(entity, appearance)) changed = true
    } catch (error) {
      console.error(`Voice credit ingest failed for ${mapped?.name}:`, error.message)
    }
  }

  entity.voiceCreditsSyncedAt = now
  entity.lastSyncedAt = now
  await entity.save()
  return entity
}

/**
 * Load every character this voice actor has played, including MAL credits
 * for titles the user has not opened.
 * @param {object} entity
 * @param {{ fetchImpl?: typeof fetch }} [options]
 * @returns {Promise<object>}
 */
export async function ensureVoiceActorCredits(entity, options = {}) {
  if (!entity || entity.entityType !== 'voice_actor') return entity
  const hasCharacterLinks = (entity.appearances || []).some((row) => row.character)
  if (voiceCreditsAreFresh(entity) && hasCharacterLinks) return entity

  const key = `va-voices:${entity._id}`
  if (ingestLocks.has(key)) {
    await ingestLocks.get(key)
    const fresh = await Entity.findById(entity._id)
    return fresh || entity
  }
  const pending = ingestVoiceActorCredits(entity, options)
  ingestLocks.set(key, pending)
  try {
    return await pending
  } finally {
    ingestLocks.delete(key)
  }
}

/**
 * Jikan producer for a studio: by stored MAL id, else a name search.
 * @param {object} entity
 * @param {{ fetchImpl?: typeof fetch }} options
 * @returns {Promise<object|null>}
 */
async function fetchJikanProducer(entity, options) {
  const malId = Number(entity.malId)
  if (Number.isFinite(malId) && malId > 0) {
    const body = await jikanGet(`/producers/${malId}/full`, options)
    return body?.data || null
  }
  const body = await jikanGet(
    `/producers?q=${encodeURIComponent(entity.name)}&order_by=favorites&sort=desc&limit=10`,
    options,
  )
  return pickJikanProducer(body?.data, entity.name)
}

/**
 * TMDB company (logo, description) matching the studio name.
 * @param {object} entity
 * @param {{ fetchImpl?: typeof fetch, tmdbToken?: string }} options
 * @returns {Promise<object|null>}
 */
async function fetchTmdbCompany(entity, options) {
  const apiKey = options.tmdbToken || process.env.TMDB_API_KEY
  if (!apiKey) return null
  const key = encodeURIComponent(apiKey)
  let companyId = Number(entity.tmdbId)
  if (!Number.isFinite(companyId) || companyId < 1) {
    const search = await fetchJson(
      `${TMDB_BASE}/search/company?api_key=${key}&query=${encodeURIComponent(entity.name)}`,
      options,
    )
    companyId = Number(pickTmdbCompany(search?.results, entity.name)?.id)
  }
  if (!Number.isFinite(companyId) || companyId < 1) return null
  return fetchJson(`${TMDB_BASE}/company/${companyId}?api_key=${key}`, options)
}

/**
 * Another studio row that already owns this MAL/TMDB id (unique per kind).
 * @param {'malId' | 'tmdbId'} field
 * @param {number} value
 * @param {object} entity
 * @returns {Promise<object|null>}
 */
async function otherStudioWith(field, value, entity) {
  if (!Number.isFinite(value) || value < 1) return null
  const other = await Entity.findOne({ entityType: 'studio', [field]: value })
  return other && String(other._id) !== String(entity._id) ? other : null
}

/**
 * Fill a studio's logo, native name, and about from Jikan, falling back to TMDB.
 * Failed lookups are not retried on every page view. When the matching MAL
 * producer already belongs to another studio row, sets `duplicateOfId` and
 * leaves this row unchanged.
 * @param {object} entity
 * @param {{ fetchImpl?: typeof fetch, tmdbToken?: string }} [options]
 * @returns {Promise<object>}
 */
export async function ensureStudioDetails(entity, options = {}) {
  if (!entity || entity.entityType !== 'studio') return entity
  if (studioImagePath(entity.imagePath) && entity.about) return entity
  const key = String(entity._id)
  const lastAttempt = studioSyncAttempts.get(key) || 0
  if (!options.force && Date.now() - lastAttempt < CHARACTER_RETRY_MS) return entity
  studioSyncAttempts.set(key, Date.now())

  let changed = false
  const producer = mapJikanProducer(await fetchJikanProducer(entity, options))
  if (producer) {
    if (!entity.malId) {
      const owner = await otherStudioWith('malId', producer.malId, entity)
      if (owner) {
        entity.duplicateOfId = owner._id
        return entity
      }
      entity.malId = producer.malId
      changed = true
    }
    if (!studioImagePath(entity.imagePath) && producer.imagePath) {
      entity.imagePath = producer.imagePath
      changed = true
    }
    if (!entity.about && producer.about) {
      entity.about = producer.about
      changed = true
    }
    if (!entity.nativeName && producer.nativeName) {
      entity.nativeName = producer.nativeName
      changed = true
    }
    const names = uniqueEntityNames(entity.alternativeNames, producer.alternativeNames).filter(
      (name) => name !== entity.name,
    )
    if (names.length !== (entity.alternativeNames || []).length) {
      entity.alternativeNames = names
      changed = true
    }
  }

  if (!studioImagePath(entity.imagePath) || !entity.about) {
    const company = await fetchTmdbCompany(entity, options)
    if (company?.id) {
      if (!entity.tmdbId && !(await otherStudioWith('tmdbId', Number(company.id), entity))) {
        entity.tmdbId = Number(company.id)
        changed = true
      }
      if (!studioImagePath(entity.imagePath) && company.logo_path) {
        entity.imagePath = company.logo_path
        changed = true
      }
      if (!entity.about && company.description) {
        entity.about = String(company.description).trim()
        changed = true
      }
    }
  }

  if (changed) await entity.save()
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
  const aliases = uniqueEntityNames(term, displayPersonName(term), canonicalCharacterName(term))
  return (
    candidates.find((doc) =>
      uniqueEntityNames(doc.name, doc.englishName, doc.nativeName, doc.alternativeNames).some(
        (candidate) =>
          aliases.some((alias) =>
            entityType === 'studio'
              ? studioNamesEqual(candidate, alias)
              : characterNamesEqual(candidate, alias) || entityNamesEqual(candidate, alias),
          ),
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
  const contentSelect =
    entity.entityType === 'studio'
      ? 'title englishTitle nativeTitle posterPath contentType releaseDate startSeasonYear unifiedScore malStatus'
      : 'title englishTitle nativeTitle posterPath contentType franchise'
  await entity.populate([
    {
      path: 'appearances.content',
      select: contentSelect,
    },
    {
      path: 'appearances.character',
      select: 'name englishName imagePath entityType malId',
    },
  ])
  return serializeEntity(entity, options)
}

export { serializeEntity }
