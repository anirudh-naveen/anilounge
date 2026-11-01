/**
 * recommendationService.js — Picks from the community recommendation links
 * (`content_recommendations`): "Recommended for you" from the titles a user rated
 * highest, and "Watchers who liked this also liked" for one title.
 *
 * Domain service behind GET /recommendations and GET /content/:id/similar. Seasons count as their series on both
 * ends: a rated season seeds with its whole show's links, and a recommended season is
 * picked as its series. Titles the user has rated or listed, anything else in their
 * series or franchise, are never picked. Ranking: utils/personalRecommendations.js.
 *
 * Picks are cached per user for a few minutes, keyed on a fingerprint of their ratings
 * and watchlist, so any change to either (in the app, an import, or a list sync) is
 * seen on the next request without clearing the cache from each write path.
 */
import { query } from '../../config/postgres.js'
import { loadWorksById } from '../models/Content.js'
import {
  MIN_RATED,
  becauseText,
  rankRecommendations,
  seedThreshold,
} from '../utils/personalRecommendations.js'
import { FingerprintCache } from '../utils/fingerprintCache.js'
import { rankSimilarTitles } from '../utils/recommendationLinks.js'

/** Catalog kind picked for each Search tab. */
const TARGET_KINDS = { movie: 'movie', tv: 'series' }

/** New links from catalog refreshes show up within this long. */
const CACHE_TTL_MS = 10 * 60 * 1000
const cache = new FingerprintCache({ ttlMs: CACHE_TTL_MS, maxEntries: 2000 })
/** A title's similar titles change only when the catalog refreshes its links. */
const similarCache = new FingerprintCache({ ttlMs: 60 * 60 * 1000, maxEntries: 5000 })

/**
 * The user's ratings, and a fingerprint of them and their watchlist that changes when
 * a title is rated, re-rated, listed, or removed. One indexed read of each table.
 * @param {string} userId
 * @returns {Promise<{ scores: number[], fingerprint: string }>}
 */
async function loadRatingState(userId) {
  const { rows } = await query(
    `SELECT
       (SELECT coalesce(array_agg(score::float), '{}') FROM ratings WHERE user_id = $1) AS scores,
       (SELECT concat_ws(':', count(*), sum(hashtext(content_id::text || ':' || score::text)))
        FROM ratings WHERE user_id = $1) AS rated,
       (SELECT concat_ws(':', count(*), sum(hashtext(content_id::text)))
        FROM watchlist WHERE user_id = $1) AS listed`,
    [userId],
  )
  const row = rows[0] || {}
  return { scores: (row.scores || []).map(Number), fingerprint: `${row.rated}|${row.listed}` }
}

/**
 * Seed → target links for a user, one row per seed show and target show, with the
 * strongest link between them. Seeds are rated at least `threshold`.
 * @param {string} userId
 * @param {number} threshold
 * @param {'movie' | 'series'} kind
 * @returns {Promise<{ seedId: string, seedRating: number, targetId: string, weight: number,
 *   targetScore: number | null }[]>}
 */
