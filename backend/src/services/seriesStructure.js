/**
 * Series totals kept from their seasons: season and episode counts, airing state,
 * the next episode, and scores (a series' MAL and unified scores are its seasons'
 * averages, the way the franchise rating averages its series).
 *
 * Also how rows become seasons: the series migration builds every show at once, and
 * the catalog sync places each new MAL/AniList TV entry (`attachTvEntry`).
 *
 * Domain service used by the series migration, the catalog sync and import, and rating
 * writes (a season's new community rating moves its series' average).
 */
import crypto from 'crypto'
import { query, withTransaction } from '../../config/postgres.js'

/**
 * SQL for a season row's place in its series' guide (1, 2, 3 in airing order, one per
 * season row), the season number forum episode tags and release threads use.
 * @param {string} seasonId - SQL expression for the season's content id
 * @returns {string}
 */
export const guideNumberSql = (seasonId) => `(
  SELECT count(*)::int FROM seasons me
  JOIN seasons o ON o.series_id = me.series_id
    AND (o.season_number, o.part_number) <= (me.season_number, me.part_number)
  WHERE me.content_id = ${seasonId}
)`

/**
 * A series' counts, airing state, next episode, and scores from its seasons. Fields
 * no season has (a TMDB-only show's seasons carry no airing state) keep the series' own.
 * @param {string} seriesId
 * @returns {Promise<void>}
 */
export async function rollUpSeries(seriesId) {
  await query(
    `UPDATE series s SET
       season_count = COALESCE(x.season_count, s.season_count),
       episode_count = COALESCE(x.episode_count, s.episode_count),
       airing_status = COALESCE(x.airing_status, s.airing_status),
       release_date = COALESCE(x.release_date, s.release_date),
       start_season = COALESCE(x.start_season, s.start_season),
       start_year = COALESCE(x.start_year, s.start_year),
       next_episode_at = CASE WHEN x.airing_status IS NULL THEN s.next_episode_at ELSE x.next_at END,
       next_episode_number = CASE WHEN x.airing_status IS NULL THEN s.next_episode_number ELSE x.next_number END,
       next_episode_season = CASE WHEN x.airing_status IS NULL THEN s.next_episode_season ELSE x.next_season END,
       mal_score = COALESCE(x.mal_score, s.mal_score),
       unified_score = COALESCE(x.unified_score, s.unified_score)
     FROM (
       SELECT count(DISTINCT season_number)::int AS season_count,
              sum(episode_count)::int AS episode_count,
              CASE WHEN bool_or(airing_status = 'airing') THEN 'airing'
                   WHEN bool_and(airing_status = 'upcoming') THEN 'upcoming'
                   WHEN bool_or(airing_status = 'finished') THEN 'finished' END AS airing_status,
              min(release_date) AS release_date,
              (array_agg(start_season ORDER BY season_number, part_number))[1] AS start_season,
              (array_agg(start_year ORDER BY season_number, part_number))[1] AS start_year,
              (array_agg(next_episode_at ORDER BY next_episode_at) FILTER (WHERE airing_status = 'airing' AND next_episode_at IS NOT NULL))[1] AS next_at,
              (array_agg(next_episode_number ORDER BY next_episode_at) FILTER (WHERE airing_status = 'airing' AND next_episode_at IS NOT NULL))[1] AS next_number,
              (array_agg(season_number ORDER BY next_episode_at) FILTER (WHERE airing_status = 'airing' AND next_episode_at IS NOT NULL))[1] AS next_season,
              round(avg(mal_score) FILTER (WHERE mal_score > 0)::numeric, 2)::float8 AS mal_score,
              round(avg(unified_score) FILTER (WHERE unified_score > 0)::numeric, 2)::float8 AS unified_score
       FROM seasons WHERE series_id = $1
     ) x
     WHERE s.content_id = $1`,
    [seriesId],
  )
}

/**
 * Roll up the series a season belongs to, if it is a season.
 * @param {string} contentId
 * @returns {Promise<void>}
 */
export async function rollUpSeriesOf(contentId) {
  const { rows } = await query('SELECT series_id FROM seasons WHERE content_id = $1', [contentId])
  if (rows[0]) await rollUpSeries(String(rows[0].series_id))
}

