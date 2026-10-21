/**
 * Season guide for TV details: a series' seasons and their episodes, from the
 * stored `seasons` / `episodes` tables (services/catalogImport.js fills them). Until
 * the series migration has run, the guide is built live from TMDB, mapping every
 * TMDB season onto the catalog row for that season (utils/seasonPlan.js).
 *
 * Domain service used by `contentController.getContentEpisodes`. Pages read
 * `getSeasonGuide`, which never calls TMDB/MAL: a guide that needs them is built by
 * the catalog refresh job (`refreshSeasonGuide`) and stored in external_cache.
 */
import { query } from '../../config/postgres.js'
import { escapeLike } from '../db/mongoFilter.js'
import Content, { loadWorksById } from '../models/Content.js'
import { tmdbEpisodesForSeason } from './catalogImport.js'
import { EPISODE_ROLES } from '../utils/staffCredits.js'
import unifiedContentService from './unifiedContentService.js'
import { isStale, readCache, requestRefresh, writeCache } from './refreshRequests.js'
import { collectContentTitles, normalizeTitle } from '../utils/titles.js'
import {
  MIN_PREFIX_LENGTH,
  continuesTitle,
  isListedAnime,
  matchSeasonsToWorks,
  splitCombinedSeasons,
} from '../utils/seasonPlan.js'

const MAX_ANCHORS = 3
/** A stored TMDB-built guide is rebuilt after this long (sooner while airing). */
const GUIDE_STALE_MS = 7 * 24 * 60 * 60 * 1000
const AIRING_GUIDE_STALE_MS = 6 * 60 * 60 * 1000

/**
 * Lowercased, whitespace-collapsed name used for franchise prefix checks.
 * @param {unknown} value
 * @returns {string}
 */
function prefixKey(value) {
  return normalizeTitle(value).normalize('NFKC').toLowerCase()
}

/**
 * SQL twin of `prefixKey`.
 * @param {string} column
 * @returns {string}
 */
function nameKeySql(column) {
  return `lower(btrim(regexp_replace(normalize(${column}, NFKC), '\\s+', ' ', 'g')))`
}

/**
 * Series rows that may be later seasons of `anchor`: its sequel/prequel chain
 * plus series whose name continues one of the anchor's names.
 * @param {object} anchor
 * @returns {Promise<object[]>}
 */
export async function seasonCandidates(anchor) {
  const prefixes = [...new Set(collectContentTitles(anchor).map(prefixKey))].filter(
    (prefix) => prefix.length >= MIN_PREFIX_LENGTH,
  )
  const patterns = prefixes.map((prefix) => `${escapeLike(prefix)}%`)
  const { rows } = await query(
    `WITH RECURSIVE chain AS (
       SELECT $1::uuid AS id
       UNION
       SELECT CASE WHEN r.from_id = c.id THEN r.to_id ELSE r.from_id END
       FROM chain c JOIN content_relations r ON c.id IN (r.from_id, r.to_id)
       WHERE r.kind IN ('sequel', 'prequel')
     )
     SELECT w.id::text AS id, (w.id IN (SELECT id FROM chain)) AS chained
     FROM works w
     WHERE w.kind = 'series' AND w.id <> $1 AND (
       w.id IN (SELECT id FROM chain)
       OR ${nameKeySql('w.title')} LIKE ANY($2::text[])
       OR ${nameKeySql("coalesce(w.native_title, '')")} LIKE ANY($2::text[])
       OR EXISTS (
         SELECT 1 FROM content_akas k
         WHERE k.content_id = w.id AND ${nameKeySql('k.name')} LIKE ANY($2::text[])
       )
     )`,
    [String(anchor._id), patterns],
  )
  if (!rows.length) return []
  const chained = new Set(rows.filter((row) => row.chained).map((row) => row.id))
  const docs = await Content.find({ _id: { $in: rows.map((row) => row.id) } })
  return docs.filter((doc) => {
    if (chained.has(String(doc._id))) return true
    const names = collectContentTitles(doc).map(prefixKey)
    return names.some((name) => prefixes.some((prefix) => continuesTitle(name, prefix)))
  })
}