async function loadLinks(userId, threshold, kind) {
  const { rows } = await query(
    `WITH rated AS (
       SELECT r.content_id, r.score::float AS score, COALESCE(sn.series_id, r.content_id) AS show_id
       FROM ratings r LEFT JOIN seasons sn ON sn.content_id = r.content_id
       WHERE r.user_id = $1
     ),
     -- One seed per show (a series, movie, or special): its best rating.
     seeds AS (
       SELECT show_id, max(score) AS score FROM rated WHERE score >= $2 GROUP BY show_id
     ),
     seed_members AS (
       SELECT show_id, show_id AS member_id FROM seeds
       UNION
       SELECT s.show_id, sn.content_id FROM seeds s JOIN seasons sn ON sn.series_id = s.show_id
     ),
     targets AS (
       SELECT sm.show_id, t.id AS target_id, cr.weight
       FROM seed_members sm
       JOIN content_recommendations cr ON cr.content_id = sm.member_id AND cr.source = 'anilist'
       JOIN content t ON t.anilist_id = cr.target_id AND t.kind IN ('season', 'movie', 'special')
       UNION ALL
       SELECT sm.show_id, t.id, cr.weight
       FROM seed_members sm
       JOIN content_recommendations cr ON cr.content_id = sm.member_id AND cr.source = 'tmdb'
       JOIN content t ON t.tmdb_id = cr.target_id
         AND t.kind = CASE cr.target_type WHEN 'movie' THEN 'movie' ELSE 'series' END
     ),
     links AS (
       SELECT t.show_id, COALESCE(sn.series_id, t.target_id) AS target_show, max(t.weight) AS weight
       FROM targets t LEFT JOIN seasons sn ON sn.content_id = t.target_id
       GROUP BY 1, 2
     ),
     -- Shows the user has rated or listed, and the franchises they belong to.
     touched AS (
       SELECT DISTINCT COALESCE(sn.series_id, x.content_id) AS show_id
       FROM (
         SELECT content_id FROM watchlist WHERE user_id = $1
         UNION SELECT content_id FROM ratings WHERE user_id = $1
       ) x
       LEFT JOIN seasons sn ON sn.content_id = x.content_id
     ),
     touched_members AS (
       SELECT show_id AS member_id FROM touched
       UNION SELECT sn.content_id FROM touched t JOIN seasons sn ON sn.series_id = t.show_id
     ),
     touched_franchises AS (
       SELECT DISTINCT fm.franchise_id
       FROM franchise_members fm JOIN touched_members tm ON tm.member_id = fm.member_id
     )
     SELECT s.show_id::text AS seed_id, s.score AS seed_rating, l.target_show::text AS target_id,
            l.weight, COALESCE(mv.unified_score, ser.unified_score) AS target_score
     FROM links l
     JOIN seeds s ON s.show_id = l.show_id
     JOIN content tc ON tc.id = l.target_show AND tc.kind = $3
     LEFT JOIN movies mv ON mv.content_id = tc.id
     LEFT JOIN series ser ON ser.content_id = tc.id
     WHERE l.target_show NOT IN (SELECT show_id FROM touched)
       AND NOT EXISTS (
         SELECT 1 FROM franchise_members fm
         JOIN touched_franchises tf ON tf.franchise_id = fm.franchise_id
         WHERE fm.member_id = l.target_show
            OR fm.member_id IN (SELECT content_id FROM seasons WHERE series_id = l.target_show)
       )`,
    [userId, threshold, kind],
  )
  return rows.map((row) => ({
    seedId: row.seed_id,
    seedRating: Number(row.seed_rating),
    targetId: row.target_id,
    weight: Number(row.weight),
    targetScore: row.target_score == null ? null : Number(row.target_score),
  }))
}

/**
 * Picks for a user on the Movies or Series tab.
 * @param {string} userId
 * @param {{ type?: 'movie' | 'tv', limit?: number }} [options]
 * @returns {Promise<{ status: 'ok', items: object[] } |
 *   { status: 'needs_ratings', rated: number, needed: number, items: [] }>}
 *   Items are catalog rows with `why` and `because` (`{ id, title, rating }`, strongest first;
 *   a rated season is named as its series).
 */
export async function getRecommendationsForUser(userId, { type = 'tv', limit = 20 } = {}) {
  const { scores, fingerprint } = await loadRatingState(userId)
  const threshold = seedThreshold(scores)
  if (threshold == null) {
    return { status: 'needs_ratings', rated: scores.length, needed: MIN_RATED, items: [] }
  }

  const kind = TARGET_KINDS[type] || TARGET_KINDS.tv
  const key = `${userId}:${kind}:${limit}`
  const cached = cache.get(key, fingerprint)
  if (cached) return cached

  const ranked = rankRecommendations(await loadLinks(userId, threshold, kind), { limit })
  const seedIds = [...new Set(ranked.flatMap((pick) => pick.because.map((seed) => seed.seedId)))]
  const works = await loadWorksById([...ranked.map((pick) => pick.id), ...seedIds])

  const items = []
  for (const pick of ranked) {
    const work = works.get(pick.id)
    if (!work) continue
    const because = pick.because.map((seed) => ({
      id: seed.seedId,
      title: works.get(seed.seedId)?.displayTitle || '',
      rating: seed.rating,
    }))
    items.push({ ...work, why: becauseText(because), because })
  }
  const result = { status: 'ok', items }
  cache.set(key, fingerprint, result)
  return result
}

