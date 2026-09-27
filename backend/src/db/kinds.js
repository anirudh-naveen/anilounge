/**
 * Map API catalog fields onto content.kind / airing_status.
 */
export const WATCHABLE_KINDS = ['movie', 'series', 'special']
export const PERSON_KINDS = ['character', 'voice', 'studio']

/**
 * @param {unknown} contentType
 * @returns {'movie' | 'series' | 'special'}
 */
export function kindFromContentType(contentType) {
  if (contentType === 'movie') return 'movie'
  if (contentType === 'special') return 'special'
  return 'series'
}

/**
 * @param {unknown} kind
 * @returns {'movie' | 'tv' | 'special'}
 */
export function contentTypeFromKind(kind) {
  if (kind === 'movie') return 'movie'
  if (kind === 'special') return 'special'
  return 'tv'
}

/**
 * @param {unknown} malStatus
 * @returns {'upcoming' | 'airing' | 'finished' | null}
 */
export function airingFromMalStatus(malStatus) {
  if (malStatus === 'currently_airing' || malStatus === 'airing') return 'airing'
  if (malStatus === 'not_yet_aired' || malStatus === 'upcoming') return 'upcoming'
  if (malStatus === 'finished_airing' || malStatus === 'finished') return 'finished'
  return null
}

/**
 * @param {unknown} airing
 * @returns {'currently_airing' | 'not_yet_aired' | 'finished_airing' | null}
 */
export function malStatusFromAiring(airing) {
  if (airing === 'airing') return 'currently_airing'
  if (airing === 'upcoming') return 'not_yet_aired'
  if (airing === 'finished') return 'finished_airing'
  return null
}

/**
 * @param {unknown} entityType
 * @returns {'character' | 'voice' | 'studio'}
 */
export function kindFromEntityType(entityType) {
  if (entityType === 'voice_actor' || entityType === 'voice') return 'voice'
  if (entityType === 'studio') return 'studio'
  return 'character'
}

/**
 * @param {unknown} kind
 * @returns {'character' | 'voice_actor' | 'studio'}
 */
export function entityTypeFromKind(kind) {
  if (kind === 'voice') return 'voice_actor'
  if (kind === 'studio') return 'studio'
  return 'character'
}

/**
 * @param {unknown} value
 * @returns {string}
 */
export function mapContentTypeFilterValue(value) {
  if (value === 'tv' || value === 'series') return 'series'
  if (value === 'movie') return 'movie'
  if (value === 'special') return 'special'
  return String(value)
}

/**
 * @param {unknown} value
 * @returns {string}
 */
export function mapMalStatusFilterValue(value) {
  if (value === 'currently_airing') return 'airing'
  if (value === 'not_yet_aired') return 'upcoming'
  if (value === 'finished_airing') return 'finished'
  return String(value)
}

/**
 * @param {unknown} role
 * @returns {'main' | 'supporting' | 'cameo'}
 */
export function appearanceRole(role) {
  const key = String(role || '').toLowerCase()
  if (key === 'main') return 'main'
  if (key === 'cameo') return 'cameo'
  return 'supporting'
}

/**
 * @param {unknown} role
 * @returns {'Main' | 'Supporting' | 'Cameo'}
 */
export function appearanceRoleToApi(role) {
  const key = appearanceRole(role)
  if (key === 'main') return 'Main'
  if (key === 'cameo') return 'Cameo'
  return 'Supporting'
}
