/**
 * Watchable fields an admin can edit from the admin page, and how they map onto
 * Content documents.
 *
 * Layer: utils. Edits are validated here, stored in `content.admin_overrides` as
 * `{ field: value }`, and re-applied by `Content.save` (see `applyAdminOverrides`)
 * so the catalog sync cannot overwrite them.
 */

import { airingFromMalStatus, malStatusFromAiring } from '../db/kinds.js'

const ALL_KINDS = ['movie', 'series', 'special']

/**
 * @typedef {{ type: 'text' | 'image' | 'date' | 'int' | 'enum', max?: number, required?: boolean,
 *   values?: string[], kinds?: string[] }} FieldSpec
 */

/** @type {Record<string, FieldSpec>} */
export const CONTENT_FIELDS = {
  title: { type: 'text', max: 300, required: true },
  nativeTitle: { type: 'text', max: 300 },
  overview: { type: 'text', max: 5000 },
  tagline: { type: 'text', max: 300 },
  posterPath: { type: 'image', max: 1000 },
  backdropPath: { type: 'image', max: 1000 },
  releaseDate: { type: 'date' },
  airingStatus: { type: 'enum', values: ['upcoming', 'airing', 'finished'] },
  runtime: { type: 'int', max: 10000, kinds: ['movie', 'special'] },
  episodeCount: { type: 'int', max: 100000, kinds: ['series'] },
  seasonCount: { type: 'int', max: 1000, kinds: ['series'] },
}

/**
 * Field names that apply to a content kind.
 * @param {string} kind - movie | series | special
 * @returns {string[]}
 */
export function fieldsForKind(kind) {
  return Object.entries(CONTENT_FIELDS)
    .filter(([, spec]) => (spec.kinds || ALL_KINDS).includes(kind))
    .map(([field]) => field)
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
 * Current editable values of a Content document, in admin field names.
 * @param {object} doc - Content document.
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
  }
  return Object.fromEntries(fieldsForKind(kind).map((field) => [field, all[field]]))
}

/**
 * Copy stored overrides onto a Content document before it is saved.
 * Fields that do not apply to the kind (e.g. runtime on a series) are ignored.
 * @param {object} doc - Content document (mutated).
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
  return doc
}

export default {
  CONTENT_FIELDS,
  fieldsForKind,
  parseContentEdits,
  readEditableFields,
  applyAdminOverrides,
}
