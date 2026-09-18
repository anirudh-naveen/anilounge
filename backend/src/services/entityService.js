/**
 * entityService.js — ingest and lookup for catalog characters (and later VAs/studios).
 *
 * Domain service: Jikan anime-character lists and TMDB credits are upserted into
 * Entity documents. Title pages and search read the persisted rows.
 */

import Entity from '../models/Entity.js'
import Content from '../models/Content.js'
import {
  appearanceRoleRank,
  characterImportanceScore,
  characterPortraitPath,
  characterUpsertFilter,
  cleanCharacterName,
  displayPersonName,
  entityNamesEqual,
  foldEntityName,
  highlightedCharacters,
  highlightedVoiceActors,
  isUsableCharacterName,
  mapJikanCharacterRow,
  mapJikanPersonVoiceRow,
  mapTmdbCharacterCredits,
  mapVoiceActorFromCredit,
  serializeEntity,
  uniqueEntityNames,
  voiceActorImagePath,
  voiceActorUpsertFilter,
} from '../utils/entities.js'

const JIKAN_BASE = 'https://api.jikan.moe/v4'
const TMDB_BASE = 'https://api.themoviedb.org/3'
const STALE_MS = 7 * 24 * 60 * 60 * 1000
const JIKAN_GAP_MS = 450
const FETCH_TIMEOUT_MS = 20000
const MAX_CHARACTERS_PER_TITLE = 80
const MAX_VOICED_CHARACTERS = 600
const JIKAN_HEADERS = {
  Accept: 'application/json',
  'User-Agent': 'AniLounge/1.0 (https://find-animation.vercel.app; catalog characters)',
}

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
 * Upsert one voice-actor payload and return the saved document.
 * @param {object} payload
 * @param {Date} now
 * @returns {Promise<object|null>}
 */
