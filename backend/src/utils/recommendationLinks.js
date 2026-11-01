/**
 * recommendationLinks.js — Community recommendation links from AniList and TMDB.
 *
 * Utils layer: turn a source's "people who liked this also liked" list into
 * `content_recommendations` rows with a 0-1 weight, so AniList's vote counts and
 * TMDB's list order can be added up by services/recommendationService.js.
 */

/** Votes at which an AniList link counts fully on the absolute half of its weight. */
const ANILIST_FULL_VOTES = 100
/** TMDB has no votes, only order; its links count for less than a well-voted AniList one. */
const TMDB_TOP_WEIGHT = 0.75
const TMDB_LIST_SIZE = 20
const MIN_WEIGHT = 0.05

function positive(value) {
  const parsed = Number(value)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null
}

function roundWeight(value) {
  return Math.round(Math.max(MIN_WEIGHT, Math.min(1, value)) * 1000) / 1000
}

/**
 * Links from an AniList media's `recommendations.nodes`. Half the weight is the
 * link's votes against the title's best-voted link, half its votes on a log scale,
 * so a title with few votes overall doesn't count as much as a popular one.
 * Links with no net upvotes are dropped.
 * @param {object} [media]
 * @returns {{ targetType: 'anime', targetId: number, weight: number }[] | undefined}
 *   undefined when the media wasn't fetched with recommendations.
 */
export function anilistRecommendationLinks(media) {
  const nodes = media?.recommendations?.nodes
  if (!Array.isArray(nodes)) return undefined
  const voted = nodes
    .map((node) => ({
      targetId: positive(node?.mediaRecommendation?.id),
      votes: Number(node?.rating),
    }))
    .filter((link) => link.targetId && link.targetId !== positive(media.id) && link.votes > 0)
  const top = Math.max(0, ...voted.map((link) => link.votes))
  const seen = new Set()
  const links = []
  for (const link of voted) {
    if (seen.has(link.targetId)) continue
    seen.add(link.targetId)
    const relative = link.votes / top
    const absolute = Math.min(1, Math.log1p(link.votes) / Math.log1p(ANILIST_FULL_VOTES))
    links.push({
      targetType: 'anime',
      targetId: link.targetId,
      weight: roundWeight(0.5 * relative + 0.5 * absolute),
    })
  }
  return links
}

/**
 * Links from a TMDB movie or show requested with `append_to_response=recommendations`,
 * weighted by their place in TMDB's list.
 * @param {object} [details]
 * @param {'movie' | 'tv'} contentType
 * @returns {{ targetType: 'movie' | 'tv', targetId: number, weight: number }[] | undefined}
 *   undefined when the details weren't fetched with recommendations.
 */
export function tmdbRecommendationLinks(details, contentType) {
  const results = details?.recommendations?.results
  if (!Array.isArray(results)) return undefined
  const seen = new Set()
  const links = []
  for (const result of results) {
    const targetId = positive(result?.id)
    const targetType =
      result?.media_type === 'movie' || result?.media_type === 'tv'
        ? result.media_type
        : contentType
    const key = `${targetType}:${targetId}`
    if (!targetId || seen.has(key)) continue
    if (targetType === contentType && targetId === positive(details.id)) continue
    seen.add(key)
    links.push({
      targetType,
      targetId,
      weight: roundWeight(TMDB_TOP_WEIGHT * (1 - links.length / TMDB_LIST_SIZE)),
    })
  }
  return links
}
