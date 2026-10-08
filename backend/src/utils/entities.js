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
 * Dub language of a voice credit, or null when the source did not say
 * (TMDB credits arrive unlabeled or as "Unknown").
 * @param {unknown} value
 * @returns {string | null}
 */
export function knownVoiceLanguage(value) {
  const language = normalizeEntityName(value)
  return language && language.toLowerCase() !== 'unknown' ? language : null
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
 * Admin cast order first (when set), then Main / higher-importance, then name.
 * @param {object} left
 * @param {object} right
 * @param {unknown} contentId
 * @returns {number}
 */
export function compareCharactersForContent(left, right, contentId) {
  const leftApp = appearanceForContentId(left, contentId)
  const rightApp = appearanceForContentId(right, contentId)
  const leftPos = leftApp?.position ?? null
  const rightPos = rightApp?.position ?? null
  if (leftPos !== null || rightPos !== null) {
    if (leftPos === null) return 1
    if (rightPos === null) return -1
    if (leftPos !== rightPos) return leftPos - rightPos
  }
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
 * AniList serves `default.jpg` when a character or staff member has no picture.
 * @param {string} value
 * @returns {boolean}
 */
function isPlaceholderImage(value) {
  return /anilist.*\/default\.(jpe?g|png)$/i.test(value)
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
  if (/questionmark/i.test(lower) || isPlaceholderImage(lower)) return false
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
 * MAL people names are often `"Last, First"`.
 * @param {unknown} value
 * @returns {string}
 */
export function displayPersonName(value) {
  const name = normalizeEntityName(value)
  if (!name.includes(',')) return name
  const [last, first] = name.split(',').map((part) => part.trim())
  if (first && last) return `${first} ${last}`
  return name
}

/**
 * Character display name: strip credit suffixes, then Westernize `"Last, First"`.
 * @param {unknown} value
 * @returns {string}
 */
export function canonicalCharacterName(value) {
  return displayPersonName(cleanCharacterName(value))
}

/**
 * Folded key so `"Natsuki, Subaru"`, `"Subaru Natsuki"` and `"Natsuki Subaru"`
 * compare equal. Name parts are sorted because sources disagree on order
 * (AniList "Luffy D. Monkey", TMDB "Monkey D. Luffy").
 * @param {unknown} value
 * @returns {string}
 */
export function canonicalCharacterNameKey(value) {
  return foldEntityName(canonicalCharacterName(value)).split(' ').sort().join(' ')
}

/**
 * Whether two character names are the same person label, ignoring order and punctuation.
 * @param {unknown} left
 * @param {unknown} right
 * @returns {boolean}
 */
export function characterNamesEqual(left, right) {
  const a = canonicalCharacterNameKey(left)
  const b = canonicalCharacterNameKey(right)
  return Boolean(a) && a === b
}

/**
 * Folded name keys for a character row. Aliases are ignored so a polluted
 * voice-actor aka cannot chain two different people together.
 * @param {{ name?: string, englishName?: string } | null | undefined} entity
 * @returns {Set<string>}
 */
export function characterNameKeys(entity) {
  const keys = new Set()
  for (const name of [entity?.name, entity?.englishName]) {
    const key = canonicalCharacterNameKey(name)
    if (key) keys.add(key)
  }
  return keys
}

/**
 * Group character documents that share a canonical name (including swapped order).
 * @param {object[]} [entities]
 * @returns {object[][]}
 */
export function groupCharactersByCanonicalName(entities) {
  const list = (Array.isArray(entities) ? entities : []).filter((entity) => entity?._id || entity?.id)
  const parent = list.map((_, index) => index)
  const find = (index) => {
    while (parent[index] !== index) {
      parent[index] = parent[parent[index]]
      index = parent[index]
    }
    return index
  }
  const keyToIndex = new Map()
  list.forEach((entity, index) => {
    for (const key of characterNameKeys(entity)) {
      const existing = keyToIndex.get(key)
      if (existing == null) {
        keyToIndex.set(key, index)
        continue
      }
      const left = find(existing)
      const right = find(index)
      if (left !== right) parent[right] = left
    }
  })
  const groups = new Map()
  list.forEach((entity, index) => {
    const root = find(index)
    if (!groups.has(root)) groups.set(root, [])
    groups.get(root).push(entity)
  })
  return [...groups.values()]
}

/**
 * Keep the character with a portrait, MAL id, AniList id, and the most appearances.
 * @param {object[]} entities
 * @returns {object | undefined}
 */
export function pickPrimaryCharacter(entities) {
  const list = Array.isArray(entities) ? entities : []
  return [...list].sort((left, right) => {
    const leftImg = characterPortraitPath(left?.imagePath) ? 1 : 0
    const rightImg = characterPortraitPath(right?.imagePath) ? 1 : 0
    if (rightImg !== leftImg) return rightImg - leftImg
    const leftMal = Number(left?.malId) > 0 ? 1 : 0
    const rightMal = Number(right?.malId) > 0 ? 1 : 0
    if (rightMal !== leftMal) return rightMal - leftMal
    const leftAl = Number(left?.anilistId) > 0 ? 1 : 0
    const rightAl = Number(right?.anilistId) > 0 ? 1 : 0
    if (rightAl !== leftAl) return rightAl - leftAl
    const leftApps =
      Number(left?.appearanceCount) > 0
        ? Number(left.appearanceCount)
        : (left?.appearances || []).length
    const rightApps =
      Number(right?.appearanceCount) > 0
        ? Number(right.appearanceCount)
        : (right?.appearances || []).length
    if (rightApps !== leftApps) return rightApps - leftApps
    return String(left?._id || left?.id || '').localeCompare(String(right?._id || right?.id || ''))
  })[0]
}

/**
 * Voice-actor photo URL. MAL `voiceactors` paths and TMDB profiles are valid here.
 * @param {unknown} path
 * @returns {string}
 */
export function voiceActorImagePath(path) {
  const value = normalizeEntityName(path)
  if (!value || /questionmark/i.test(value) || isPlaceholderImage(value)) return ''
  return value
}

/**
 * Studio logo URL (Jikan producer image or TMDB `logo_path`).
 * @param {unknown} path
 * @returns {string}
 */
export function studioImagePath(path) {
  return voiceActorImagePath(path)
}

/**
 * Studio display name. Unlike people, `"Sunrise, Inc."` must not be reordered.
 * @param {unknown} value
 * @returns {string}
 */
export function displayStudioName(value) {
  return normalizeEntityName(value).replace(/\s+/g, ' ')
}

/**
 * Fold a studio name and drop corporate suffixes so `"Kyoto Animation Co., Ltd."`
 * matches `"Kyoto Animation"`.
 * @param {unknown} value
 * @returns {string}
 */
export function studioNameKey(value) {
  return foldEntityName(value)
    .replace(/\b(co|ltd|inc|llc|corp|corporation|company|limited|k k|kk|gmbh)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Whether two studio labels name the same company.
 * @param {unknown} left
 * @param {unknown} right
 * @returns {boolean}
 */
export function studioNamesEqual(left, right) {
  const a = studioNameKey(left)
  const b = studioNameKey(right)
  return Boolean(a) && a === b
}

/**
 * Map a Jikan `/producers` row onto studio fields.
 * @param {object} [row]
 * @returns {{ malId: number, name: string, nativeName: string, alternativeNames: string[], imagePath: string, about: string } | null}
 */
export function mapJikanProducer(row) {
  const malId = Number(row?.mal_id)
  if (!Number.isFinite(malId) || malId < 1) return null
  const titles = Array.isArray(row?.titles) ? row.titles : []
  const titleOf = (type) =>
    normalizeEntityName(titles.find((entry) => entry?.type === type)?.title)
  const name = displayStudioName(titleOf('Default') || titles[0]?.title || row?.name)
  if (!name) return null
  return {
    malId,
    name,
    nativeName: titleOf('Japanese'),
    alternativeNames: uniqueEntityNames(titles.map((entry) => entry?.title)).filter(
      (title) => title !== name,
    ),
    imagePath: studioImagePath(entityImagePath(row?.images)),
    about: normalizeEntityName(row?.about),
  }
}

/**
 * Jikan producer search hit whose titles match the studio name.
 * @param {object[]} [rows]
 * @param {string} name
 * @returns {object | null}
 */
export function pickJikanProducer(rows, name) {
  const list = Array.isArray(rows) ? rows : []
  return (
    list.find((row) =>
      (Array.isArray(row?.titles) ? row.titles : []).some((entry) =>
        studioNamesEqual(entry?.title, name),
      ),
    ) || null
  )
}

/**
 * TMDB `/search/company` hit that names the same studio, preferring one with a logo.
 * @param {object[]} [results]
 * @param {string} name
 * @returns {object | null}
 */
export function pickTmdbCompany(results, name) {
  const matches = (Array.isArray(results) ? results : []).filter((row) =>
    studioNamesEqual(row?.name, name),
  )
  return matches.find((row) => row?.logo_path) || matches[0] || null
}

/**
 * Mongo filter used to upsert a character or voice actor without colliding on `malId: null`.
 * @param {string} entityType
 * @param {{ malId?: number, name?: string }} payload
 * @returns {object}
 */
export function entityUpsertFilter(entityType, payload) {
  const malId = Number(payload?.malId)
  if (Number.isFinite(malId) && malId > 0) {
    return { entityType, malId }
  }
  return {
    entityType,
    name: normalizeEntityName(payload?.name),
    $or: [{ malId: { $exists: false } }, { malId: null }],
  }
}

/**
 * Mongo filter used to upsert a character without colliding on `malId: null`.
 * Sparse unique indexes still index null, so TMDB-only rows must omit malId.
 * @param {{ malId?: number, name?: string }} payload
 * @returns {object}
 */
export function characterUpsertFilter(payload) {
  return entityUpsertFilter('character', payload)
}

/**
 * Map one Jikan `/anime/{id}/characters` row onto an upsert payload.
 * @param {object} [row]
 * @param {string} contentId
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
    .sort((left, right) => Number(/japanese/i.test(right.language)) - Number(/japanese/i.test(left.language)))
    .slice(0, 3)

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
 * @param {string} contentId
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
 * Map one character voice credit onto a voice-actor upsert payload.
 * @param {object} [credit]
 * @param {{ contentId: unknown, characterName?: string, role?: string }} meta
 * @returns {object | null}
 */
export function mapVoiceActorFromCredit(
  credit,
  { contentId, characterName, role, characterId } = {},
) {
  const original = normalizeEntityName(credit?.name)
  if (!original) return null
  const name = displayPersonName(original)
  const malId = Number(credit?.malId)
  const tmdbId = Number(credit?.tmdbId)
  const anilistId = Number(credit?.anilistId)
  const appearance = {
    characterName: cleanCharacterName(characterName) || characterName || '',
    role: normalizeEntityName(role) || 'Voice',
    language: normalizeEntityName(credit?.language),
    importance: characterImportanceScore({ role }),
  }
  if (contentId) appearance.content = contentId
  if (characterId) appearance.character = characterId
  return {
    name,
    alternativeNames: uniqueEntityNames(original, name),
    imagePath: voiceActorImagePath(credit?.imagePath),
    nativeName: normalizeEntityName(credit?.nativeName),
    malId: Number.isFinite(malId) && malId > 0 ? malId : undefined,
    tmdbId: Number.isFinite(tmdbId) && tmdbId > 0 ? tmdbId : undefined,
    anilistId: Number.isFinite(anilistId) && anilistId > 0 ? anilistId : undefined,
    appearance,
  }
}

/**
 * Map one Jikan `/people/{id}/voices` row onto a voiced-character payload.
 * @param {object} [row]
 * @returns {{ malId: number, name: string, imagePath: string, role: string, animeMalId?: number } | null}
 */
export function mapJikanPersonVoiceRow(row) {
  const character = row?.character && typeof row.character === 'object' ? row.character : null
  const name = cleanCharacterName(character?.name)
  const malId = Number(character?.mal_id)
  if (!isUsableCharacterName(name) || !Number.isFinite(malId) || malId < 1) return null
  const animeMalId = Number(row?.anime?.mal_id)
  return {
    malId,
    name,
    imagePath: entityImagePath(character?.images),
    role: normalizeEntityName(row?.role) || 'Supporting',
    animeMalId: Number.isFinite(animeMalId) && animeMalId > 0 ? animeMalId : undefined,
  }
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
    name: serializedEntityName(raw),
    englishName: raw.englishName || '',
    nativeName: raw.nativeName || '',
    alternativeNames: raw.alternativeNames || [],
    about: raw.about || '',
    imagePath: serializedEntityImage(raw),
    malId: raw.malId,
    tmdbId: raw.tmdbId,
    favoritesCount: raw.favoritesCount || 0,
    isFavorited: Boolean(options.isFavorited),
    appearances: appearances.map((row) => {
      const character = serializeNestedCharacter(row.character)
      if (!character) return row
      return { ...row, character }
    }),
  }
}

function serializedEntityName(raw) {
  if (raw.entityType === 'voice_actor') return displayPersonName(raw.name)
  if (raw.entityType === 'studio') return displayStudioName(raw.name)
  // An English name set on the row ("Monkey D. Luffy") beats the source's order.
  return canonicalCharacterName(raw.englishName) || canonicalCharacterName(raw.name) || raw.name
}

function serializedEntityImage(raw) {
  if (raw.entityType === 'character') return characterPortraitPath(raw.imagePath)
  if (raw.entityType === 'studio') return studioImagePath(raw.imagePath)
  return voiceActorImagePath(raw.imagePath)
}

/**
 * Slim populated character on a voice-actor appearance.
 * @param {unknown} value
 * @returns {object|undefined}
 */
function serializeNestedCharacter(value) {
  if (!value || typeof value !== 'object') return undefined
  const raw = typeof value.toObject === 'function' ? value.toObject() : value
  if (!raw._id && !raw.name) return undefined
  return {
    _id: raw._id,
    entityType: 'character',
    name: canonicalCharacterName(raw.name) || raw.name || '',
    imagePath: characterPortraitPath(raw.imagePath),
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
    // Studios can credit hundreds of titles; search cards never read them.
    appearances: serialized.entityType === 'studio' ? [] : serialized.appearances,
  }
}
