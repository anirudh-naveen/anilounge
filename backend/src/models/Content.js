/**
 * Watchable catalog rows (movie / series / special) over the content supertype.
 */
import crypto from 'crypto'
import { query } from '../../config/postgres.js'
import { asId } from '../db/ids.js'
import {
  WATCHABLE_TABLES,
  airingFromMalStatus,
  contentTypeFromKind,
  kindFromContentType,
  malStatusFromAiring,
} from '../db/kinds.js'
import { compileMongoFilter, compileSort, escapeLike } from '../db/mongoFilter.js'
import { DocQuery } from '../db/query.js'
import { applyAdminOverrides, readEditableFields } from '../utils/adminContent.js'
import { seriesEntryCounts } from '../utils/episodes.js'
import { planSyncChanges } from '../utils/syncReview.js'
import { recordSyncNotices } from '../services/syncGuard.js'
import catalogEvents from '../services/catalogEvents.js'

/**
 * @param {object} row
 * @returns {object}
 */
export function mapContentRow(row) {
  if (!row) return null
  const userRatingCount = Number(row.user_rating_count || 0)
  const userRatingSum = Number(row.user_rating_sum || 0)
  return {
    _id: row.id,
    id: row.id,
    title: row.title || row.name,
    englishTitle: row.english_title || row.name,
    nativeTitle: row.native_title || row.native_name,
    originalTitle: row.original_title,
    overview: row.overview || row.about,
    tagline: row.tagline,
    contentType: row.content_type || contentTypeFromKind(row.kind),
    posterPath: row.poster_path || row.image_path,
    backdropPath: row.backdrop_path,
    releaseDate: row.release_date,
    runtime: row.runtime != null ? Number(row.runtime) : null,
    episodeCount: row.episode_count != null ? Number(row.episode_count) : null,
    seasonCount: row.season_count != null ? Number(row.season_count) : null,
    tmdbId: row.tmdb_id != null ? Number(row.tmdb_id) : null,
    malId: row.mal_id != null ? Number(row.mal_id) : null,
    anilistId: row.anilist_id != null ? Number(row.anilist_id) : null,
    voteAverage: row.vote_average != null ? Number(row.vote_average) : null,
    voteCount: row.vote_count != null ? Number(row.vote_count) : null,
    popularity: row.popularity != null ? Number(row.popularity) : null,
    unifiedScore: row.unified_score != null ? Number(row.unified_score) : null,
    userRatingAverage: row.user_rating_average != null ? Number(row.user_rating_average) : null,
    userRatingCount,
    userRatingSum,
    malScore: row.mal_score != null ? Number(row.mal_score) : null,
    malScoredBy: row.mal_votes != null ? Number(row.mal_votes) : null,
    malEpisodes: row.episode_count != null ? Number(row.episode_count) : null,
    malStatus: malStatusFromAiring(row.airing_status),
    broadcastDay: row.broadcast_day,
    nextEpisodeAirDate: row.next_episode_at,
    nextEpisodeNumber: row.next_episode_number != null ? Number(row.next_episode_number) : null,
    nextEpisodeSeason: row.next_episode_season != null ? Number(row.next_episode_season) : null,
    startSeasonYear: row.start_year != null ? Number(row.start_year) : null,
    startSeason: row.start_season,
    seriesId: row.series_id ? String(row.series_id) : null,
    seasonNumber: row.season_number != null ? Number(row.season_number) : null,
    partNumber: row.part_number != null ? Number(row.part_number) : null,
    seasonLabel: row.season_label || null,
    format: row.format || null,
    tmdbSeasonNumber: row.tmdb_season_number != null ? Number(row.tmdb_season_number) : null,
    tmdbEpisodeOffset: row.tmdb_episode_offset != null ? Number(row.tmdb_episode_offset) : 0,
    endDate: row.end_date || null,
    episodeRuntime:
      row.content_type === 'season' && row.runtime != null ? Number(row.runtime) : null,
    broadcastTime: row.broadcast_time || null,
    malRank: row.mal_rank != null ? Number(row.mal_rank) : null,
    anilistScore: row.anilist_score != null ? Number(row.anilist_score) : null,
    trailer: row.trailer_key ? { site: row.trailer_site, key: row.trailer_key } : null,
    bannerPath: row.banner_path || null,
    coverColor: row.cover_color || null,
    ageRating: row.age_rating || null,
    sourceMaterial: row.source_material || null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    lastUpdated: row.updated_at,
    genres: [],
    studios: [],
    originCountries: row.origin_country ? [row.origin_country] : [],
    alternativeTitles: [],
    franchise: null,
    franchiseId: null,
    franchiseNicknames: [],
    franchiseRating: null,
    relationships: { sequels: [], prequels: [], related: [], franchise: null },
  }
}

/**
 * Rows grouped by `String(row[key])`.
 * @param {object[]} rows
 * @param {string} key
 * @returns {Map<string, object[]>}
 */
export function groupBy(rows, key) {
  const map = new Map()
  for (const row of rows) {
    const id = String(row[key])
    if (!map.has(id)) map.set(id, [])
    map.get(id).push(row)
  }
  return map
}

