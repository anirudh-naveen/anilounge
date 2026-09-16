/**
 * Episode payload mappers for TMDB season/credits and MAL episode lists.
 * Utils layer: normalizes title, description, still, and cast for the TV details row.
 */

const DEFAULT_CAST_LIMIT = 8

/**
 * Trim a string; non-strings become empty.
 * @param {unknown} value
 * @returns {string}
 */
const asText = (value) => (typeof value === 'string' ? value.trim() : '')

/**
 * Map a TMDB cast/guest-star/aggregate-credit person onto the episode cast shape.
 * @param {object} [person]
 * @returns {{ name: string, character: string, profilePath: string } | null}
 */
export function mapTmdbCastMember(person) {
  if (!person || typeof person !== 'object') return null
  const name = asText(person.name)
  if (!name) return null
  const roleCharacter = Array.isArray(person.roles) ? person.roles[0]?.character : ''
  return {
    name,
    character: asText(person.character) || asText(roleCharacter),
    profilePath: asText(person.profile_path),
  }
}

/**
 * Series-regular voice/acting credits, ranked by how many episodes they appear in.
 * @param {object} [credits] - TMDB `credits` or `aggregate_credits` payload.
 * @param {number} [limit=8]
 * @returns {{ name: string, character: string, profilePath: string }[]}
 */
export function mapSeriesCast(credits, limit = DEFAULT_CAST_LIMIT) {
  const cast = Array.isArray(credits?.cast) ? [...credits.cast] : []
  cast.sort((left, right) => (right.total_episode_count || 0) - (left.total_episode_count || 0))
  return cast.map(mapTmdbCastMember).filter(Boolean).slice(0, limit)
}

/**
 * Map one TMDB season episode. Guest stars win when present; otherwise series regulars.
 * @param {object} episode
 * @param {{ name: string, character: string, profilePath: string }[]} [seriesCast=[]]
 * @returns {object | null}
 */
export function mapTmdbEpisode(episode, seriesCast = []) {
  if (!episode || typeof episode !== 'object') return null
  const episodeNumber = Number(episode.episode_number)
  if (!Number.isFinite(episodeNumber) || episodeNumber < 1) return null

  const seasonNumber = Number(episode.season_number)
  const guestCast = (Array.isArray(episode.guest_stars) ? episode.guest_stars : [])
    .map(mapTmdbCastMember)
    .filter(Boolean)
    .slice(0, DEFAULT_CAST_LIMIT)

  return {
    seasonNumber: Number.isFinite(seasonNumber) && seasonNumber > 0 ? seasonNumber : 1,
    episodeNumber,
    title: asText(episode.name) || `Episode ${episodeNumber}`,
    overview: asText(episode.overview),
    stillPath: asText(episode.still_path),
    airDate: asText(episode.air_date) || null,
    runtime: Number.isFinite(Number(episode.runtime)) ? Number(episode.runtime) : null,
    cast: guestCast.length ? guestCast : seriesCast.slice(0, DEFAULT_CAST_LIMIT),
  }
}

/**
 * Map one MAL episode row. MAL has titles (and rarely synopsis) but not stills or cast.
 * @param {object} episode
 * @param {number} index - Zero-based fallback when MAL omits a numeric episode id.
 * @returns {object | null}
 */
export function mapMalEpisode(episode, index) {
  const node = episode?.node && typeof episode.node === 'object' ? episode.node : episode
  if (!node || typeof node !== 'object') return null

  const episodeNumber = Number(node.episode_number || node.id || index + 1)
  if (!Number.isFinite(episodeNumber) || episodeNumber < 1) return null

  return {
    seasonNumber: 1,
    episodeNumber,
    title: asText(node.title) || asText(node.title_romanji) || `Episode ${episodeNumber}`,
    overview: asText(node.synopsis),
    stillPath: '',
    airDate: asText(node.aired) || null,
    runtime: null,
    cast: [],
  }
}

/**
 * Season numbers from a TMDB TV document, skipping season 0 (specials/extras).
 * @param {object} [tvDetails]
 * @param {number} [fallbackSeasonCount]
 * @returns {number[]}
 */
export function tmdbSeasonNumbers(tvDetails, fallbackSeasonCount) {
  const listed = Array.isArray(tvDetails?.seasons)
    ? tvDetails.seasons
        .map((season) => Number(season?.season_number))
        .filter((number) => Number.isFinite(number) && number > 0)
    : []

  if (listed.length) return [...new Set(listed)].sort((left, right) => left - right)

  const count = Number(fallbackSeasonCount)
  if (!Number.isFinite(count) || count < 1) return [1]
  return Array.from({ length: Math.floor(count) }, (_, index) => index + 1)
}
