/**
 * entities.js — character / voice-actor / studio name helpers.
 *
 * Utils layer: normalizes names, maps Jikan/TMDB payloads onto catalog entity
 * shapes, and matches episode cast names onto persisted characters. Mongo and
 * HTTP stay in the entity service.
 */

export const ENTITY_TYPES = ['character', 'voice_actor', 'studio']
export const HIGHLIGHTED_CHARACTERS_PER_TITLE = 10

const ROLE_ORDER = { Main: 0, Supporting: 1, Background: 2 }
const BLOCKED_CHARACTER_NAMES = new Set([
  'self',
  'himself',
  'herself',
  'themselves',
  'additional voices',
  'additional voice',
  'extra',
  'extras',
  'various',
  'various characters',
  'cameo',
  'crowd',
  'unnamed',
  'unknown',
  'n a',
  'none',
  'voice',
  'voices',
])

/**
 * Trim a name string; non-strings become empty.
 * @param {unknown} value
 * @returns {string}
 */
export function normalizeEntityName(value) {
  if (typeof value !== 'string') return ''
  return value.trim()
}

/**
 * Lowercase alphanumeric collapse used for fuzzy character matching.
 * "Monkey D. Luffy" and "monkey d luffy" compare equal.
 * @param {unknown} value
 * @returns {string}
 */