/**
 * `doc` cut down to the space-separated `select` fields (plus its id), as a populate
 * `select` asks; the whole doc when there is no selection.
 * @param {object | null | undefined} doc
 * @param {string | null | undefined} select
 * @returns {object | null}
 */
export function pick(doc, select) {
  if (!doc) return null
  if (!select || typeof select !== 'string') return doc
  const out = { _id: doc._id || doc.id, id: doc._id || doc.id }
  for (const field of select.split(/\s+/).filter(Boolean)) out[field] = doc[field]
  return out
}

/**
 * @param {object[]} docs
 * @returns {Promise<object[]>}
 */
export async function attachContentRelations(docs) {
  if (!docs.length) return docs
  const ids = docs.map((doc) => doc._id)
  const [genres, alts, studios, members, relations] = await Promise.all([
    query(
      `SELECT cg.content_id, g.name
       FROM content_genres cg
       JOIN genres g ON g.id = cg.genre_id
       WHERE cg.content_id = ANY($1::uuid[])`,
      [ids],
    ),
    query('SELECT content_id, name FROM content_akas WHERE content_id = ANY($1::uuid[])', [ids]),
    // Main animation studio first, then other animation studios, then the rest.
    query(
      `SELECT sc.work_id AS content_id, st.id AS studio_id, st.name, st.image_path, sc.role,
              sc.is_main
       FROM studio_credits sc
       JOIN content st ON st.id = sc.studio_id
       WHERE sc.work_id = ANY($1::uuid[])
       ORDER BY sc.is_main DESC, (sc.role = 'animation') DESC NULLS LAST, st.name`,
      [ids],
    ),
    // Each title's franchise with its nicknames and rating: the average unified score
    // of its series (each the average of its seasons), or of all its titles when it
    // has no series, to the tenth.
    query(
      `WITH m AS (
         -- A season is in its series' franchise.
         SELECT t.id AS member_id, fm.franchise_id
         FROM unnest($1::uuid[]) AS t(id)
         LEFT JOIN seasons sn ON sn.content_id = t.id
         JOIN franchise_members fm ON fm.member_id = COALESCE(sn.series_id, t.id)
       ), scored AS (
         SELECT fm.franchise_id, c.kind,
                COALESCE(mv.unified_score, s.unified_score, sp.unified_score) AS score
         FROM franchise_members fm
         JOIN content c ON c.id = fm.member_id
         LEFT JOIN movies mv ON mv.content_id = c.id
         LEFT JOIN series s ON s.content_id = c.id
         LEFT JOIN specials sp ON sp.content_id = c.id
         WHERE fm.franchise_id IN (SELECT franchise_id FROM m)
       ), rated AS (
         SELECT franchise_id,
                COALESCE(avg(score) FILTER (WHERE kind = 'series'), avg(score)) AS rating
         FROM scored WHERE score > 0 GROUP BY franchise_id
       )
       SELECT m.member_id AS content_id, f.id AS franchise_id, f.name, round(r.rating::numeric, 1) AS rating,
              (SELECT array_agg(k.name ORDER BY k.name) FROM content_akas k
               WHERE k.content_id = f.id) AS nicknames
       FROM m
       JOIN content f ON f.id = m.franchise_id
       LEFT JOIN rated r ON r.franchise_id = m.franchise_id`,
      [ids],
    ),
    query(
      `SELECT from_id, to_id, kind FROM content_relations
       WHERE from_id = ANY($1::uuid[])`,
      [ids],
    ),
  ])

  const byGenre = groupBy(genres.rows, 'content_id')
  const byAlt = groupBy(alts.rows, 'content_id')
  const byStudio = groupBy(studios.rows, 'content_id')
  const franchiseById = new Map(members.rows.map((row) => [String(row.content_id), row]))
  const relByFrom = groupBy(relations.rows, 'from_id')

  for (const doc of docs) {
    const id = String(doc._id)
    doc.genres = (byGenre.get(id) || []).map((row) => ({ name: row.name }))
    doc.alternativeTitles = (byAlt.get(id) || []).map((row) => row.name)
    doc.studios = (byStudio.get(id) || []).map((row) => row.name)
    doc.studioEntities = (byStudio.get(id) || []).map((row) => ({
      _id: String(row.studio_id),
      name: row.name,
      imagePath: row.image_path || '',
    }))
    // Empty when the roles aren't known (TMDB-only titles): pages then show every credit.
    doc.animationStudios = (byStudio.get(id) || [])
      .filter((row) => row.role === 'animation')
      .map((row) => row.name)
    const franchise = franchiseById.get(id)
    doc.franchise = franchise?.name || null
    doc.franchiseId = franchise ? String(franchise.franchise_id) : null
    // Not saved with the title: search matches a franchise's nicknames on its members.
    doc.franchiseNicknames = franchise?.nicknames || []
    doc.franchiseRating = franchise?.rating != null ? Number(franchise.rating) : null
    const edges = relByFrom.get(id) || []
    doc.relationships = {
      sequels: edges.filter((row) => row.kind === 'sequel').map((row) => String(row.to_id)),
      prequels: edges.filter((row) => row.kind === 'prequel').map((row) => String(row.to_id)),
      related: edges
        .filter((row) => row.kind !== 'sequel' && row.kind !== 'prequel')
        .map((row) => String(row.to_id)),
      franchise: doc.franchise,
    }
    doc.displayTitle = doc.englishTitle || doc.title || doc.nativeTitle || doc.originalTitle
  }
  return docs
}