/**
 * Turn `series` rows (one MAL/AniList entry each) into seasons of `seriesId`, keeping
 * their ids and their own airing state, counts, and scores. Seasons drop TMDB's show
 * id (their series holds it) and, when the show is on TMDB, TMDB's whole-show score.
 * @param {string} seriesId
 * @param {{ contentId: string, seasonNumber: number, partNumber?: number, label?: string,
 *   tmdbSeasonNumber?: number | null, tmdbEpisodeOffset?: number }[]} seasons
 * @param {{ onTmdb: boolean }} options
 * @returns {Promise<void>}
 */
export async function makeSeasons(seriesId, seasons, { onTmdb }) {
  const ids = seasons.map((season) => season.contentId)
  await query(
    `UPDATE content SET kind = 'season', tmdb_id = NULL, updated_at = now()
     WHERE id = ANY($1::uuid[]) AND kind = 'series'`,
    [ids],
  )
  for (const season of seasons) {
    await query(
      `INSERT INTO seasons (content_id, series_id, season_number, part_number, label,
         tmdb_season_number, tmdb_episode_offset, original_title, backdrop_path, release_date,
         origin_country, episode_count, airing_status, start_season, start_year, broadcast_day,
         next_episode_at, next_episode_number, tmdb_score, tmdb_votes, mal_score, mal_votes,
         popularity, unified_score)
       SELECT $1, $2, $3, $4, $5, $6, $7, s.original_title, s.backdrop_path, s.release_date,
         s.origin_country, s.episode_count, s.airing_status, s.start_season, s.start_year,
         s.broadcast_day, s.next_episode_at, s.next_episode_number,
         CASE WHEN $8 THEN NULL ELSE s.tmdb_score END, CASE WHEN $8 THEN NULL ELSE s.tmdb_votes END,
         s.mal_score, s.mal_votes, s.popularity, s.unified_score
       FROM series s WHERE s.content_id = $1`,
      [
        season.contentId,
        seriesId,
        season.seasonNumber,
        season.partNumber || 1,
        season.label || `Season ${season.seasonNumber}`,
        season.tmdbSeasonNumber ?? null,
        season.tmdbEpisodeOffset || 0,
        onTmdb,
      ],
    )
  }
  await query('DELETE FROM series WHERE content_id = ANY($1::uuid[])', [ids])
}

/**
 * A new series row named and pictured after `firstId`, with `sourceId`'s show-level
 * fields (TMDB score, backdrop, tagline). Call before `makeSeasons` drops them.
 * @param {string} firstId - The show's first season row
 * @param {string} sourceId - Row whose `series` fields the show takes
 * @param {number | null} tmdbId
 * @returns {Promise<string>} The new series id
 */
export async function createSeries(firstId, sourceId, tmdbId) {
  const seriesId = crypto.randomUUID()
  await query(
    `INSERT INTO content (id, kind, name, native_name, about, image_path, tmdb_id)
     SELECT $1, 'series', c.name, c.native_name, c.about, c.image_path, $3
     FROM content c WHERE c.id = $2`,
    [seriesId, firstId, tmdbId],
  )
  await query(
    `INSERT INTO series (content_id, original_title, tagline, backdrop_path, origin_country,
       tmdb_score, tmdb_votes, popularity)
     SELECT $1, s.original_title, s.tagline, s.backdrop_path, s.origin_country,
       s.tmdb_score, s.tmdb_votes, s.popularity
     FROM series s WHERE s.content_id = $2`,
    [seriesId, sourceId],
  )
  return seriesId
}

/**
 * Give a series its seasons' genres and studios (and its first season's names when
 * `firstId` is given); put it in its seasons' franchise in their place; roll its
 * totals up from its seasons.
 * @param {string} seriesId
 * @param {string[]} seasonIds - Seasons just added
 * @param {string | null} firstId - The show's first season, for a new series
 * @returns {Promise<void>}
 */
