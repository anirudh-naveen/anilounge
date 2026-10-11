/**
 * One-off migration to franchise → series → seasons → episodes.
 *
 * Today each MAL/AniList season is its own `series` row. This groups those rows into
 * shows and turns each into a `season` row under a new `series` row. Seasons keep
 * their ids, so watchlist entries, ratings, favorites, watch history, forum tags, and
 * release threads stay on the same rows. A show that is not anime (TMDB only) stays
 * the series it is and gains a season row for each TMDB season.
 *
 * Grouping:
 *   1. TMDB-linked rows, most popular first: TMDB's seasons are cut where MAL/AniList
 *      entries premiere and matched to rows (utils/seasonPlan.js `planTmdbShow`).
 *   2. Anime rows still unplaced: a sequel of a planned show joins it as its next
 *      season; the rest form shows from their sequel/prequel chains
 *      (utils/seriesGrouping.js).
 *
 * Users' data is never written. All changes run in one transaction that fingerprints
 * watchlist, ratings, favorites, watch_events, posts, post_tags, release_threads, and
 * watchlist_import_conflicts before and after, and rolls back if any differ. No
 * watchlist progress is clamped and no catalog events fire (no megathreads, pushes).
 *
 * Usage:
 *   npm run db:restructure-series -- --dry-run      # plan, apply, check, roll back
 *   npm run db:restructure-series                   # backup, then apply and commit
 *   npm run db:restructure-series -- --limit 50     # plan only the 50 most popular TMDB rows
 *
 * Writes the plan to backend/logs/restructure-plan.json. Needs TMDB_API_KEY.
 * Afterwards run `npm run db:reload -- --phases seasons` to fill seasons' new
 * fields and episodes (services/catalogImport.js).
 */
import crypto from 'crypto'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import dotenv from 'dotenv'
import { closePostgres, connectPostgres, query, withTransaction } from '../../config/postgres.js'
import { loadWorksById } from '../models/Content.js'
import { backupCatalog } from '../services/catalogRepair.js'
import {
  buildAnimeSeries,
  finishSeries,
  hasSeriesStructure,
  makeSeasons,
  removePremigrationSeasons,
} from '../services/seriesStructure.js'
import { seasonCandidates } from '../services/seasonService.js'
import unifiedContentService from '../services/unifiedContentService.js'
import { fribbEntryFor, fribbTmdbPlacement } from '../utils/fribb.js'
import { loadFribbIndex } from '../services/fribbService.js'
import { planTmdbShow, seasonRowName } from '../utils/seasonPlan.js'
import { dedupeSeasonNumbers, groupRemaining, renumberByTvdb } from '../utils/seriesGrouping.js'

dotenv.config()

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const PLAN_PATH = path.resolve(__dirname, '../../logs/restructure-plan.json')

/**
 * Users' tables and the columns that must stay as they were (posts' like/comment
 * counts and hot score are refreshed by a background job, so they are left out).
 */
export const USER_TABLES = [
  ['watchlist', '*'],
  ['ratings', '*'],
  ['favorites', '*'],
  ['watch_events', '*'],
  ['posts', 'id, user_id, kind, title, body, content_id, created_at, score, spoiler, edited_at'],
  ['post_tags', '*'],
  ['release_threads', '*'],
  ['watchlist_import_conflicts', '*'],
]

class DryRunRollback extends Error {}

/**
 * @param {string[]} argv
 * @returns {{ dryRun: boolean, limit: number | null }}
 */
export function parseArgs(argv) {
  const index = argv.indexOf('--limit')
  const limit = index >= 0 ? Number(argv[index + 1]) : null
  return {
    dryRun: argv.includes('--dry-run'),
    limit: Number.isFinite(limit) && limit > 0 ? limit : null,
  }
}

/**
 * Row count and a hash of every row, per user table.
 * @returns {Promise<Record<string, { rows: number, hash: string }>>}
 */
export async function fingerprintUserData() {
  const prints = {}
  for (const [table, columns] of USER_TABLES) {
    const { rows } = await query(
      `SELECT count(*)::int AS rows,
              md5(coalesce(string_agg(t::text, '|' ORDER BY t::text), '')) AS hash
       FROM (SELECT ${columns} FROM ${table}) t`,
    )
    prints[table] = rows[0]
  }
  return prints
}

/**
 * Tables whose fingerprint changed.
 * @param {Record<string, { rows: number, hash: string }>} before
 * @param {Record<string, { rows: number, hash: string }>} after
 * @returns {string[]}
 */