/**
 * Watchables by id, with genres, studios, and relations attached.
 * @param {string[]} ids
 * @returns {Promise<Map<string, object>>} id -> plain content object
 */
export async function loadWorksById(ids) {
  if (!ids.length) return new Map()
  const { rows } = await query('SELECT * FROM works WHERE id = ANY($1::uuid[])', [ids])
  const contents = await attachContentRelations(rows.map(mapContentRow))
  return new Map(contents.map((item) => [String(item._id), item]))
}

async function fetchContent(filter, options = {}) {
  const compiled = compileMongoFilter(filter, 'content')
  const order = compileSort(options.sort, 'content')
  let sql = `SELECT c.* FROM works c WHERE ${compiled.sql} ORDER BY ${order}`
  const params = [...compiled.params]
  if (options.limit != null) {
    params.push(Number(options.limit))
    sql += ` LIMIT $${params.length}`
  }
  if (options.skip) {
    params.push(Number(options.skip))
    sql += ` OFFSET $${params.length}`
  }
  const { rows } = await query(sql, params)
  const docs = await attachContentRelations(rows.map(mapContentRow))
  return docs.map((plain) => new Content(plain, { fromDb: true }))
}

/**
 * @param {object} data
 * @param {{ fromDb?: boolean }} [options]
 */
function Content(data = {}, options = {}) {
  Object.assign(this, {
    genres: [],
    studios: [],
    originCountries: [],
    alternativeTitles: [],
    relationships: { sequels: [], prequels: [], related: [] },
    userRatingCount: 0,
    userRatingSum: 0,
    ...data,
  })
  if (!this._id) this._id = data.id || crypto.randomUUID()
  this.id = this._id
  this.$isNew = options.fromDb ? false : true
}

Content.prototype.toJSON = function toJSON() {
  const { $isNew, password, ...rest } = this
  return { ...rest, _id: this._id, id: this._id }
}

Content.prototype.toObject = function toObject() {
  return this.toJSON()
}

/**
 * Admin-set field values for a content row (`content.admin_overrides`), or `{}`.
 * A database without the column yet (schema not applied) has no overrides.
 * @param {string} id
 * @returns {Promise<Record<string, unknown>>}
 */
export async function loadAdminOverrides(id) {
  try {
    const { rows } = await query('SELECT admin_overrides FROM content WHERE id = $1', [id])
    return rows[0]?.admin_overrides || {}
  } catch (error) {
    if (error.code === '42703') return {}
    throw error
  }
}

/**
 * Watchlist writes cap progress at a series' last episode and season
 * (services/watchlistWrites.js `progressLimits`), but only on the row's next write.
 * When a series' counts shrink (a MAL season that had TMDB's whole-show total), pull
 * every row past the end back to it, whatever its status. `updated_at` is left alone so
 * friends' home feeds don't report the correction as watching, and watch history
 * keeps what was logged.
 * @param {{ contentIds?: string[] }} [scope] - Only these series; every series when omitted.
 * @param {{ dryRun?: boolean }} [options] - Count the rows without changing them.
 * @returns {Promise<number>} Rows clamped (or that would be).
 */
export async function clampWatchlistProgress({ contentIds } = {}, { dryRun = false } = {}) {
  const where = `s.content_id = w.content_id AND s.episode_count > 0
    AND (w.current_episode > s.episode_count
         OR w.current_season > GREATEST(COALESCE(s.season_count, 1), 1))
    ${contentIds ? 'AND w.content_id = ANY($1::uuid[])' : ''}`
  const params = contentIds ? [contentIds] : []
  if (dryRun) {
    const { rows } = await query(
      `SELECT count(*)::int AS n FROM watchlist w, series s WHERE ${where}`,
      params,
    )
    return rows[0].n
  }
  const result = await query(
    `UPDATE watchlist w SET
       current_episode = LEAST(w.current_episode, s.episode_count),
       previous_episode = LEAST(w.previous_episode, s.episode_count),
       current_season = LEAST(w.current_season, GREATEST(COALESCE(s.season_count, 1), 1))
     FROM series s WHERE ${where}`,
    params,
  )
  return result.rowCount || 0
}

/**
 * Store recomputed unified scores alone, without the full rewrite `save` does (after a
 * community rating changes, say). Triggers on the subtype tables keep
 * `content.catalog_score` in step.
 * @param {Array<{ id: string, kind: string, score: number | null }>} rows
 * @returns {Promise<void>}
 */
export async function saveUnifiedScores(rows) {
  for (const [kind, table] of Object.entries(WATCHABLE_TABLES)) {
    const list = rows.filter((row) => row.kind === kind)
    if (!list.length) continue
    await query(
      `UPDATE ${table} t SET unified_score = u.score
       FROM unnest($1::uuid[], $2::float8[]) AS u(id, score)
       WHERE t.content_id = u.id`,
      [list.map((row) => row.id), list.map((row) => row.score ?? null)],
    )
  }
}