/**
 * TMDB-backed series rows that `content` may be a later season of: rows in
 * its sequel/prequel chain, or whose name `content`'s name continues.
 * @param {object} content
 * @returns {Promise<object[]>}
 */
async function anchorCandidates(content) {
  const names = [...new Set(collectContentTitles(content).map(prefixKey))]
  const { rows } = await query(
    `WITH RECURSIVE chain AS (
       SELECT $1::uuid AS id
       UNION
       SELECT CASE WHEN r.from_id = c.id THEN r.to_id ELSE r.from_id END
       FROM chain c JOIN content_relations r ON c.id IN (r.from_id, r.to_id)
       WHERE r.kind IN ('sequel', 'prequel')
     )
     SELECT w.id::text AS id, (w.id IN (SELECT id FROM chain)) AS chained
     FROM works w
     WHERE w.kind = 'series' AND w.tmdb_id IS NOT NULL AND w.id <> $1 AND (
       w.id IN (SELECT id FROM chain)
       OR EXISTS (
         SELECT 1 FROM unnest($2::text[]) n
         WHERE char_length(w.title) >= ${MIN_PREFIX_LENGTH} AND starts_with(n, ${nameKeySql('w.title')})
       )
       OR EXISTS (
         SELECT 1 FROM content_akas k, unnest($2::text[]) n
         WHERE k.content_id = w.id AND char_length(k.name) >= ${MIN_PREFIX_LENGTH}
           AND starts_with(n, ${nameKeySql('k.name')})
       )
     )
     ORDER BY chained DESC, w.popularity DESC NULLS LAST
     LIMIT ${MAX_ANCHORS}`,
    [String(content._id), names],
  )
  if (!rows.length) return []
  const docs = await Content.find({ _id: { $in: rows.map((row) => row.id) } })
  const byId = new Map(docs.map((doc) => [String(doc._id), doc]))
  return rows.map((row) => byId.get(row.id)).filter(Boolean)
}

/**
 * Episodes and season list for a TMDB-backed series row, each season tagged
 * with the catalog row that is that season (or null when none is stored).
 * @param {object} anchor
 * @returns {Promise<{ seriesId: string, episodes: object[], seasons: object[] }>}
 */
async function buildGuide(anchor) {
  const data = await unifiedContentService.getTvShowSeasonData(anchor)
  const withEpisodes = new Set(data.episodes.map((episode) => episode.seasonNumber))
  const listed = data.seasons.filter(
    (season) => season.episodeCount > 0 || withEpisodes.has(season.seasonNumber),
  )
  const candidates =
    listed.length > 1 || (listed.length && isListedAnime(anchor))
      ? await seasonCandidates(anchor)
      : []
  const { seasons, episodes } = splitCombinedSeasons(listed, data.episodes, anchor, candidates)
  const matches = matchSeasonsToWorks(seasons, episodes, anchor, candidates)
  return {
    seriesId: String(anchor._id),
    episodes,
    seasons: seasons.map((season) => ({
      ...season,
      contentId: matches.get(season.seasonNumber) || null,
    })),
  }
}

/** Cast shown on each episode card: a season's leads first. */
const EPISODE_CAST_LIMIT = 8

/**
 * Each season's lead characters with their (Japanese, else any) voice actor, for the
 * episode cards.
 * @param {string[]} seasonIds
 * @returns {Promise<Map<string, { name: string, character: string, profilePath: string }[]>>}
 */
