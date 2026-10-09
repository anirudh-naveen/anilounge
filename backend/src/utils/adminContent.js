/**
 * Catalog fields an admin can edit from the admin page, per content kind, and how
 * they map onto Content (movie/series/special) and Entity (character/voice/studio)
 * documents.
 *
 * Layer: utils. Edits are validated here, stored in `content.admin_overrides` as
 * `{ field: value }`, and re-applied by `Content.save` / `Entity.save` (see
 * `applyAdminOverrides`) so the catalog sync cannot overwrite them. The reserved
 * `_aliases` key holds names a row had before an admin renamed it, kept as
 * alternative names so the sync still matches the row by its old name. `nicknames`
 * ("KonoSuba", "MHA") are names fans use that no source lists; they are searchable
 * like alternative names and never come from the sync.
 */

import { airingFromMalStatus, malStatusFromAiring } from '../db/kinds.js'

export const WATCHABLE_KINDS = ['movie', 'series', 'special']
export const ENTITY_KINDS = ['character', 'voice', 'studio']
/** Franchises are only named and nicknamed by hand; the sync never edits them. */
export const EDITABLE_KINDS = [...WATCHABLE_KINDS, ...ENTITY_KINDS, 'franchise']
export const ALIASES_KEY = '_aliases'
export const MAX_NICKNAMES = 20

/**
 * @typedef {{ type: 'text' | 'image' | 'date' | 'int' | 'enum' | 'list', kinds: string[], max?: number,
 *   required?: boolean, values?: string[] }} FieldSpec
 */

/** @type {Record<string, FieldSpec>} */
export const CONTENT_FIELDS = {
  title: { type: 'text', max: 300, required: true, kinds: WATCHABLE_KINDS },
  nativeTitle: { type: 'text', max: 300, kinds: WATCHABLE_KINDS },
  overview: { type: 'text', max: 5000, kinds: WATCHABLE_KINDS },
  tagline: { type: 'text', max: 300, kinds: WATCHABLE_KINDS },
  posterPath: { type: 'image', max: 1000, kinds: WATCHABLE_KINDS },
  backdropPath: { type: 'image', max: 1000, kinds: WATCHABLE_KINDS },
  releaseDate: { type: 'date', kinds: WATCHABLE_KINDS },
  airingStatus: { type: 'enum', values: ['upcoming', 'airing', 'finished'], kinds: WATCHABLE_KINDS },
  runtime: { type: 'int', max: 10000, kinds: ['movie', 'special'] },
  episodeCount: { type: 'int', max: 100000, kinds: ['series'] },
  seasonCount: { type: 'int', max: 1000, kinds: ['series'] },
  name: { type: 'text', max: 300, required: true, kinds: [...ENTITY_KINDS, 'franchise'] },
  englishName: { type: 'text', max: 300, kinds: ['character', 'voice'] },
  nativeName: { type: 'text', max: 300, kinds: ENTITY_KINDS },
  about: { type: 'text', max: 10000, kinds: ENTITY_KINDS },
  imagePath: { type: 'image', max: 1000, kinds: ENTITY_KINDS },
  // `max` is per nickname.
  nicknames: { type: 'list', max: 100, kinds: [...WATCHABLE_KINDS, 'franchise'] },
}

/**
 * Field names that apply to a content kind, in display order.
 * @param {string} kind
 * @returns {string[]}
 */
export function fieldsForKind(kind) {
  return Object.entries(CONTENT_FIELDS)
    .filter(([, spec]) => spec.kinds.includes(kind))
    .map(([field]) => field)
}

/**
 * The field holding a row's display name for its kind.
 * @param {string} kind
 * @returns {'title' | 'name'}
 */
export function nameField(kind) {
  return WATCHABLE_KINDS.includes(kind) ? 'title' : 'name'
}

/**
 * `YYYY-MM-DD` for a pg DATE (parsed as local midnight) or an ISO string.
 * @param {unknown} value
 * @returns {string | null}
 */