/**
 * Catalog totals by source and type, in one scan.
 * @returns {Promise<{ totalContent: number, tmdbOnlyContent: number, malOnlyContent: number,
 *   mergedContent: number, movies: number, tvShows: number, specials: number }>}
 */
export async function catalogStats() {
  const { rows } = await query(
    `SELECT count(*)::int AS "totalContent",
            count(*) FILTER (WHERE tmdb_id IS NOT NULL AND mal_id IS NULL)::int AS "tmdbOnlyContent",
            count(*) FILTER (WHERE mal_id IS NOT NULL AND tmdb_id IS NULL)::int AS "malOnlyContent",
            count(*) FILTER (WHERE tmdb_id IS NOT NULL AND mal_id IS NOT NULL)::int AS "mergedContent",
            count(*) FILTER (WHERE kind = 'movie')::int AS movies,
            count(*) FILTER (WHERE kind = 'series')::int AS "tvShows",
            count(*) FILTER (WHERE kind = 'special')::int AS specials
     FROM content WHERE kind IN ('movie', 'series', 'season', 'special')`,
  )
  return rows[0]
}

/**
 * Never blank an existing row's editorial values, and log sync changes (and changes
 * blocked by admin locks) for the admin page; see utils/syncReview.js. New rows and
 * fields in `doc.$acceptFields` (an admin taking a blocked value) pass through.
 * @param {object} doc - Content document (mutated).
 * @param {string} kind
 * @param {Record<string, unknown>} overrides - Admin-locked fields.
 * @param {Record<string, unknown>} incoming - The caller's values before locks were applied.
 * @returns {Promise<void>}
 */
async function protectExistingValues(doc, kind, overrides, incoming) {
  const { rows } = await query('SELECT * FROM works WHERE id = $1', [doc._id])
  const row = rows[0]
  if (!row || row.kind !== kind) return
  const plan = planSyncChanges({
    kind,
    current: readEditableFields(mapContentRow(row), kind),
    incoming,
    locked: Object.keys(overrides),
    accepted: doc.$acceptFields || [],
  })
  applyAdminOverrides(doc, plan.keep, kind)
  await recordSyncNotices(doc._id, plan.notices)
}

/**
 * The episode that aired since the last save: the stored "next episode" is in the past
 * and the incoming schedule has moved on from it (or the title is no longer a series).
 * @param {{ next_episode_at: Date | null, next_episode_number: number | null, next_episode_season: number | null } | undefined} before
 * @param {{ nextEpisodeAirDate?: unknown, nextEpisodeNumber?: number | null, nextEpisodeSeason?: number | null } | null} after
 * @param {number} [now]
 * @returns {{ season: number | null, episode: number, airedAt: Date } | null}
 */
export function airedEpisode(before, after, now = Date.now()) {
  if (!before?.next_episode_at || before.next_episode_number == null) return null
  const airedAt = new Date(before.next_episode_at)
  if (!(airedAt.getTime() <= now)) return null
  const episode = Number(before.next_episode_number)
  const season = before.next_episode_season != null ? Number(before.next_episode_season) : null
  if (after) {
    const nextAt = after.nextEpisodeAirDate ? new Date(after.nextEpisodeAirDate).getTime() : null
    const unchanged =
      nextAt === airedAt.getTime() &&
      (after.nextEpisodeNumber ?? null) === episode &&
      (after.nextEpisodeSeason ?? season) === season
    if (unchanged) return null
  }
  return { season, episode, airedAt }
}

/**
 * Write the document. `clampProgress: false` leaves watchlist progress alone even when
 * a series' counts shrink, and `quiet: true` skips the title-added / episode-aired
 * events (release megathreads, pushes); the series migration must not touch users'
 * lists or the forum.
 * @param {{ clampProgress?: boolean, quiet?: boolean }} [options]
 * @returns {Promise<Content>}
 */