async function seasonCast(seasonIds) {
  const { rows } = await query(
    `SELECT work_id, name, character, profile_path FROM (
       SELECT a.work_id::text AS work_id, ch.name AS character,
              COALESCE(v.name, ch.name) AS name,
              COALESCE(v.image_path, ch.image_path, '') AS profile_path,
              row_number() OVER (
                PARTITION BY a.work_id
                ORDER BY a.position NULLS LAST, (a.role = 'main') DESC, a.importance DESC, ch.name
              ) AS rank
       FROM appearances a
       JOIN content ch ON ch.id = a.character_id
       LEFT JOIN LATERAL (
         SELECT vc.voice_id FROM voice_credits vc WHERE vc.appearance_id = a.id
         ORDER BY (vc.language = 'Japanese') DESC LIMIT 1
       ) pick ON true
       LEFT JOIN content v ON v.id = pick.voice_id
       WHERE a.work_id = ANY($1::uuid[])
     ) ranked WHERE rank <= ${EPISODE_CAST_LIMIT}`,
    [seasonIds],
  )
  const cast = new Map()
  for (const row of rows) {
    if (!cast.has(row.work_id)) cast.set(row.work_id, [])
    cast.get(row.work_id).push({
      name: row.name,
      character: row.character,
      profilePath: row.profile_path,
    })
  }
  return cast
}

/**
 * Who worked on each episode of these seasons, by `seasonId:number`, in role order
 * (utils/staffCredits.js `EPISODE_ROLES`).
 * @param {string[]} seasonIds
 * @returns {Promise<Map<string, { _id: string, name: string, role: string }[]>>}
 */
async function episodeStaff(seasonIds) {
  const { rows } = await query(
    `SELECT e.season_id::text AS season_id, e.number, p.id::text AS person_id, p.name, ec.role
     FROM episode_credits ec
     JOIN episodes e ON e.id = ec.episode_id
     JOIN content p ON p.id = ec.person_id
     WHERE e.season_id = ANY($1::uuid[])
     ORDER BY array_position($2::text[], ec.role), p.name`,
    [seasonIds, EPISODE_ROLES],
  )
  const staff = new Map()
  for (const row of rows) {
    const key = `${row.season_id}:${row.number}`
    if (!staff.has(key)) staff.set(key, [])
    staff.get(key).push({ _id: row.person_id, name: row.name, role: row.role })
  }
  return staff
}

/**
 * @param {unknown} value
 * @returns {string | null} ISO date (YYYY-MM-DD) or timestamp
 */
function isoDate(value) {
  if (!value) return null
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date.toISOString()
}

/**
 * A series' stored seasons and episodes (`seasons`, `episodes` tables), or null when
 * it has none yet (before `npm run db:restructure-series`). Guide season numbers run
 * 1, 2, 3 in airing order, one per season row (a "Part 2" is its own entry), and each
 * row's episodes start at 1, the numbering forum episode tags use.
 * @param {string} seriesId
 * @returns {Promise<{ seriesId: string, episodes: object[], seasons: object[] } | null>}
 */
export async function storedGuide(seriesId) {
  const { rows: seasonRows } = await query(
    `SELECT id::text AS id, season_number, part_number, season_label, overview, poster_path,
            release_date, episode_count, vote_average, tmdb_season_number, tmdb_episode_offset
     FROM works WHERE series_id = $1 ORDER BY season_number, part_number`,
    [seriesId],
  )
  if (!seasonRows.length) return null
  const ids = seasonRows.map((row) => row.id)
  const guideNumber = new Map(ids.map((id, index) => [id, index + 1]))
  const byId = new Map(seasonRows.map((row) => [row.id, row]))
  const [{ rows: episodeRows }, cast, staff] = await Promise.all([
    query(
      `SELECT season_id::text AS season_id, number, title, title_romaji, title_native, overview,
              still_path, air_at, runtime, is_filler, is_recap
       FROM episodes WHERE season_id = ANY($1::uuid[]) ORDER BY number`,
      [ids],
    ),
    seasonCast(ids),
    episodeStaff(ids),
  ])

  return {
    seriesId: String(seriesId),
    seasons: seasonRows.map((row) => ({
      seasonNumber: guideNumber.get(row.id),
      name: row.season_label || `Season ${row.season_number}`,
      overview: row.overview || '',
      posterPath: row.poster_path || '',
      airDate: isoDate(row.release_date),
      episodeCount: row.episode_count != null ? Number(row.episode_count) : 0,
      voteAverage: row.vote_average != null ? Number(row.vote_average) : null,
      contentId: row.id,
    })),
    episodes: episodeRows.map((row) => {
      const season = byId.get(row.season_id)
      return {
        seasonNumber: guideNumber.get(row.season_id),
        episodeNumber: Number(row.number),
        title: row.title || `Episode ${row.number}`,
        titleRomaji: row.title_romaji || '',
        titleNative: row.title_native || '',
        overview: row.overview || '',
        stillPath: row.still_path || '',
        airDate: isoDate(row.air_at),
        runtime: row.runtime != null ? Number(row.runtime) : null,
        isFiller: Boolean(row.is_filler),
        isRecap: Boolean(row.is_recap),
        cast: cast.get(row.season_id) || [],
        staff: staff.get(`${row.season_id}:${row.number}`) || [],
        contentId: row.season_id,
        tmdbSeasonNumber:
          season.tmdb_season_number != null ? Number(season.tmdb_season_number) : null,
        tmdbEpisodeNumber:
          season.tmdb_season_number != null
            ? Number(row.number) + Number(season.tmdb_episode_offset || 0)
            : null,
      }
    }),
  }
}