export async function finishSeries(seriesId, seasonIds, firstId) {
  await query(
    `INSERT INTO content_genres (content_id, genre_id)
     SELECT DISTINCT $1::uuid, genre_id FROM content_genres WHERE content_id = ANY($2::uuid[])
     ON CONFLICT DO NOTHING`,
    [seriesId, seasonIds],
  )
  await query(
    `INSERT INTO studio_credits (work_id, studio_id, role, is_main)
     SELECT DISTINCT ON (studio_id) $1::uuid, studio_id, role, is_main
     FROM studio_credits WHERE work_id = ANY($2::uuid[])
     ORDER BY studio_id, is_main DESC, role NULLS LAST
     ON CONFLICT DO NOTHING`,
    [seriesId, seasonIds],
  )
  if (firstId) {
    await query(
      `INSERT INTO content_akas (content_id, name)
       SELECT $1, name FROM content_akas WHERE content_id = $2 ON CONFLICT DO NOTHING`,
      [seriesId, firstId],
    )
  }
  const { rows: franchise } = await query(
    `SELECT fm.franchise_id FROM franchise_members fm
     WHERE fm.member_id = ANY($1::uuid[])
     ORDER BY (fm.member_id = $2) DESC LIMIT 1`,
    [seasonIds, firstId],
  )
  await query('DELETE FROM franchise_members WHERE member_id = ANY($1::uuid[])', [seasonIds])
  if (franchise[0]) {
    await query(
      `INSERT INTO franchise_members (franchise_id, member_id) VALUES ($1, $2)
       ON CONFLICT DO NOTHING`,
      [franchise[0].franchise_id, seriesId],
    )
  }
  await rollUpSeries(seriesId)
}

/**
 * Make one anime show: a new series row above its existing rows, which become seasons.
 * @param {{ seriesFrom: string | null, tmdbId: number | null, seasons: object[] }} show
 *   `seriesFrom`: the TMDB-linked row whose show-level fields the series takes.
 * @returns {Promise<string>} The new series id.
 */
export async function buildAnimeSeries(show) {
  const ids = show.seasons.map((season) => season.contentId)
  const first = ids[0]
  // The new series takes the TMDB id once the seasons have let go of it.
  await query(`UPDATE content SET tmdb_id = NULL WHERE id = ANY($1::uuid[])`, [ids])
  const seriesId = await createSeries(first, show.seriesFrom || first, show.tmdbId)
  await makeSeasons(seriesId, show.seasons, { onTmdb: Boolean(show.tmdbId) })
  await finishSeries(seriesId, ids, first)
  return seriesId
}

/**
 * Whether the catalog is structured as series → seasons yet (the migration has run).
 * The migration turns MAL/AniList entries into seasons, so a season row with one of
 * their ids is the mark; season rows an import made from TMDB alone don't count.
 * @returns {Promise<boolean>}
 */
export async function hasSeriesStructure() {
  const { rows } = await query(
    `SELECT EXISTS (
       SELECT 1 FROM content
       WHERE kind = 'season' AND (mal_id IS NOT NULL OR anilist_id IS NOT NULL)
     ) AS ok`,
  ).catch(() => ({ rows: [{ ok: false }] }))
  return Boolean(rows[0]?.ok)
}

/**
 * Remove season rows made before the migration (a seasons import run too early
 * creates TMDB seasons under each MAL entry). They are only removed when nothing of
 * users' points at them; their episodes and links go with them.
 * @returns {Promise<number>} Rows removed
 * @throws {Error} When a user's watchlist, rating, favorite, history, or forum row uses one.
 */
export async function removePremigrationSeasons() {
  if (await hasSeriesStructure()) return 0
  const { rows } = await query(
    `SELECT
       (SELECT count(*) FROM watchlist w JOIN content c ON c.id = w.content_id WHERE c.kind = 'season')
     + (SELECT count(*) FROM ratings r JOIN content c ON c.id = r.content_id WHERE c.kind = 'season')
     + (SELECT count(*) FROM favorites f JOIN content c ON c.id = f.content_id WHERE c.kind = 'season')
     + (SELECT count(*) FROM watch_events e JOIN content c ON c.id = e.content_id WHERE c.kind = 'season')
     + (SELECT count(*) FROM post_tags t JOIN content c ON c.id = t.content_id WHERE c.kind = 'season')
     + (SELECT count(*) FROM release_threads t JOIN content c ON c.id = t.content_id WHERE c.kind = 'season')
       AS used`,
  )
  if (Number(rows[0].used)) {
    throw new Error(
      `${rows[0].used} users' rows point at pre-migration season rows; not removing them`,
    )
  }
  const removed = await query(`DELETE FROM content WHERE kind = 'season'`)
  return removed.rowCount || 0
}