/**
 * "Watchers who liked this also liked" for a movie, special, series, or season. A
 * season stands for its series: links from every season of the show are used, and
 * linked seasons are listed as their series. Titles in the same franchise (sequels,
 * spin-offs) are left out.
 * @param {string} contentId
 * @param {{ limit?: number }} [options]
 * @returns {Promise<object[]>} Catalog rows (movies and series), best first
 */
export async function getSimilarTitles(contentId, { limit = 12 } = {}) {
  const key = `${contentId}:${limit}`
  const cached = similarCache.get(key, '')
  if (cached) return cached

  const { rows } = await query(
    `WITH self AS (
       SELECT COALESCE(sn.series_id, c.id) AS show_id
       FROM content c LEFT JOIN seasons sn ON sn.content_id = c.id
       WHERE c.id = $1
     ),
     members AS (
       SELECT show_id AS member_id FROM self
       UNION SELECT sn.content_id FROM self JOIN seasons sn ON sn.series_id = self.show_id
     ),
     franchise AS (
       SELECT DISTINCT fm.franchise_id
       FROM franchise_members fm JOIN members m ON m.member_id = fm.member_id
     ),
     targets AS (
       SELECT cr.source, t.id AS target_id, cr.weight
       FROM members m
       JOIN content_recommendations cr ON cr.content_id = m.member_id AND cr.source = 'anilist'
       JOIN content t ON t.anilist_id = cr.target_id AND t.kind IN ('season', 'movie', 'special')
       UNION ALL
       SELECT cr.source, t.id, cr.weight
       FROM members m
       JOIN content_recommendations cr ON cr.content_id = m.member_id AND cr.source = 'tmdb'
       JOIN content t ON t.tmdb_id = cr.target_id
         AND t.kind = CASE cr.target_type WHEN 'movie' THEN 'movie' ELSE 'series' END
     ),
     links AS (
       SELECT t.source, COALESCE(sn.series_id, t.target_id) AS target_show, max(t.weight) AS weight
       FROM targets t LEFT JOIN seasons sn ON sn.content_id = t.target_id
       GROUP BY 1, 2
     )
     SELECT l.source, l.target_show::text AS target_id, l.weight,
            COALESCE(mv.unified_score, ser.unified_score) AS target_score
     FROM links l
     JOIN content tc ON tc.id = l.target_show AND tc.kind IN ('movie', 'series')
     LEFT JOIN movies mv ON mv.content_id = tc.id
     LEFT JOIN series ser ON ser.content_id = tc.id
     WHERE l.target_show NOT IN (SELECT show_id FROM self)
       AND NOT EXISTS (
         SELECT 1 FROM franchise_members fm
         JOIN franchise f ON f.franchise_id = fm.franchise_id
         WHERE fm.member_id = l.target_show
            OR fm.member_id IN (SELECT content_id FROM seasons WHERE series_id = l.target_show)
       )`,
    [contentId],
  )
  const ranked = rankSimilarTitles(
    rows.map((row) => ({
      source: row.source,
      targetId: row.target_id,
      weight: Number(row.weight),
      targetScore: row.target_score == null ? null : Number(row.target_score),
    })),
    { limit },
  )
  const works = await loadWorksById(ranked.map((pick) => pick.id))
  const items = ranked.map((pick) => works.get(pick.id)).filter(Boolean)
  similarCache.set(key, '', items)
  return items
}

export default { getRecommendationsForUser, getSimilarTitles }