/**
 * Seasons with no stored episodes yet (the import hasn't run since the migration)
 * show TMDB's live episodes for their place on TMDB.
 * @param {{ seriesId: string, seasons: object[], episodes: object[] }} guide - Mutated
 * @param {object | null} series - The series document, when already loaded
 * @returns {Promise<void>}
 */
async function fillFromTmdb(guide, series) {
  const stocked = new Set(guide.episodes.map((episode) => episode.contentId))
  const missing = guide.seasons.filter((season) => !stocked.has(season.contentId))
  if (!missing.length) return
  const show = series || (await Content.findById(guide.seriesId))
  if (!show?.tmdbId) return
  const { episodes } = await unifiedContentService.getTvShowSeasonData(show)
  const placed = await loadWorksById(guide.seasons.map((season) => season.contentId))
  const siblings = [...placed.values()]
  for (const season of missing) {
    const row = placed.get(season.contentId)
    if (!row) continue
    for (const episode of tmdbEpisodesForSeason(row, siblings, episodes)) {
      guide.episodes.push({
        ...episode,
        seasonNumber: season.seasonNumber,
        episodeNumber: episode.number,
        contentId: season.contentId,
      })
    }
  }
}

/**
 * The season guide for a page, from the database only: the stored guide when it is
 * complete, else the one the refresh job built (queued when missing or stale), else
 * whatever is stored.
 * @param {object} content
 * @returns {Promise<{ seriesId: string, currentSeason: number | null, episodes: object[], seasons: object[] }>}
 */
export async function getSeasonGuide(content) {
  const id = String(content._id)
  const empty = { seriesId: id, currentSeason: null, episodes: [], seasons: [] }
  if (content.contentType !== 'tv' && content.contentType !== 'season') return empty

  const seriesId = content.contentType === 'season' ? content.seriesId : id
  const stored = await storedGuide(seriesId)
  const own = stored && {
    ...stored,
    currentSeason: stored.seasons.find((season) => season.contentId === id)?.seasonNumber ?? null,
  }
  if (!(await guideNeedsBuild(content, stored))) return own || empty

  const built = await readCache('episode_guide', id)
  const staleMs = content.malStatus === 'currently_airing' ? AIRING_GUIDE_STALE_MS : GUIDE_STALE_MS
  if (isStale(built, staleMs)) await requestRefresh('episode_guide', id)
  return built?.data || own || empty
}

/**
 * Whether a title's guide must be built from TMDB/MAL (by `refreshSeasonGuide`)
 * rather than read from the stored seasons and episodes.
 * @param {object} content
 * @param {object | null} [stored] - The stored guide, when already loaded.
 * @returns {Promise<boolean>}
 */