/**
 * Place a new anime TV entry (a `series` row with a MAL or AniList id) the catalog sync
 * just added: as a season of its show's series (the TMDB show Fribb's list puts it on,
 * else the series of another season Fribb puts on that show, else the series of a
 * season it is a sequel or prequel of), or as season 1 of a new series. Its season number follows TVDB's (Fribb), else comes after the show's last.
 * Does nothing before the series migration, or for a row that isn't such an entry.
 * @param {string} contentId
 * @param {{ entry?: object | null, siblings?: { malIds: number[], anilistIds: number[] } | null }} [options]
 *   - The row's Fribb entry, and the ids of the entries on the same TMDB show, when known
 * @returns {Promise<string | null>} The series it is now a season of.
 */
export async function attachTvEntry(contentId, { entry = null, siblings = null } = {}) {
  if (!(await hasSeriesStructure())) return null
  return withTransaction(async () => {
    const { rows } = await query(
      `SELECT c.kind, c.name, c.mal_id, c.anilist_id, c.tmdb_id FROM content c WHERE c.id = $1
       FOR UPDATE`,
      [contentId],
    )
    const row = rows[0]
    if (!row || row.kind !== 'series' || !(row.mal_id || row.anilist_id)) return null

    let seriesId = null
    if (entry?.tmdbTvId) {
      const { rows: found } = await query(
        `SELECT id::text AS id FROM content WHERE kind = 'series' AND tmdb_id = $1 AND id <> $2`,
        [entry.tmdbTvId, contentId],
      )
      seriesId = found[0]?.id || null
    }
    if (!seriesId && (siblings?.malIds?.length || siblings?.anilistIds?.length)) {
      // The series of another season Fribb puts on the same TMDB show.
      const { rows: found } = await query(
        `SELECT sn.series_id::text AS id FROM seasons sn JOIN content c ON c.id = sn.content_id
         WHERE (c.mal_id = ANY($1::int[]) OR c.anilist_id = ANY($2::int[])) AND c.id <> $3
         GROUP BY sn.series_id ORDER BY count(*) DESC LIMIT 1`,
        [siblings.malIds || [], siblings.anilistIds || [], contentId],
      )
      seriesId = found[0]?.id || null
    }
    if (!seriesId) {
      const { rows: linked } = await query(
        `SELECT sn.series_id::text AS id FROM content_relations r
         JOIN seasons sn ON sn.content_id = CASE WHEN r.from_id = $1 THEN r.to_id ELSE r.from_id END
         WHERE $1 IN (r.from_id, r.to_id) AND r.kind IN ('sequel', 'prequel')
         LIMIT 1`,
        [contentId],
      )
      seriesId = linked[0]?.id || null
    }

    if (!seriesId) {
      const tmdbId = row.tmdb_id || entry?.tmdbTvId || null
      await query('UPDATE content SET tmdb_id = NULL WHERE id = $1', [contentId])
      const created = await createSeries(contentId, contentId, tmdbId)
      await makeSeasons(created, [{ contentId, seasonNumber: entry?.tvdbSeason || 1 }], {
        onTmdb: Boolean(tmdbId),
      })
      await finishSeries(created, [contentId], contentId)
      return created
    }

    const { rows: taken } = await query(
      `SELECT season_number, part_number FROM seasons WHERE series_id = $1`,
      [seriesId],
    )
    const last = Math.max(0, ...taken.map((season) => Number(season.season_number)))
    const seasonNumber = entry?.tvdbSeason || last + 1
    const parts = taken.filter((season) => Number(season.season_number) === seasonNumber)
    const partNumber = parts.length ? Math.max(...parts.map((p) => Number(p.part_number))) + 1 : 1
    if (row.tmdb_id) {
      // A show TMDB lists under this entry: the series takes the id if it has none.
      await query('UPDATE content SET tmdb_id = NULL WHERE id = $1', [contentId])
      await query(
        `UPDATE content SET tmdb_id = $2 WHERE id = $1 AND tmdb_id IS NULL
           AND NOT EXISTS (SELECT 1 FROM content o WHERE o.kind = 'series' AND o.tmdb_id = $2)`,
        [seriesId, row.tmdb_id],
      )
    }
    await makeSeasons(
      seriesId,
      [
        {
          contentId,
          seasonNumber,
          partNumber,
          label:
            partNumber > 1 ? `Season ${seasonNumber} Part ${partNumber}` : `Season ${seasonNumber}`,
        },
      ],
      { onTmdb: true },
    )
    await finishSeries(seriesId, [contentId], null)
    return seriesId
  })
}