Content.prototype.save = async function save({ clampProgress = true, quiet = false } = {}) {
  const id = this._id
  const kind = kindFromContentType(this.contentType)
  // Admin edits win over whatever the catalog sync put on this document.
  // What the caller (usually the sync) wants, before admin locks replace it.
  const incoming = readEditableFields(this, kind)
  const overrides = await loadAdminOverrides(id)
  applyAdminOverrides(this, overrides, kind)
  await protectExistingValues(this, kind, overrides, incoming)
  if (kind === 'series') {
    // A MAL season merged with TMDB's whole show keeps its own counts (admin values win).
    const counts = seriesEntryCounts(this)
    if (!('episodeCount' in overrides)) this.episodeCount = counts.episodeCount
    if (!('seasonCount' in overrides)) this.seasonCount = counts.seasonCount
  }
  const name = this.englishTitle || this.title || 'Untitled'
  const { rowCount, rows: saved } = await query(
    `INSERT INTO content (id, kind, name, native_name, about, image_path, mal_id, tmdb_id, anilist_id, created_at, updated_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9, COALESCE((SELECT created_at FROM content WHERE id=$1), now()), now())
     ON CONFLICT (id) DO UPDATE SET
       kind = EXCLUDED.kind,
       name = EXCLUDED.name,
       native_name = EXCLUDED.native_name,
       about = EXCLUDED.about,
       image_path = EXCLUDED.image_path,
       mal_id = EXCLUDED.mal_id,
       tmdb_id = EXCLUDED.tmdb_id,
       anilist_id = EXCLUDED.anilist_id,
       updated_at = now()
     WHERE content.kind IN ('movie', 'series', 'season', 'special')
     RETURNING (xmax = 0) AS inserted`,
    [
      id,
      kind,
      name,
      this.nativeTitle || null,
      this.overview || null,
      this.posterPath || null,
      this.malId ?? null,
      this.tmdbId ?? null,
      this.anilistId ?? null,
    ],
  )
  if (!rowCount) {
    throw new Error(`Refusing to save ${kind} ${id}: id belongs to a non-watchable content row`)
  }

  const { rows: previous } = await query(
    'SELECT next_episode_at, next_episode_number, next_episode_season FROM works WHERE id = $1',
    [id],
  )
  // A row that changed kind drops its old subtype row; its own is updated in place,
  // since deleting a series row would also delete its seasons and their episodes.
  for (const [other, table] of Object.entries(WATCHABLE_TABLES)) {
    if (other !== kind) await query(`DELETE FROM ${table} WHERE content_id = $1`, [id])
  }
  await upsertSubtype(WATCHABLE_TABLES[kind], id, subtypeColumns(this, kind))

  await replaceChildren(this)
  if (kind === 'series' && clampProgress) await clampWatchlistProgress({ contentIds: [String(id)] })
  this.$isNew = false
  if (quiet) return this
  if (saved[0]?.inserted) catalogEvents.emit('title-added', String(id))
  const airs = kind === 'series' || kind === 'season'
  const aired = airedEpisode(previous[0], airs ? this : null)
  if (aired) catalogEvents.emit('episode-aired', { contentId: String(id), ...aired })
  return this
}

/**
 * Subtype-table columns for a watchable document of `kind`.
 * @param {object} doc
 * @param {'movie' | 'series' | 'season' | 'special'} kind
 * @returns {Record<string, unknown>}
 */
export function subtypeColumns(doc, kind) {
  const origin = (doc.originCountries || []).map(String).find((code) => code.length === 2) || null
  const columns = {
    original_title: doc.originalTitle || doc.nativeTitle || null,
    backdrop_path: doc.backdropPath || null,
    release_date: doc.releaseDate || null,
    origin_country: origin ? origin.toUpperCase() : null,
    tmdb_score: doc.voteAverage ?? null,
    tmdb_votes: doc.voteCount ?? null,
    mal_score: doc.malScore ?? null,
    mal_votes: doc.malScoredBy ?? null,
    popularity: doc.popularity ?? null,
    unified_score: doc.unifiedScore ?? null,
    airing_status: airingFromMalStatus(doc.malStatus),
    trailer_site: doc.trailer?.site || null,
    trailer_key: doc.trailer?.key || null,
    banner_path: doc.bannerPath || null,
    cover_color: doc.coverColor || null,
    age_rating: doc.ageRating || null,
    source_material: doc.sourceMaterial || null,
  }
  if (kind !== 'season') columns.tagline = doc.tagline || null
  if (kind === 'movie' || kind === 'special') {
    columns.runtime_minutes = doc.runtime ?? null
  }
  const airing = {
    episode_count: doc.episodeCount ?? null,
    start_season: doc.startSeason || null,
    start_year: doc.startSeasonYear ?? null,
    broadcast_day: doc.broadcastDay || null,
    next_episode_at: doc.nextEpisodeAirDate || null,
    next_episode_number: doc.nextEpisodeNumber ?? null,
  }
  if (kind === 'series') {
    Object.assign(columns, airing, {
      season_count: doc.seasonCount ?? null,
      next_episode_season: doc.nextEpisodeSeason ?? null,
    })
  }
  if (kind === 'season') {
    if (!doc.seriesId || !positiveInt(doc.seasonNumber)) {
      throw new Error(`Season ${doc._id} needs a seriesId and seasonNumber`)
    }
    Object.assign(columns, airing, {
      series_id: doc.seriesId,
      season_number: doc.seasonNumber,
      part_number: positiveInt(doc.partNumber) || 1,
      label: doc.seasonLabel || null,
      format: doc.format || null,
      tmdb_season_number: doc.tmdbSeasonNumber ?? null,
      tmdb_episode_offset: doc.tmdbEpisodeOffset ?? 0,
      end_date: doc.endDate || null,
      episode_runtime: doc.episodeRuntime ?? null,
      broadcast_time: doc.broadcastTime || null,
      mal_rank: doc.malRank ?? null,
      anilist_score: doc.anilistScore ?? null,
    })
  }
  return columns
}

/**
 * Insert or update one subtype row.
 * @param {string} table
 * @param {string} id
 * @param {Record<string, unknown>} columns
 * @returns {Promise<void>}
 */