async function upsertVoiceActorPayload(payload, now = new Date()) {
  const name = displayPersonName(payload?.name)
  if (!name) return null
  let entity = await Entity.findOne(voiceActorUpsertFilter({ ...payload, name }))
  const malId = Number(payload.malId)
  const hasMalId = Number.isFinite(malId) && malId > 0
  const imagePath = voiceActorImagePath(payload.imagePath)

  if (!entity) {
    entity = new Entity({
      entityType: 'voice_actor',
      name,
      englishName: name,
      alternativeNames: payload.alternativeNames || [],
      imagePath,
      appearances: payload.appearance ? [payload.appearance] : [],
      lastSyncedAt: now,
    })
    if (hasMalId) entity.malId = malId
    if (payload.tmdbId) entity.tmdbId = payload.tmdbId
    await entity.save()
    return entity
  }

  if (payload.appearance) mergeAppearance(entity, payload.appearance)
  if (entity.name !== name) {
    entity.name = name
    if (!entity.englishName) entity.englishName = name
  }
  if (imagePath && !voiceActorImagePath(entity.imagePath)) entity.imagePath = imagePath
  const names = uniqueEntityNames(entity.alternativeNames, payload.alternativeNames)
  if (names.length) entity.alternativeNames = names
  if (entity.malId == null) entity.set('malId', undefined)
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
  const saved = []
  const now = new Date()
  for (const payload of payloads) {
    try {
      const cleanedName = cleanCharacterName(payload.name) || payload.name
      if (!isUsableCharacterName(cleanedName)) continue
      payload.name = cleanedName

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
        await attachVoiceActorsToPayload(payload, now, entity._id)
        if (payload.appearance?.voiceActors?.length) await entity.save()
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
      await attachVoiceActorsToPayload(payload, now, entity._id)
      if (payload.appearance?.voiceActors?.length) await entity.save()
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
  const malId = Number(entity.malId)
  if (!Number.isFinite(malId) || malId < 1) return entity
  const body = await jikanGet(`/people/${malId}`, options)
  const data = body?.data
  if (!data) return entity
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
    const name = cleanCharacterName(appearance.characterName)
    if (!isUsableCharacterName(name)) continue
    const contentId = appearance.content?._id || appearance.content
    let match = null
    if (contentId) {
      match = await Entity.findOne({
        entityType: 'character',
        'appearances.content': contentId,
        $or: [{ name }, { englishName: name }],
      })
    }
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
 * Upsert a character from a Jikan people-voices row so the VA page can link it.
 * @param {object} mapped
 * @param {object|null} content
 * @param {Date} now
 * @param {Map<number, object>} byMal
 * @returns {Promise<object|null>}
 */
async function upsertCharacterFromVoiceRow(mapped, content, now, byMal) {
  let character = byMal.get(mapped.malId) || null
  if (!character) {
    character = new Entity({
      entityType: 'character',
      name: mapped.name,
      englishName: mapped.name,
      imagePath: characterPortraitPath(mapped.imagePath),
      malId: mapped.malId,
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
    await character.save()
    byMal.set(mapped.malId, character)
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
  if (mapped.name && character.name !== mapped.name && isUsableCharacterName(mapped.name)) {
    character.name = mapped.name
    if (!character.englishName) character.englishName = mapped.name
    changed = true
  }
  if (changed) await character.save()
  return character
}

/**
 * Pull every Jikan voiced character for a voice actor (not only visited titles).
 * @param {object} entity
 * @param {{ fetchImpl?: typeof fetch }} [options]
 * @returns {Promise<object>}
 */
async function ingestVoiceActorCredits(entity, options = {}) {
  await ensureEntityIndexes()
  const malId = Number(entity.malId)
  const now = new Date()
  let changed = await attachLocalCharactersToVoiceActor(entity)

  if (!Number.isFinite(malId) || malId < 1) {
    if (changed) await entity.save()
    return entity
  }

  const body = await jikanGet(`/people/${malId}/voices`, options)
  if (!body) {
    if (changed) await entity.save()
    return entity
  }
  const mappedRows = (Array.isArray(body?.data) ? body.data : [])
    .map((row) => mapJikanPersonVoiceRow(row))
    .filter(Boolean)
    .slice(0, MAX_VOICED_CHARACTERS)

  const characterMalIds = [...new Set(mappedRows.map((row) => row.malId))]
  const animeMalIds = [...new Set(mappedRows.map((row) => row.animeMalId).filter(Boolean))]
  const [existingCharacters, contents] = await Promise.all([
    characterMalIds.length
      ? Entity.find({ entityType: 'character', malId: { $in: characterMalIds } })
      : Promise.resolve([]),
    animeMalIds.length
      ? Content.find({ malId: { $in: animeMalIds } }).select('_id malId')
      : Promise.resolve([]),
  ])
  const byMal = new Map(existingCharacters.map((doc) => [Number(doc.malId), doc]))
  const contentByMal = new Map(contents.map((doc) => [Number(doc.malId), doc]))

  for (const mapped of mappedRows) {
    try {
      const content = mapped.animeMalId ? contentByMal.get(mapped.animeMalId) || null : null
      const character = await upsertCharacterFromVoiceRow(mapped, content, now, byMal)
      if (!character) continue
      const appearance = {
        character: character._id,
        characterName: mapped.name,
        role: mapped.role,
        language: 'Japanese',
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
  const aliases = uniqueEntityNames(term, displayPersonName(term))
  return (
    candidates.find((doc) =>
      uniqueEntityNames(doc.name, doc.englishName, doc.nativeName, doc.alternativeNames).some(
        (candidate) => aliases.some((alias) => entityNamesEqual(candidate, alias)),
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
  await entity.populate([
    {
      path: 'appearances.content',
      select: 'title englishTitle nativeTitle posterPath contentType',
    },
    {
      path: 'appearances.character',
      select: 'name englishName imagePath entityType malId',
    },
  ])
  return serializeEntity(entity, options)
}

export { serializeEntity }