export function changedTables(before, after) {
  return Object.keys(before).filter(
    (table) =>
      before[table].rows !== after[table]?.rows || before[table].hash !== after[table]?.hash,
  )
}

/**
 * @param {object} row
 * @returns {boolean}
 */
const isAnimeRow = (row) => Boolean(row.malId || row.anilistId)

/**
 * @param {object} row
 * @returns {number} Premiere time, unknown dates last
 */
const premiere = (row) => {
  const time = row.releaseDate ? new Date(row.releaseDate).getTime() : NaN
  return Number.isFinite(time) ? time : Infinity
}

/**
 * Group every series row into shows.
 * @param {{ limit: number | null }} options
 * @returns {Promise<{ anime: object[], tmdbShows: object[], skipped: object[], review: object[] }>}
 *   `review`: rows to check by hand (two rows in one season part).
 *   `anime`: shows whose seasons are existing rows (`seriesFrom` is the TMDB-linked
 *   row whose show it is, or null; `seriesId` an existing row that stays the series); `tmdbShows`: shows that stay series and gain
 *   season rows from TMDB; `skipped`: TMDB seasons no row matched, for review.
 */
export async function planShows({ limit }) {
  const { rows: idRows } = await query(
    `SELECT id::text AS id FROM works WHERE kind = 'series' ORDER BY popularity DESC NULLS LAST, id`,
  )
  const works = await loadWorksById(idRows.map((row) => row.id))
  const rows = idRows.map((row) => works.get(row.id)).filter(Boolean)
  const claimed = new Set()
  const anime = []
  const tmdbShows = []
  const skipped = []
  // Fribb's lists say which TMDB show each MAL/AniList entry is part of.
  const fribb = await loadFribbIndex()
  const byFribbShow = new Map()
  for (const row of rows) {
    const tvId = fribbEntryFor(fribb, row)?.tmdbTvId
    if (!tvId || !isAnimeRow(row)) continue
    if (!byFribbShow.has(tvId)) byFribbShow.set(tvId, [])
    byFribbShow.get(tvId).push(row)
  }
  const showEdges = []

  let anchors = rows.filter((row) => row.tmdbId)
  if (limit) anchors = anchors.slice(0, limit)
  for (const [index, anchor] of anchors.entries()) {
    if (claimed.has(String(anchor._id))) continue
    if (index % 25 === 0) console.log(`Planning ${index + 1}/${anchors.length}: ${anchor.title}`)
    const data = await unifiedContentService.fetchTmdbSeasonData(anchor.tmdbId, anchor.seasonCount)
    const withEpisodes = new Set(data.episodes.map((episode) => episode.seasonNumber))
    const seasons = data.seasons.filter(
      (season) => season.episodeCount > 0 || withEpisodes.has(season.seasonNumber),
    )
    const fribbRows = isAnimeRow(anchor) ? byFribbShow.get(anchor.tmdbId) || [] : []
    const found = isAnimeRow(anchor) ? await seasonCandidates(anchor) : []
    const candidates = [
      ...new Map([...found, ...fribbRows].map((row) => [String(row._id), row])).values(),
    ]
      .filter((row) => String(row._id) !== String(anchor._id))
      .filter((row) => !claimed.has(String(row._id)) && isAnimeRow(row))
    const plan = planTmdbShow({ seasons, episodes: data.episodes, anchor, candidates })

    // A show stored only from TMDB whose MAL/AniList entries Fribb places on it
    // (Demon Slayer: the TMDB row has no MAL id, its seasons have no TMDB id): the
    // TMDB row stays the series and those entries become its seasons.
    const listed = isAnimeRow(anchor)
      ? []
      : (byFribbShow.get(anchor.tmdbId) || []).filter((row) => !claimed.has(String(row._id)))
    if (listed.length) {
      claimed.add(String(anchor._id))
      for (const row of listed) claimed.add(String(row._id))
      anime.push({
        seriesId: String(anchor._id),
        tmdbId: anchor.tmdbId,
        seasons: listed
          .sort((left, right) => premiere(left) - premiere(right))
          .map((row, index) => ({
            contentId: String(row._id),
            seasonNumber: index + 1,
            partNumber: 1,
            label: `Season ${index + 1}`,
            ...(fribbTmdbPlacement(fribbEntryFor(fribb, row), anchor.tmdbId, seasons) || {
              tmdbSeasonNumber: null,
              tmdbEpisodeOffset: 0,
            }),
          })),
      })
      continue
    }

    if (!isAnimeRow(anchor)) {
      claimed.add(String(anchor._id))
      tmdbShows.push({
        seriesId: String(anchor._id),
        title: anchor.title,
        seasons: plan.seasons.map(
          ({ seasonNumber, label, airDate, episodeCount, voteAverage, overview, posterPath }) => ({
            seasonNumber,
            label,
            tmdbSeasonNumber: seasonNumber,
            airDate,
            episodeCount,
            voteAverage,
            overview,
            posterPath,
          }),
        ),
      })
      continue
    }

    const matched = plan.seasons.filter(
      (season) => season.contentId && !claimed.has(season.contentId),
    )
    for (const season of plan.seasons.filter((entry) => !entry.contentId)) {
      skipped.push({ show: anchor.title, tmdbSeason: season.tmdbSeasonNumber, label: season.label })
    }
    if (!matched.some((season) => season.contentId === String(anchor._id))) {
      // The TMDB row is not its own show's first season: leave it for the chain step.
      continue
    }
    for (const season of matched) {
      claimed.add(season.contentId)
      // Fribb's TMDB placement wins over the airing-date split when it fits TMDB.
      const placement = fribbTmdbPlacement(
        fribbEntryFor(fribb, works.get(season.contentId) || {}),
        anchor.tmdbId,
        seasons,
      )
      if (placement) Object.assign(season, placement)
    }
    // Entries Fribb puts on this show that the airing dates didn't place (announced
    // seasons, seasons TMDB has no episodes for) join it after its matched seasons.
    for (const row of fribbRows)
      showEdges.push({ fromId: String(anchor._id), toId: String(row._id) })
    anime.push({
      seriesFrom: String(anchor._id),
      tmdbId: anchor.tmdbId,
      seasons: matched.map(
        ({ contentId, seasonNumber, partNumber, label, tmdbSeasonNumber, tmdbEpisodeOffset }) => ({
          contentId,
          seasonNumber,
          partNumber,
          label,
          tmdbSeasonNumber,
          tmdbEpisodeOffset,
        }),
      ),
    })
  }

  const remaining = rows.filter((row) => isAnimeRow(row) && !claimed.has(String(row._id)))
  const { rows: edgeRows } = await query(
    `SELECT r.from_id::text AS "fromId", r.to_id::text AS "toId"
     FROM content_relations r
     JOIN content a ON a.id = r.from_id AND a.kind = 'series'
     JOIN content b ON b.id = r.to_id AND b.kind = 'series'
     WHERE r.kind IN ('sequel', 'prequel')`,
  )
  const { appended, chains } = groupRemaining({
    groups: anime,
    rows: remaining,
    edges: [...edgeRows, ...showEdges],
  })
  console.log(`${appended} announced or unmatched sequels joined their shows`)
  // A show no catalog row linked to TMDB takes the TMDB show Fribb's list puts its
  // seasons on, unless another series already holds it.
  const usedTmdb = new Set(rows.filter((row) => row.tmdbId).map((row) => Number(row.tmdbId)))
  for (const chain of chains) {
    const tmdbId =
      chain.seasons
        .map((season) => fribbEntryFor(fribb, works.get(season.contentId) || {})?.tmdbTvId)
        .find((id) => id && !usedTmdb.has(id)) || null
    if (tmdbId) usedTmdb.add(tmdbId)
    anime.push({ seriesFrom: null, tmdbId, seasons: chain.seasons })
  }

  // Season numbers as fans count them, then rows claiming the same place (a cour
  // stored twice) move to a free part and are reported.
  const review = []
  for (const show of anime) {
    renumberByTvdb(show, (id) => fribbEntryFor(fribb, works.get(id) || {}))
    for (const contentId of dedupeSeasonNumbers(show)) {
      review.push({
        contentId,
        title: works.get(contentId)?.title,
        reason: 'same season part as another row',
      })
    }
  }
  return { anime, tmdbShows, skipped, review }
}