async function upsertSubtype(table, id, columns) {
  const names = Object.keys(columns)
  await query(
    `INSERT INTO ${table} (content_id, ${names.join(', ')})
     VALUES ($1, ${names.map((_, index) => `$${index + 2}`).join(', ')})
     ON CONFLICT (content_id) DO UPDATE SET
       ${names.map((name) => `${name} = EXCLUDED.${name}`).join(', ')}`,
    [id, ...Object.values(columns)],
  )
}

/**
 * What a studio did on a title, from its source ref: AniList says whether it is an
 * animation studio (`animation` / `isAnimationStudio`) and the main one (`isMain`); MAL
 * refs (`malId`) are animation studios; TMDB companies have no role.
 * @param {{ role?: string, animation?: boolean, isMain?: boolean, malId?: number } | undefined} ref
 * @returns {{ role: 'animation' | 'production' | null, isMain: boolean }}
 */
export function studioRole(ref) {
  let role = ref?.role === 'animation' || ref?.role === 'production' ? ref.role : null
  if (!role && typeof ref?.animation === 'boolean')
    role = ref.animation ? 'animation' : 'production'
  if (!role && ref?.malId) role = 'animation'
  return { role, isMain: role === 'animation' && Boolean(ref?.isMain) }
}

async function upsertGenre(name) {
  const existing = await query('SELECT id FROM genres WHERE lower(name) = lower($1)', [name])
  if (existing.rows[0]) return existing.rows[0].id
  const id = crypto.randomUUID()
  await query('INSERT INTO genres (id, name) VALUES ($1, $2) ON CONFLICT (name) DO NOTHING', [
    id,
    name,
  ])
  const again = await query('SELECT id FROM genres WHERE lower(name) = lower($1)', [name])
  return again.rows[0].id
}

function positiveInt(value) {
  const parsed = Number(value)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null
}

async function findStudio(where, value) {
  const { rows } = await query(
    `SELECT id, mal_id, tmdb_id, anilist_id, image_path FROM content
     WHERE kind = 'studio' AND ${where}
     ORDER BY (mal_id IS NOT NULL) DESC, created_at
     LIMIT 1`,
    [value],
  )
  return rows[0] || null
}

/**
 * Studio row for a credit: MAL producer id, AniList studio id, TMDB company id,
 * then name or alias. A studio whose id for the same source differs is never
 * matched by name. Missing external ids and logo are filled when no other
 * studio already owns them.
 * @param {string} name
 * @param {{ malId?: number, anilistId?: number, tmdbId?: number, imagePath?: string }} [ref]
 * @returns {Promise<string>}
 */
async function upsertStudio(name, ref = {}) {
  const malId = positiveInt(ref.malId)
  const anilistId = positiveInt(ref.anilistId)
  const tmdbId = positiveInt(ref.tmdbId)
  const imagePath = ref.imagePath || null
  let row = null
  if (malId) row = await findStudio('mal_id = $1', malId)
  if (!row && anilistId) row = await findStudio('anilist_id = $1', anilistId)
  if (!row && tmdbId) row = await findStudio('tmdb_id = $1', tmdbId)
  if (!row) {
    const { rows } = await query(
      `SELECT id, mal_id, tmdb_id, anilist_id, image_path FROM content s
       WHERE s.kind = 'studio'
         AND (lower(s.name) = lower($1)
              OR EXISTS (SELECT 1 FROM content_akas k WHERE k.content_id = s.id AND lower(k.name) = lower($1)))
         AND ($2::int IS NULL OR s.mal_id IS NULL OR s.mal_id = $2)
         AND ($3::int IS NULL OR s.anilist_id IS NULL OR s.anilist_id = $3)
         AND ($4::int IS NULL OR s.tmdb_id IS NULL OR s.tmdb_id = $4)
       ORDER BY (lower(s.name) = lower($1)) DESC, (s.mal_id IS NOT NULL) DESC, s.created_at
       LIMIT 1`,
      [name, malId, anilistId, tmdbId],
    )
    row = rows[0] || null
  }

  if (!row) {
    const id = crypto.randomUUID()
    await query(
      `INSERT INTO content (id, kind, name, mal_id, tmdb_id, anilist_id, image_path)
       VALUES ($1, 'studio', $2, $3, $4, $5, $6)`,
      [id, name, malId, tmdbId, anilistId, imagePath],
    )
    await query('INSERT INTO studios (content_id) VALUES ($1)', [id])
    return id
  }

  await query('INSERT INTO studios (content_id) VALUES ($1) ON CONFLICT DO NOTHING', [row.id])
  const fills = [
    ['mal_id', malId, row.mal_id == null],
    ['anilist_id', anilistId, row.anilist_id == null],
    ['tmdb_id', tmdbId, row.tmdb_id == null],
  ]
  for (const [column, value, missing] of fills) {
    if (!value || !missing) continue
    await query(
      `UPDATE content SET ${column} = $2, updated_at = now()
       WHERE id = $1 AND ${column} IS NULL
         AND NOT EXISTS (SELECT 1 FROM content o WHERE o.kind = 'studio' AND o.${column} = $2)`,
      [row.id, value],
    )
  }
  if (imagePath && !row.image_path) {
    await query(
      `UPDATE content SET image_path = $2, updated_at = now()
       WHERE id = $1 AND (image_path IS NULL OR image_path = '')`,
      [row.id, imagePath],
    )
  }
  return row.id
}