export function foldEntityName(value) {
  return normalizeEntityName(value)
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Case-insensitive name equality after folding punctuation.
 * @param {unknown} left
 * @param {unknown} right
 * @returns {boolean}
 */
export function entityNamesEqual(left, right) {
  const a = foldEntityName(left)
  const b = foldEntityName(right)
  return Boolean(a) && a === b
}

/**
 * Strip TMDB credit suffixes such as "(voice)" from a character name.
 * @param {unknown} value
 * @returns {string}
 */
export function cleanCharacterName(value) {
  let name = normalizeEntityName(value)
  if (!name) return ''
  name = name.replace(
    /\s*\((?:voice|voices|voice acting|uncredited|archive footage|archive sound)s?\)/gi,
    '',
  )
  name = name.replace(/\(\s*\)/g, '').replace(/\s+/g, ' ').trim()
  return name
}

/**
 * Whether a credit is a real named character (not extras / blank / "Self").
 * @param {unknown} value
 * @returns {boolean}
 */
export function isUsableCharacterName(value) {
  const name = cleanCharacterName(value)
  if (!name) return false
  const folded = foldEntityName(name)
  if (!folded) return false
  if (BLOCKED_CHARACTER_NAMES.has(folded)) return false
  if (/^additional voices?\b/.test(folded)) return false
  return true
}

/**
 * Deduplicate names, preserving first-seen casing.
 * @param {...(string | string[] | undefined)} groups
 * @returns {string[]}
 */
export function uniqueEntityNames(...groups) {
  const seen = new Set()
  const result = []
  for (const group of groups) {
    const values = Array.isArray(group) ? group : [group]
    for (const value of values) {
      const name = normalizeEntityName(value)
      if (!name) continue
      const key = foldEntityName(name)
      if (!key || seen.has(key)) continue
      seen.add(key)
      result.push(name)
    }
  }
  return result
}

/**
 * Prefer Main over Supporting; unknown roles sort last.
 * @param {string} [role]
 * @returns {number}
 */
export function appearanceRoleRank(role) {
  const key = normalizeEntityName(role)
  return Object.prototype.hasOwnProperty.call(ROLE_ORDER, key) ? ROLE_ORDER[key] : 2
}

/**
 * Higher is more important to the title (Main + MAL favorites, or TMDB billing).
 * @param {{ role?: string, favorites?: number, order?: number, episodeCount?: number }} [input]
 * @returns {number}
 */
export function characterImportanceScore(input = {}) {
  const roleBoost = (2 - Math.min(appearanceRoleRank(input.role), 2)) * 1_000_000
  const favorites = Number(input.favorites)
  if (Number.isFinite(favorites) && favorites > 0) return roleBoost + favorites
  const episodes = Number(input.episodeCount)
  const episodeBoost = Number.isFinite(episodes) && episodes > 0 ? episodes * 10 : 0
  const castOrder = Number(input.order)
  const orderBoost = Number.isFinite(castOrder) ? Math.max(0, 10_000 - castOrder) : 0
  return roleBoost + episodeBoost + orderBoost
}

/**
 * Appearance row for a specific catalog title.
 * @param {object} [entity]
 * @param {unknown} contentId
 * @returns {object | null}
 */
export function appearanceForContentId(entity, contentId) {
  const id = String(contentId || '')
  if (!id) return null
  return (
    (entity?.appearances || []).find((row) => String(row.content?._id || row.content) === id) ||
    null
  )
}

/**
 * Main / higher-importance first, then name.
 * @param {object} left
 * @param {object} right
 * @param {unknown} contentId
 * @returns {number}
 */
export function compareCharactersForContent(left, right, contentId) {
  const leftApp = appearanceForContentId(left, contentId)
  const rightApp = appearanceForContentId(right, contentId)
  const roleDiff = appearanceRoleRank(leftApp?.role) - appearanceRoleRank(rightApp?.role)
  if (roleDiff) return roleDiff
  const importanceDiff = (Number(rightApp?.importance) || 0) - (Number(leftApp?.importance) || 0)
  if (importanceDiff) return importanceDiff
  const leftName = cleanCharacterName(left?.name) || String(left?.name || '')
  const rightName = cleanCharacterName(right?.name) || String(right?.name || '')
  return leftName.localeCompare(rightName)
}

/**
 * Named characters for a title, most important first, capped for the slides.
 * @param {object[]} [entities]
 * @param {unknown} contentId
 * @param {number} [limit]
 * @returns {object[]}
 */
export function highlightedCharacters(
  entities,
  contentId,
  limit = HIGHLIGHTED_CHARACTERS_PER_TITLE,
) {
  const cap = Number.isFinite(Number(limit)) ? Number(limit) : HIGHLIGHTED_CHARACTERS_PER_TITLE
  return [...(Array.isArray(entities) ? entities : [])]
    .filter((entity) => isUsableCharacterName(entity?.name))
    .sort((left, right) => compareCharactersForContent(left, right, contentId))
    .slice(0, Math.max(0, cap))
}

/**
 * Picture URL from a Jikan `images` object or a TMDB path.
 * @param {object} [images]
 * @param {string} [tmdbPath]
 * @returns {string}
 */
export function entityImagePath(images, tmdbPath = '') {
  const jpg =
    images?.jpg?.large_image_url ||
    images?.jpg?.image_url ||
    images?.webp?.large_image_url ||
    images?.webp?.image_url ||
    ''
  const fromJikan = normalizeEntityName(jpg)
  if (fromJikan && !/questionmark/i.test(fromJikan)) return fromJikan
  return normalizeEntityName(tmdbPath)
}

/**
 * Whether an image is a character portrait rather than a voice-actor/TMDB headshot.
 * TMDB relative paths (`/abc.jpg`) and MAL `voiceactors` URLs are actor photos.
 * @param {unknown} path
 * @returns {boolean}
 */
export function isCharacterPortrait(path) {
  const value = normalizeEntityName(path)
  if (!value) return false
  const lower = value.toLowerCase()
  if (/questionmark/i.test(lower)) return false
  if (lower.includes('voiceactors') || lower.includes('voiceactor')) return false
  if (lower.includes('image.tmdb.org')) return false
  if (value.startsWith('/') && !/^https?:/i.test(value)) return false
  return true
}

/**
 * Character portrait URL, or empty when the stored path is an actor photo.
 * @param {unknown} path
 * @returns {string}
 */
export function characterPortraitPath(path) {
  return isCharacterPortrait(path) ? normalizeEntityName(path) : ''
}

/**
 * Mongo filter used to upsert a character without colliding on `malId: null`.
 * Sparse unique indexes still index null, so TMDB-only rows must omit malId.
 * @param {{ malId?: number, name?: string }} payload
 * @returns {object}
 */
export function characterUpsertFilter(payload) {
  const malId = Number(payload?.malId)
  if (Number.isFinite(malId) && malId > 0) {
    return { entityType: 'character', malId }
  }
  return {
    entityType: 'character',
    name: normalizeEntityName(payload?.name),
    $or: [{ malId: { $exists: false } }, { malId: null }],
  }
}

/**
 * Map one Jikan `/anime/{id}/characters` row onto an upsert payload.
 * @param {object} [row]
 * @param {string|import('mongoose').Types.ObjectId} contentId
 * @returns {{ malId: number, name: string, nativeName: string, alternativeNames: string[], imagePath: string, appearance: object } | null}
 */
export function mapJikanCharacterRow(row, contentId) {
  const character = row?.character && typeof row.character === 'object' ? row.character : null
  const name =
    cleanCharacterName(character?.name) || cleanCharacterName(character?.name_kanji)
  const malId = Number(character?.mal_id)
  if (!isUsableCharacterName(name) || !Number.isFinite(malId) || malId < 1) return null

  const voiceActors = (Array.isArray(row?.voice_actors) ? row.voice_actors : [])
    .map((entry) => {
      const person = entry?.person && typeof entry.person === 'object' ? entry.person : null
      const vaName = normalizeEntityName(person?.name)
      const vaMalId = Number(person?.mal_id)
      if (!vaName) return null
      return {
        name: vaName,
        language: normalizeEntityName(entry.language) || 'Japanese',
        malId: Number.isFinite(vaMalId) && vaMalId > 0 ? vaMalId : undefined,
        imagePath: entityImagePath(person?.images),
      }
    })
    .filter(Boolean)

  const role = normalizeEntityName(row?.role) || 'Supporting'
  const favorites = Number(row?.favorites ?? character?.favorites) || 0

  return {
    malId,
    name,
    nativeName: normalizeEntityName(character?.name_kanji),
    alternativeNames: uniqueEntityNames(character?.nicknames),
    imagePath: entityImagePath(character?.images),
    appearance: {
      content: contentId,
      role,
      importance: characterImportanceScore({ role, favorites }),
      voiceActors,
    },
  }
}

/**
 * Map TMDB credit rows onto character upsert payloads (no MAL id).
 * Uses the `character` field as the entity name and the actor as a voice credit.
 * @param {object[]} [credits]
 * @param {string|import('mongoose').Types.ObjectId} contentId
 * @returns {Array<{ name: string, tmdbId?: number, imagePath: string, appearance: object }>}
 */
export function mapTmdbCharacterCredits(credits, contentId) {
  const rows = Array.isArray(credits) ? credits : []
  const byName = new Map()

  for (const person of rows) {
    const characterName = cleanCharacterName(
      person?.character ||
        (Array.isArray(person?.roles) ? person.roles[0]?.character : ''),
    )
    const actorName = normalizeEntityName(person?.name)
    if (!isUsableCharacterName(characterName)) continue
    const key = foldEntityName(characterName)
    if (!key) continue

    const importance = characterImportanceScore({
      role: 'Supporting',
      order: person?.order,
      episodeCount: person?.total_episode_count,
    })
    const existing = byName.get(key)
    const voiceActor = actorName
      ? {
          name: actorName,
          language: 'Unknown',
          tmdbId: Number.isFinite(Number(person.id)) ? Number(person.id) : undefined,
          imagePath: normalizeEntityName(person.profile_path),
        }
      : null

    if (existing) {
      if (voiceActor) existing.appearance.voiceActors.push(voiceActor)
      if (importance > (existing.appearance.importance || 0)) {
        existing.appearance.importance = importance
      }
      continue
    }

    byName.set(key, {
      name: characterName,
      imagePath: '',
      appearance: {
        content: contentId,
        role: 'Supporting',
        importance,
        voiceActors: voiceActor ? [voiceActor] : [],
      },
    })
  }

  return [...byName.values()].sort(
    (left, right) => (right.appearance?.importance || 0) - (left.appearance?.importance || 0),
  )
}

/**
 * Find a persisted character that matches an episode-cast character name.
 * @param {string} characterName
 * @param {Array<{ _id?: unknown, name?: string, englishName?: string, nativeName?: string, alternativeNames?: string[] }>} characters
 * @returns {object | null}
 */
export function matchCharacterByName(characterName, characters) {
  const target = foldEntityName(cleanCharacterName(characterName) || characterName)
  if (!target || !Array.isArray(characters)) return null
  return (
    characters.find((entity) => {
      const names = uniqueEntityNames(
        entity?.name,
        entity?.englishName,
        entity?.nativeName,
        entity?.alternativeNames,
      )
      return names.some((name) => foldEntityName(name) === target)
    }) || null
  )
}

/**
 * JSON shape used by entity detail/search APIs.
 * @param {object} [doc]
 * @param {{ isFavorited?: boolean }} [options]
 * @returns {object | null}
 */
export function serializeEntity(doc, options = {}) {
  if (!doc) return null
  const raw = typeof doc.toObject === 'function' ? doc.toObject() : doc
  const appearances = Array.isArray(raw.appearances)
    ? [...raw.appearances].sort(
        (left, right) => appearanceRoleRank(left.role) - appearanceRoleRank(right.role),
      )
    : []
  return {
    _id: raw._id,
    entityType: raw.entityType,
    name: cleanCharacterName(raw.name) || raw.name,
    englishName: raw.englishName || '',
    nativeName: raw.nativeName || '',
    alternativeNames: raw.alternativeNames || [],
    about: raw.about || '',
    imagePath: characterPortraitPath(raw.imagePath),
    malId: raw.malId,
    tmdbId: raw.tmdbId,
    favoritesCount: raw.favoritesCount || 0,
    isFavorited: Boolean(options.isFavorited),
    appearances,
  }
}

/**
 * Catalog search card derived from an entity (no watchlist fields).
 * @param {object} entity
 * @returns {object}
 */
export function entityToSearchHit(entity) {
  const serialized = serializeEntity(entity)
  if (!serialized) return null
  return {
    _id: String(serialized._id),
    title: serialized.name,
    englishTitle: serialized.englishName || serialized.name,
    nativeTitle: serialized.nativeName || '',
    overview: serialized.about || '',
    posterPath: serialized.imagePath || '',
    contentType: serialized.entityType,
    entityType: serialized.entityType,
    genres: [],
    alternativeTitles: serialized.alternativeNames,
    appearances: serialized.appearances,
  }
}