/**
 * Make existing anime entries seasons of a series that is already a row (a show
 * stored from TMDB). The series keeps its id, its watchlist entries, and its ratings.
 * @param {{ seriesId: string, seasons: object[] }} show
 * @returns {Promise<void>}
 */
async function addSeasons(show) {
  await makeSeasons(show.seriesId, show.seasons, { onTmdb: true })
  await finishSeries(
    show.seriesId,
    show.seasons.map((season) => season.contentId),
    null,
  )
}

/**
 * Give a TMDB-only show a season row per TMDB season. The show keeps its id, and
 * its watchlist entries and ratings stay on it.
 * @param {{ seriesId: string, title: string, seasons: object[] }} show
 * @returns {Promise<void>}
 */
async function applyTmdbShow(show) {
  for (const season of show.seasons) {
    const id = crypto.randomUUID()
    const label = season.label || `Season ${season.seasonNumber}`
    const name = seasonRowName(show.title, label)
    await query(
      `INSERT INTO content (id, kind, name, about, image_path) VALUES ($1, 'season', $2, $3, $4)`,
      [id, name, season.overview || null, season.posterPath || null],
    )
    await query(
      `INSERT INTO seasons (content_id, series_id, season_number, label, tmdb_season_number,
         release_date, episode_count, tmdb_score, origin_country, backdrop_path)
       SELECT $1, $2, $3, $4, $5, $6, $7, $8, s.origin_country, s.backdrop_path
       FROM series s WHERE s.content_id = $2`,
      [
        id,
        show.seriesId,
        season.seasonNumber,
        label,
        season.tmdbSeasonNumber,
        season.airDate || null,
        season.episodeCount || null,
        season.voteAverage || null,
      ],
    )
  }
}