async function upsertFranchise(name) {
  const existing = await query(`SELECT id FROM content WHERE kind = 'franchise' AND name = $1`, [
    name,
  ])
  if (existing.rows[0]) {
    await query('INSERT INTO franchises (content_id) VALUES ($1) ON CONFLICT DO NOTHING', [
      existing.rows[0].id,
    ])
    return existing.rows[0].id
  }
  const id = crypto.randomUUID()
  await query(`INSERT INTO content (id, kind, name) VALUES ($1, 'franchise', $2)`, [id, name])
  await query('INSERT INTO franchises (content_id) VALUES ($1)', [id])
  return id
}

/**
 * Whether the work already belongs to a franchise row with this name.
 * @param {string} workId
 * @param {string} name
 * @returns {Promise<boolean>}
 */
async function isCurrentFranchise(workId, name) {
  const { rows } = await query(
    `SELECT 1 FROM franchise_members fm
     JOIN content f ON f.id = fm.franchise_id
     WHERE fm.member_id = $1 AND f.name = $2`,
    [workId, name],
  )
  return rows.length > 0
}

async function replaceChildren(doc) {
  const id = doc._id
  // An empty list from the sync means "unknown", not "none": keep what the row has.
  const hasGenres = (doc.genres || []).some((genre) =>
    typeof genre === 'string' ? genre : genre?.name,
  )
  const hasAkas = (doc.alternativeTitles || []).some(Boolean)
  const hasStudios = [...(doc.studios || []), ...(doc.productionCompanies || [])].some(Boolean)
  // A season belongs to a franchise through its series, never as a member itself.
  const seasonRow = kindFromContentType(doc.contentType) === 'season'
  let franchiseName = seasonRow ? null : doc.franchise || doc.relationships?.franchise
  if (franchiseName && (await isCurrentFranchise(id, franchiseName))) {
    // Loaded docs echo their franchise's name back. If that row was renamed under
    // us (e.g. clobbered by a person save), re-upserting by name would mint a new
    // franchise with the bad name and strand the title there.
    franchiseName = null
  }
  if (hasGenres) await query('DELETE FROM content_genres WHERE content_id = $1', [id])
  if (hasAkas) await query('DELETE FROM content_akas WHERE content_id = $1', [id])
  if (franchiseName) await query('DELETE FROM franchise_members WHERE member_id = $1', [id])

  for (const genre of doc.genres || []) {
    const name = typeof genre === 'string' ? genre : genre?.name
    if (!name) continue
    const genreId = await upsertGenre(name)
    await query(
      'INSERT INTO content_genres (content_id, genre_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
      [id, genreId],
    )
  }
  for (const title of [...new Set(doc.alternativeTitles || [])].filter(Boolean)) {
    await query(
      'INSERT INTO content_akas (content_id, name) VALUES ($1, $2) ON CONFLICT DO NOTHING',
      [id, title],
    )
  }
  const studioNames = [
    ...new Set(
      [...(doc.studios || []), ...(doc.productionCompanies || [])]
        .map((value) => (typeof value === 'string' ? value : value?.name))
        .filter(Boolean),
    ),
  ]
  const refsByName = new Map()
  for (const ref of doc.studioRefs || []) {
    if (!ref?.name) continue
    const key = ref.name.toLowerCase()
    refsByName.set(key, { ...ref, ...refsByName.get(key) })
  }
  const keptStudioIds = []
  for (const name of studioNames) {
    const ref = refsByName.get(name.toLowerCase())
    const studioId = await upsertStudio(name, ref)
    keptStudioIds.push(studioId)
    const { role, isMain } = studioRole(ref)
    await query(
      `INSERT INTO studio_credits (work_id, studio_id, role, is_main)
       SELECT $1, $2, $3, $4 WHERE NOT EXISTS (
         SELECT 1 FROM admin_link_removals r
         WHERE r.link_kind = 'studio_credit' AND r.work_id = $1 AND r.other_id = $2
       )
       ON CONFLICT (work_id, studio_id) DO UPDATE SET
         role = COALESCE(EXCLUDED.role, studio_credits.role),
         is_main = EXCLUDED.is_main OR (EXCLUDED.role IS NULL AND studio_credits.is_main)`,
      [id, studioId, role, isMain],
    )
  }
  // Credits are updated in place, so a save that doesn't know roles (a title loaded and
  // saved again) keeps them; only studios the title no longer lists are dropped.
  if (hasStudios) {
    await query(
      `DELETE FROM studio_credits
       WHERE work_id = $1 AND NOT admin_added AND studio_id <> ALL($2::uuid[])`,
      [id, keptStudioIds],
    )
  }

  if (franchiseName) {
    const franchiseId = await upsertFranchise(franchiseName)
    await query(
      'INSERT INTO franchise_members (franchise_id, member_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
      [franchiseId, id],
    )
  }

  const rel = doc.relationships || {}
  const hasRelations = [rel.sequels, rel.prequels, rel.related].some((list) => list?.length)
  if (doc.$replaceRelations && hasRelations) {
    await query('DELETE FROM content_relations WHERE from_id = $1', [id])
    const groups = [
      [rel.sequels, 'sequel'],
      [rel.prequels, 'prequel'],
      [rel.related, 'other'],
    ]
    for (const [list, kind] of groups) {
      for (const ref of list || []) {
        const toId = asId(ref)
        const resolved = await Content.findById(toId)
        if (!resolved || String(resolved._id) === String(id)) continue
        await query(
          `INSERT INTO content_relations (from_id, to_id, kind, source)
           VALUES ($1, $2, $3, 'mal') ON CONFLICT DO NOTHING`,
          [id, resolved._id, kind],
        )
      }
    }
  }
}

