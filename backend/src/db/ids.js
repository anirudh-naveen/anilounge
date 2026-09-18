/**
 * Catalog id helpers. API ids may be Postgres UUIDs or legacy Mongo ObjectId hex.
 */

export const MONGO_ID_RE = /^[0-9a-fA-F]{24}$/
export const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

/**
 * @param {unknown} value
 * @returns {string}
 */
export function asId(value) {
  if (value == null) return ''
  if (typeof value === 'object' && value._id) return String(value._id)
  return String(value)
}

/**
 * @param {unknown} value
 * @returns {boolean}
 */
export function isMongoId(value) {
  return MONGO_ID_RE.test(String(value || ''))
}

/**
 * @param {unknown} value
 * @returns {boolean}
 */
export function isUuid(value) {
  return UUID_RE.test(String(value || ''))
}

/**
 * @param {unknown} value
 * @returns {boolean}
 */
export function isCatalogId(value) {
  const text = String(value || '')
  return isUuid(text) || isMongoId(text)
}

/**
 * SQL predicate matching a UUID primary key or mongo_id.
 * @param {string} alias
 * @param {string} param
 * @returns {string}
 */
export function idEqualsSql(alias, param) {
  return `(${alias}.id::text = ${param} OR ${alias}.mongo_id = ${param})`
}