function toDateString(value) {
  if (!value) return null
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    const pad = (n) => String(n).padStart(2, '0')
    return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}`
  }
  const match = /^(\d{4}-\d{2}-\d{2})/.exec(String(value))
  return match ? match[1] : null
}

/**
 * Validate one field value. Empty strings clear optional fields.
 * @param {string} field
 * @param {unknown} raw
 * @returns {{ value: unknown } | { error: string }}
 */
function parseField(field, raw) {
  const spec = CONTENT_FIELDS[field]
  if (spec.type === 'list') return parseList(field, raw, spec)
  const empty = raw === null || raw === undefined || (typeof raw === 'string' && !raw.trim())
  if (empty) return spec.required ? { error: `${field} is required` } : { value: null }

  switch (spec.type) {
    case 'text':
    case 'image': {
      if (typeof raw !== 'string') return { error: `${field} must be text` }
      const value = raw.trim()
      if (value.length > spec.max) return { error: `${field} must be ${spec.max} characters or fewer` }
      if (spec.type === 'image' && !/^(\/|https?:\/\/)/i.test(value)) {
        return { error: `${field} must be a URL or a TMDB path starting with /` }
      }
      return { value }
    }
    case 'date': {
      const value = typeof raw === 'string' ? raw.trim() : ''
      const parsed = new Date(`${value}T00:00:00Z`)
      if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(parsed.getTime())) {
        return { error: `${field} must be a date (YYYY-MM-DD)` }
      }
      return { value }
    }
    case 'int': {
      const value = Number(raw)
      if (!Number.isInteger(value) || value < 0 || value > spec.max) {
        return { error: `${field} must be a whole number from 0 to ${spec.max}` }
      }
      return { value }
    }
    case 'enum':
      return spec.values.includes(raw)
        ? { value: raw }
        : { error: `${field} must be one of ${spec.values.join(', ')}` }
    default:
      return { error: `${field} cannot be edited` }
  }
}

/**
 * A list field from an array or comma/newline-separated text: trimmed, empty entries
 * dropped, duplicates (ignoring case) removed. Empty input clears the list.
 * @param {string} field
 * @param {unknown} raw
 * @param {FieldSpec} spec
 * @returns {{ value: string[] } | { error: string }}
 */
function parseList(field, raw, spec) {
  if (raw === null || raw === undefined) return { value: [] }
  const items = Array.isArray(raw) ? raw : typeof raw === 'string' ? raw.split(/[,\n]/) : null
  if (!items || items.some((item) => typeof item !== 'string')) {
    return { error: `${field} must be a list of names` }
  }
  const seen = new Set()
  const value = []
  for (const item of items) {
    const name = item.trim()
    if (!name || seen.has(name.toLowerCase())) continue
    if (name.length > spec.max) return { error: `each of ${field} must be ${spec.max} characters or fewer` }
    seen.add(name.toLowerCase())
    value.push(name)
  }
  if (value.length > MAX_NICKNAMES) return { error: `${field} can hold at most ${MAX_NICKNAMES} names` }
  return { value }
}

/**
 * Validate an admin edit for a content kind.
 * @param {Record<string, unknown>} changes - `{ field: value }` from the request body.
 * @param {string} kind
 * @returns {{ values: Record<string, unknown>, errors: string[] }}
 */
export function parseContentEdits(changes, kind) {
  const allowed = new Set(fieldsForKind(kind))
  const values = {}
  const errors = []
  if (!changes || typeof changes !== 'object' || Array.isArray(changes)) {
    return { values, errors: ['changes must be an object'] }
  }
  for (const [field, raw] of Object.entries(changes)) {
    if (!allowed.has(field)) {
      errors.push(`${field} cannot be edited on a ${kind}`)
      continue
    }
    const result = parseField(field, raw)
    if ('error' in result) errors.push(result.error)
    else values[field] = result.value
  }
  return { values, errors }
}

/**
 * Current editable values of a Content or Entity document, in admin field names.
 * @param {object} doc
 * @param {string} kind
 * @returns {Record<string, unknown>}
 */
export function readEditableFields(doc, kind) {
  const all = {
    title: doc.englishTitle || doc.title || '',
    nativeTitle: doc.nativeTitle || null,
    overview: doc.overview || null,
    tagline: doc.tagline || null,
    posterPath: doc.posterPath || null,
    backdropPath: doc.backdropPath || null,
    releaseDate: toDateString(doc.releaseDate),
    airingStatus: airingFromMalStatus(doc.malStatus),
    runtime: doc.runtime ?? null,
    episodeCount: doc.episodeCount ?? null,
    seasonCount: doc.seasonCount ?? null,
    name: doc.name || '',
    englishName: doc.englishName || null,
    nativeName: doc.nativeName || null,
    about: doc.about || null,
    imagePath: doc.imagePath || null,
    nicknames: doc.nicknames || [],
  }
  return Object.fromEntries(fieldsForKind(kind).map((field) => [field, all[field]]))
}

/**
 * Copy stored overrides onto a document before it is saved. Fields that do not
 * apply to the kind are ignored; `_aliases` and `nicknames` are merged into the
 * alternative names so search finds them.
 * @param {object} doc - Content or Entity document (mutated).
 * @param {Record<string, unknown>} overrides
 * @param {string} kind
 * @returns {object} The same document.
 */
export function applyAdminOverrides(doc, overrides, kind) {
  if (!overrides || typeof overrides !== 'object') return doc
  for (const field of fieldsForKind(kind)) {
    if (!Object.prototype.hasOwnProperty.call(overrides, field)) continue
    const value = overrides[field]
    if (field === 'title') {
      doc.title = value
      doc.englishTitle = value
    } else if (field === 'airingStatus') {
      doc.malStatus = malStatusFromAiring(value)
    } else if (field === 'episodeCount') {
      doc.episodeCount = value
      doc.malEpisodes = value
    } else {
      doc[field] = value
    }
  }
  const aliases = adminAkas(overrides)
  if (aliases.length) {
    const key = WATCHABLE_KINDS.includes(kind) ? 'alternativeTitles' : 'alternativeNames'
    doc[key] = [...new Set([...(doc[key] || []), ...aliases])]
  }
  return doc
}

/**
 * Names an admin attached to a row that belong in `content_akas`: old names
 * (`_aliases`) and nicknames.
 * @param {Record<string, unknown> | null | undefined} overrides
 * @returns {string[]}
 */
export function adminAkas(overrides) {
  const list = (value) => (Array.isArray(value) ? value : [])
  return [...new Set([...list(overrides?.[ALIASES_KEY]), ...list(overrides?.nicknames)])]
}

/**
 * Whether a field holds a list (nicknames). Lists are not locked against the sync,
 * which never supplies them.
 * @param {string} field
 * @returns {boolean}
 */
export function isListField(field) {
  return CONTENT_FIELDS[field]?.type === 'list'
}

/**
 * Overrides after an edit: unlocked fields removed, new values added, and the old
 * name remembered as an alias when the name changed.
 * @param {Record<string, unknown>} current - Stored overrides.
 * @param {{ values: Record<string, unknown>, unlock: string[], kind: string, oldName?: string }} edit
 * @returns {Record<string, unknown>}
 */
export function mergeOverrides(current, { values, unlock, kind, oldName }) {
  const next = { ...(current || {}) }
  for (const field of unlock) delete next[field]
  Object.assign(next, values)
  for (const [field, value] of Object.entries(values)) {
    if (isListField(field) && !value.length) delete next[field]
  }
  const newName = values[nameField(kind)]
  if (newName && oldName && newName !== oldName) {
    const aliases = Array.isArray(next[ALIASES_KEY]) ? next[ALIASES_KEY] : []
    next[ALIASES_KEY] = [...new Set([...aliases, oldName])].filter((alias) => alias !== newName)
  }
  return next
}