Content.find = function find(filter = {}) {
  return new DocQuery(async (q) => {
    const docs = await fetchContent(filter, { sort: q._sort, skip: q._skip, limit: q._limit })
    return q._lean ? docs.map((doc) => doc.toJSON()) : docs
  })
}

Content.findOne = function findOne(filter = {}) {
  return new DocQuery(async (q) => {
    const docs = await fetchContent(filter, { sort: q._sort, limit: 1 })
    const doc = docs[0] || null
    if (!doc) return null
    return q._lean ? doc.toJSON() : doc
  })
}

Content.findById = function findById(id) {
  if (!id) return new DocQuery(async () => null)
  return Content.findOne({ _id: String(id) })
}

/**
 * Ids of watchables whose name, native name, alternative title, original title,
 * overview, or franchise nickname contains `text` (case-insensitive). Each branch is a separate lookup so the
 * pg_trgm indexes in `db/schema.sql` serve it; one OR across the `works` view (whose
 * original title is a COALESCE over three tables) could only scan every title.
 * @param {string} text
 * @param {{ limit?: number }} [options]
 * @returns {Promise<string[]>}
 */
Content.searchIds = async function searchIds(text, { limit = 2000 } = {}) {
  const needle = String(text || '').trim()
  if (!needle) return []
  const pattern = `%${escapeLike(needle)}%`
  const { rows } = await query(
    `SELECT id FROM (
       SELECT id FROM content
       WHERE kind IN ('movie', 'series', 'season', 'special')
         AND (name ILIKE $1 OR native_name ILIKE $1 OR about ILIKE $1)
       UNION
       SELECT a.content_id FROM content_akas a
       JOIN content c ON c.id = a.content_id AND c.kind IN ('movie', 'series', 'season', 'special')
       WHERE a.name ILIKE $1
       UNION
       SELECT fm.member_id FROM content_akas a
       JOIN content f ON f.id = a.content_id AND f.kind = 'franchise'
       JOIN franchise_members fm ON fm.franchise_id = f.id
       JOIN content c ON c.id = fm.member_id AND c.kind IN ('movie', 'series', 'season', 'special')
       WHERE a.name ILIKE $1
       UNION
       SELECT content_id FROM movies WHERE original_title ILIKE $1
       UNION
       SELECT content_id FROM series WHERE original_title ILIKE $1
       UNION
       SELECT content_id FROM specials WHERE original_title ILIKE $1
     ) hits
     LIMIT $2`,
    [pattern, limit],
  )
  return rows.map((row) => String(row.id))
}

Content.countDocuments = async function countDocuments(filter = {}) {
  const compiled = compileMongoFilter(filter, 'content')
  const { rows } = await query(
    `SELECT count(*)::int AS n FROM works c WHERE ${compiled.sql}`,
    compiled.params,
  )
  return rows[0].n
}

Content.findByIdAndUpdate = async function findByIdAndUpdate(id, update) {
  const doc = await Content.findById(id)
  if (!doc) return null
  Object.assign(doc, update)
  await doc.save()
  return doc
}

Content.findByIdAndDelete = async function findByIdAndDelete(id) {
  const doc = await Content.findById(id)
  if (!doc) return null
  await query('DELETE FROM content WHERE id = $1', [doc._id])
  return doc
}

Content.deleteMany = async function deleteMany(filter = {}) {
  const compiled = compileMongoFilter(filter, 'content')
  const result = await query(
    `DELETE FROM content WHERE id IN (SELECT c.id FROM works c WHERE ${compiled.sql})`,
    compiled.params,
  )
  return { deletedCount: result.rowCount || 0 }
}

Content.updateMany = async function updateMany(filter = {}, update = {}) {
  const set = update.$set || update
  const docs = await fetchContent(filter)
  for (const doc of docs) {
    Object.assign(doc, set)
    await doc.save()
  }
  return { matchedCount: docs.length, modifiedCount: docs.length }
}

Content.aggregate = async function aggregate(pipeline = []) {
  const match = pipeline.find((stage) => stage.$match)?.$match || {}
  const sort = pipeline.find((stage) => stage.$sort)?.$sort
  const skip = pipeline.find((stage) => stage.$skip)?.$skip || 0
  const limit = pipeline.find((stage) => stage.$limit)?.$limit
  const docs = await fetchContent(match, { sort, skip, limit })
  return docs.map((doc) => doc.toJSON())
}

Content.create = async function create(data) {
  const doc = data instanceof Content ? data : new Content(data)
  await doc.save()
  return doc
}

export default Content
