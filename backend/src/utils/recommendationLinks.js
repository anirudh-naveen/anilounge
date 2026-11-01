/**
 * recommendationLinks.js — Community recommendation links from AniList and TMDB.
 *
 * Utils layer: turn a source's "people who liked this also liked" list into
 * `content_recommendations` rows with a 0-1 weight, so AniList's vote counts and
 * TMDB's list order can be added up by services/recommendationService.js, and rank
 * the titles linked from one title for its "Watchers who liked this also liked".
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

/** Catalog score's share of a similar title's score: breaks ties between equal links. */
const SIMILAR_QUALITY_WEIGHT = 0.05

/**
 * Rank titles linked from one title. Each source counts once per target (its
 * strongest link from any of the title's seasons), and the sources add up, so a
 * title both AniList and TMDB recommend outranks one only either does.
 * @param {{ targetId: string, source: string, weight: number,
 *   targetScore?: number | null }[]} links
 * @param {{ limit?: number }} [options]
 * @returns {{ id: string, score: number, sources: string[] }[]} Best first
 */
export function rankSimilarTitles(links, { limit = 12 } = {}) {
  const targets = new Map()
  for (const link of links || []) {
    const weight = Number(link.weight)
    if (!link.targetId || !(weight > 0)) continue
    let target = targets.get(link.targetId)
    if (!target) {
      const quality = Number(link.targetScore)
      target = {
        id: link.targetId,
        quality: Number.isFinite(quality) && quality > 0 ? quality / 10 : 0,
        bySource: new Map(),
      }
      targets.set(link.targetId, target)
    }
    target.bySource.set(link.source, Math.max(target.bySource.get(link.source) || 0, weight))
  }
  return [...targets.values()]
    .map((target) => ({
      id: target.id,
      score:
        Math.round(
          ([...target.bySource.values()].reduce((sum, weight) => sum + weight, 0) +
            target.quality * SIMILAR_QUALITY_WEIGHT) *
            1000,
        ) / 1000,
      sources: [...target.bySource.keys()].sort(),
    }))
    .sort((a, b) => b.score - a.score || (a.id < b.id ? -1 : 1))
    .slice(0, limit)
}