export async function guideNeedsBuild(content, stored) {
  if (content.contentType !== 'tv' && content.contentType !== 'season') return false
  const guide =
    stored === undefined
      ? await storedGuide(content.contentType === 'season' ? content.seriesId : String(content._id))
      : stored
  if (guide) return needsTmdbFill(guide, content)
  return content.contentType !== 'season'
}

/**
 * Whether a stored guide has seasons without episodes that TMDB could fill.
 * @param {object} guide
 * @param {object} content
 * @returns {Promise<boolean>}
 */
async function needsTmdbFill(guide, content) {
  const stocked = new Set(guide.episodes.map((episode) => episode.contentId))
  if (guide.seasons.every((season) => stocked.has(season.contentId))) return false
  const show = content.contentType === 'season' ? await Content.findById(guide.seriesId) : content
  return Boolean(show?.tmdbId)
}

/**
 * Build a title's guide (calling TMDB/MAL where needed) and store it for pages. Run
 * by the refresh job.
 * @param {string} contentId
 * @returns {Promise<void>}
 */
export async function refreshSeasonGuide(contentId) {
  const content = await Content.findById(contentId)
  if (!content) return
  await writeCache('episode_guide', contentId, await buildSeasonGuide(content))
}

/**
 * Episodes, seasons, and which season `content` is. A season row or a series gets its
 * show's stored guide with its own season selected. Before the series migration a
 * row that is one season of a TMDB show (e.g. MAL's "Season 2") gets that show's
 * guide built live from TMDB; otherwise the row's own episodes. Calls TMDB/MAL, so
 * only background work uses it (pages read `getSeasonGuide`).
 * @param {object} content
 * @returns {Promise<{ seriesId: string, currentSeason: number | null, episodes: object[], seasons: object[] }>}
 */
export async function buildSeasonGuide(content) {
  const id = String(content._id)
  const empty = { seriesId: id, currentSeason: null, episodes: [], seasons: [] }
  if (content.contentType !== 'tv' && content.contentType !== 'season') return empty

  const currentIn = (guide) =>
    guide.seasons.find((season) => season.contentId === id)?.seasonNumber ?? null

  const seriesId = content.contentType === 'season' ? content.seriesId : id
  const stored = await storedGuide(seriesId)
  if (stored) {
    await fillFromTmdb(stored, content.contentType === 'season' ? null : content)
    return { ...stored, currentSeason: currentIn(stored) }
  }
  if (content.contentType === 'season') return empty

  if (content.tmdbId) {
    const guide = await buildGuide(content)
    return { ...guide, currentSeason: currentIn(guide) }
  }

  for (const anchor of await anchorCandidates(content)) {
    const guide = await buildGuide(anchor)
    const currentSeason = currentIn(guide)
    if (currentSeason != null) return { ...guide, currentSeason }
  }

  const { episodes } = await unifiedContentService.getTvShowSeasonData(content)
  return { ...empty, episodes }
}

/**
 * The catalog row and guide numbers for an episode TMDB numbers on `content`'s
 * show (TMDB's next-episode fields). For anime TMDB lists as one long season,
 * TMDB's "S1E50" of The Apothecary Diaries is episode 2 of the Season 3 row.
 * @param {object} content - TMDB-backed series row
 * @param {number} season - TMDB season number
 * @param {number} episode - TMDB episode number
 * @returns {Promise<{ contentId: string, seasonNumber: number, episodeNumber: number } | null>}
 *   null when the guide has no such episode.
 */
export async function resolveTmdbEpisode(content, season, episode) {
  const guide = await buildSeasonGuide(content)
  const match = guide.episodes.find(
    (card) =>
      (card.tmdbSeasonNumber ?? card.seasonNumber) === season &&
      (card.tmdbEpisodeNumber ?? card.episodeNumber) === episode,
  )
  if (!match) return null
  const own = guide.seasons.find((entry) => entry.seasonNumber === match.seasonNumber)
  return {
    contentId: own?.contentId || String(content._id),
    seasonNumber: match.seasonNumber,
    episodeNumber: match.episodeNumber,
  }
}