/**
 * Apply a plan. Throws (rolling back) when users' data would change.
 * @param {{ anime: object[], tmdbShows: object[] }} plan
 * @param {{ dryRun: boolean }} options
 * @returns {Promise<{ series: number, seasons: number }>}
 */
export async function applyPlan(plan, { dryRun }) {
  const counts = { series: 0, seasons: 0 }
  try {
    await withTransaction(async () => {
      // One snapshot for both fingerprints: users' own edits during the run don't
      // count as changes, the migration's would.
      await query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ')
      const before = await fingerprintUserData()
      const early = await removePremigrationSeasons()
      if (early) console.log(`Removed ${early} season rows an import made before the migration`)
      for (const show of plan.anime) {
        await (show.seriesId ? addSeasons(show) : buildAnimeSeries(show))
        counts.series += 1
        counts.seasons += show.seasons.length
      }
      for (const show of plan.tmdbShows) {
        await applyTmdbShow(show)
        counts.seasons += show.seasons.length
      }
      const after = await fingerprintUserData()
      const changed = changedTables(before, after)
      if (changed.length) throw new Error(`Users' data would change: ${changed.join(', ')}`)
      const { rows } = await query(
        `SELECT count(*)::int AS n FROM content c
         WHERE c.kind = 'season' AND NOT EXISTS (SELECT 1 FROM seasons s WHERE s.content_id = c.id)`,
      )
      if (rows[0].n) throw new Error(`${rows[0].n} season rows have no seasons row`)
      if (dryRun) throw new DryRunRollback()
    })
  } catch (error) {
    if (!(error instanceof DryRunRollback)) throw error
  }
  return counts
}

async function main() {
  const options = parseArgs(process.argv.slice(2))
  try {
    await connectPostgres()
    if (await hasSeriesStructure()) {
      console.log('Already migrated: series are split into seasons. Nothing to do.')
      return
    }
    const plan = await planShows(options)
    fs.mkdirSync(path.dirname(PLAN_PATH), { recursive: true })
    fs.writeFileSync(PLAN_PATH, JSON.stringify(plan, null, 2))
    console.log(
      `Plan: ${plan.anime.length} anime series (${plan.anime.reduce((n, show) => n + show.seasons.length, 0)} seasons), ` +
        `${plan.tmdbShows.length} TMDB-only shows, ${plan.skipped.length} TMDB seasons with no row, ` +
        `${plan.review.length} rows to review. ` +
        `Written to ${PLAN_PATH}`,
    )
    if (!options.dryRun) {
      const schema = await backupCatalog()
      console.log(`Backed up to schema ${schema}`)
    }
    const counts = await applyPlan(plan, options)
    console.log(
      `${options.dryRun ? 'Dry run (rolled back)' : 'Committed'}: ${counts.series} series created, ` +
        `${counts.seasons} season rows. Users' data unchanged.`,
    )
  } catch (error) {
    console.error('Series migration failed:', error)
    process.exitCode = 1
  } finally {
    await closePostgres()
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main()
