/**
 * Catalog import: fetch each source's view of a title (AniList, MAL, TMDB), store it
 * (`content_source_data`), resolve the fields by source priority
 * (utils/sourcePriority.js), and write the title with its tags, key staff, and ids
 * on other sites. A series imports its seasons and their episodes first, then takes
 * its own scores and counts from them (a series' score is its seasons' average).
 *
 * Domain service used by the catalog sync, `npm run db:reload`, and
 * scripts/restructureSeries.js. Writes go through `Content.save`, so admin edits
 * still win and sync changes are logged.
 */
import crypto from 'crypto'
import { query } from '../../config/postgres.js'
import Content, { loadWorksById } from '../models/Content.js'
import { malStatusFromAiring } from '../db/kinds.js'
import unifiedContentService from './unifiedContentService.js'
import { fetchAnilistDetailsBatch } from './anilistService.js'
import { jikanGet } from './entityService.js'
import { calculateUnifiedScore } from '../utils/ratings.js'
import { isAnime, resolveFields } from '../utils/sourcePriority.js'
import {
  anilistSnapshot,
  compactSnapshot,
  malSnapshot,
  mergeEpisodes,
  tmdbSeasonSnapshot,
  tmdbSnapshot,
} from '../utils/sourceSnapshots.js'
import { fribbEntryFor, fribbTmdbPlacement } from '../utils/fribb.js'
import { loadFribbIndex } from './fribbService.js'
import { seasonRowName } from '../utils/seasonPlan.js'
import { uniqueTitles } from '../utils/titles.js'

/** Jikan lists 100 episodes a page; long shows (One Piece) need many pages. */
const MAX_JIKAN_EPISODE_PAGES = 15

/**
 * Each source's snapshot of a watchable. Seasons skip TMDB's show (their series
 * holds it); AniList is looked up by MAL id when the row has no AniList id.
 * @param {object} doc - Content document
 * @returns {Promise<{ snapshots: Record<string, object>, schedule: object[] }>}
 *   `schedule`: AniList airing times by episode.
 */
export async function fetchSnapshots(doc) {
  const snapshots = {}
  let schedule = []

  if (doc.anilistId || doc.malId) {
    const [media] = await fetchAnilistDetailsBatch(
      doc.anilistId ? { anilistIds: [doc.anilistId] } : { malIds: [doc.malId] },
    )
    if (media) {
      snapshots.anilist = compactSnapshot(anilistSnapshot(media))
      schedule = media.airingSchedule?.nodes || []
    }
  }

  const malId = doc.malId || snapshots.anilist?.malId
  if (malId) {
    const anime = await unifiedContentService.getMalAnimeDetails(malId, {
      extraFields: ['average_episode_duration'],
    })
    if (anime) snapshots.mal = compactSnapshot(malSnapshot(anime))
  }

  const tmdbType = { movie: 'movie', tv: 'tv' }[doc.contentType]
  if (doc.tmdbId && tmdbType) {
    const details = await unifiedContentService.getTmdbImportDetails(doc.tmdbId, tmdbType)
    if (details) snapshots.tmdb = compactSnapshot(tmdbSnapshot(details, tmdbType))
  }

  return { snapshots, schedule }
}

/**
 * Store snapshots, one row per source.
 * @param {string} contentId
 * @param {Record<string, object | null | undefined>} snapshots
 * @returns {Promise<void>}
 */
export async function storeSnapshots(contentId, snapshots) {
  for (const [source, data] of Object.entries(snapshots)) {
    if (!data) continue
    await query(
      `INSERT INTO content_source_data (content_id, source, data, fetched_at)
       VALUES ($1, $2, $3, now())
       ON CONFLICT (content_id, source) DO UPDATE SET data = EXCLUDED.data, fetched_at = now()`,
      [contentId, source, JSON.stringify(data)],
    )
  }
}

/**
 * Stored snapshots of a row.
 * @param {string} contentId
 * @returns {Promise<Record<string, object>>}
 */
export async function loadSnapshots(contentId) {
  const { rows } = await query(
    'SELECT source, data FROM content_source_data WHERE content_id = $1',
    [contentId],
  )
  return Object.fromEntries(rows.map((row) => [row.source, row.data]))
}

/**
 * Put resolved fields on a Content document. Ids each source reports fill the row's
 * own ids when it has none; every source's names become searchable names.
 * @param {object} doc - Content document (mutated)
 * @param {Record<string, unknown>} fields - From `resolveFields`
 * @param {Record<string, object>} snapshots
 * @returns {object} `doc`
 */
export function applyResolvedFields(doc, fields, snapshots) {
  const set = (key, value) => {
    if (value !== undefined) doc[key] = value
  }
  set('title', fields.title)
  set('englishTitle', fields.title)
  set('nativeTitle', fields.nativeTitle)
  set('overview', fields.overview)
  set('tagline', fields.tagline)
  set('posterPath', fields.posterPath)
  set('backdropPath', fields.backdropPath)
  set('bannerPath', fields.bannerPath)
  set('coverColor', fields.coverColor)
  set('releaseDate', fields.releaseDate)
  set('endDate', fields.endDate)
  set('format', fields.format)
  set('episodeCount', fields.episodeCount)
  set('episodeRuntime', fields.episodeRuntime)
  set('runtime', fields.runtime ?? fields.episodeRuntime)
  set('startSeason', fields.startSeason)
  set('startSeasonYear', fields.startYear)
  set('broadcastDay', fields.broadcastDay)
  set('broadcastTime', fields.broadcastTime)
  set('ageRating', fields.ageRating)
  set('sourceMaterial', fields.sourceMaterial)
  set('trailer', fields.trailer)
  if (fields.airingStatus) doc.malStatus = malStatusFromAiring(fields.airingStatus)
  if (fields.airingStatus || fields.nextEpisodeAt) {
    doc.nextEpisodeAirDate = fields.nextEpisodeAt || null
    doc.nextEpisodeNumber = fields.nextEpisodeNumber ?? null
  }
  if (fields.genres) doc.genres = fields.genres.map((name) => ({ name }))
  if (fields.studios) {
    doc.studios = fields.studios.map((studio) => studio.name)
    doc.studioRefs = fields.studios
  }
  if (fields.originCountry) doc.originCountries = [fields.originCountry]

  set('voteAverage', fields.tmdbScore)
  set('voteCount', fields.tmdbVotes)
  set('popularity', fields.popularity)
  set('malScore', fields.malScore)
  set('malScoredBy', fields.malVotes)
  set('malRank', fields.malRank)
  set('anilistScore', fields.anilistScore)
  doc.unifiedScore =
    calculateUnifiedScore(
      doc.voteAverage,
      doc.voteCount,
      doc.malScore,
      doc.malScoredBy,
      doc.userRatingAverage,
      doc.userRatingCount,
    ) ||
    doc.malScore ||
    doc.anilistScore ||
    doc.voteAverage ||
    doc.unifiedScore ||
    null

  doc.malId ||= snapshots.mal?.malId || snapshots.anilist?.malId || null
  doc.anilistId ||= snapshots.anilist?.anilistId || null

  doc.alternativeTitles = uniqueTitles(
    doc.alternativeTitles || [],
    ...Object.values(snapshots).flatMap((snapshot) => [
      snapshot?.title,
      snapshot?.romajiTitle,
      snapshot?.nativeTitle,
      snapshot?.synonyms || [],
    ]),
  ).filter((name) => name !== doc.title)
  return doc
}

/**
 * Replace a work's tags.
 * @param {string} workId
 * @param {{ name: string, category?: string, rank?: number, isSpoiler?: boolean, isAdult?: boolean }[]} tags
 * @returns {Promise<void>}
 */
async function writeTags(workId, tags) {
  await query('DELETE FROM content_tags WHERE content_id = $1', [workId])
  for (const tag of tags) {
    const { rows } = await query(
      `INSERT INTO tags (id, name, category, is_adult) VALUES ($1, $2, $3, $4)
       ON CONFLICT (name) DO UPDATE SET category = COALESCE(EXCLUDED.category, tags.category)
       RETURNING id`,
      [crypto.randomUUID(), tag.name, tag.category || null, Boolean(tag.isAdult)],
    )
    await query(
      `INSERT INTO content_tags (content_id, tag_id, rank, is_spoiler) VALUES ($1, $2, $3, $4)
       ON CONFLICT (content_id, tag_id) DO UPDATE SET rank = EXCLUDED.rank, is_spoiler = EXCLUDED.is_spoiler`,
      [workId, rows[0].id, tag.rank || 0, Boolean(tag.isSpoiler)],
    )
  }
}

/**
 * Person row (`voices`) for an AniList staff member: by AniList id, else a new row.
 * @param {{ anilistId: number, name: string, nativeName?: string, imagePath?: string }} staff
 * @returns {Promise<string>}
 */
async function upsertPerson(staff) {
  const { rows } = await query(
    `SELECT id FROM content WHERE kind = 'voice' AND anilist_id = $1 LIMIT 1`,
    [staff.anilistId],
  )
  if (rows[0]) return String(rows[0].id)
  const id = crypto.randomUUID()
  await query(
    `INSERT INTO content (id, kind, name, native_name, image_path, anilist_id)
     VALUES ($1, 'voice', $2, $3, $4, $5)`,
    [id, staff.name, staff.nativeName || null, staff.imagePath || null, staff.anilistId],
  )
  await query('INSERT INTO voices (content_id, english_name) VALUES ($1, $2)', [id, staff.name])
  return id
}

/**
 * Replace a work's key staff.
 * @param {string} workId
 * @param {object[]} staff - From `anilistKeyStaff`
 * @returns {Promise<void>}
 */
async function writeStaff(workId, staff) {
  await query('DELETE FROM staff_credits WHERE work_id = $1', [workId])
  for (const [position, member] of staff.entries()) {
    const personId = await upsertPerson(member)
    await query(
      `INSERT INTO staff_credits (work_id, person_id, role, position) VALUES ($1, $2, $3, $4)
       ON CONFLICT DO NOTHING`,
      [workId, personId, member.role, position],
    )
  }
}

/**
 * Store ids on other sites (IMDb, TVDB, Kitsu, ...).
 * @param {string} contentId
 * @param {Record<string, string>} externalIds
 * @returns {Promise<void>}
 */
export async function writeExternalIds(contentId, externalIds) {
  for (const [source, externalId] of Object.entries(externalIds)) {
    await query(
      `INSERT INTO content_external_ids (content_id, source, external_id) VALUES ($1, $2, $3)
       ON CONFLICT (content_id, source) DO UPDATE SET external_id = EXCLUDED.external_id`,
      [contentId, source, String(externalId)],
    )
  }
}

/**
 * Resolve a row from snapshots, save it, and write its tags, staff, and ids.
 * @param {object} doc - Content document
 * @param {Record<string, object>} snapshots
 * @param {{ save?: object, adjust?: (doc: object) => void }} [options] - `save` is passed to
 *   `Content.save`; `adjust` changes the document after resolving, before saving.
 * @returns {Promise<object>} The saved document.
 */
export async function saveResolved(doc, snapshots, { save = {}, adjust } = {}) {
  const resolved = resolveFields(snapshots, { anime: isAnime(doc, snapshots) })
  applyResolvedFields(doc, resolved.fields, snapshots)
  if (adjust) adjust(doc)
  await doc.save(save)
  const id = String(doc._id)
  await storeSnapshots(id, snapshots)
  if (resolved.fields.tags) await writeTags(id, resolved.fields.tags)
  if (resolved.fields.staff) await writeStaff(id, resolved.fields.staff)
  const fribb = fribbEntryFor(await loadFribbIndex(), doc)
  await writeExternalIds(id, { ...(fribb?.externalIds || {}), ...resolved.externalIds })
  return doc
}

/**
 * Jikan's episode list for a MAL entry (titles, filler/recap flags, air dates).
 * @param {number} malId
 * @returns {Promise<object[]>}
 */
export async function fetchJikanEpisodes(malId) {
  const episodes = []
  for (let page = 1; page <= MAX_JIKAN_EPISODE_PAGES; page += 1) {
    const body = await jikanGet(`/anime/${malId}/episodes?page=${page}`)
    if (!body?.data?.length) break
    episodes.push(...body.data)
    if (!body.pagination?.has_next_page) break
  }
  return episodes
}

/**
 * Replace a season's episodes (rows past the new list are kept only when the new
 * list is empty, so a failed fetch never wipes a season).
 * @param {string} seasonId
 * @param {object[]} episodes - From `mergeEpisodes`
 * @returns {Promise<void>}
 */
export async function writeEpisodes(seasonId, episodes) {
  if (!episodes.length) return
  for (const episode of episodes) {
    await query(
      `INSERT INTO episodes (season_id, number, title, title_romaji, title_native, overview,
         still_path, air_at, runtime, is_filler, is_recap, tmdb_episode_id, tmdb_score, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13, now())
       ON CONFLICT (season_id, number) DO UPDATE SET
         title = EXCLUDED.title, title_romaji = EXCLUDED.title_romaji,
         title_native = EXCLUDED.title_native, overview = EXCLUDED.overview,
         still_path = EXCLUDED.still_path, air_at = EXCLUDED.air_at, runtime = EXCLUDED.runtime,
         is_filler = EXCLUDED.is_filler, is_recap = EXCLUDED.is_recap,
         tmdb_episode_id = EXCLUDED.tmdb_episode_id, tmdb_score = EXCLUDED.tmdb_score,
         updated_at = now()`,
      [
        seasonId,
        episode.number,
        episode.title,
        episode.titleRomaji,
        episode.titleNative,
        episode.overview,
        episode.stillPath,
        episode.airAt,
        episode.runtime,
        episode.isFiller,
        episode.isRecap,
        episode.tmdbEpisodeId,
        episode.tmdbScore,
      ],
    )
  }
  await query('DELETE FROM episodes WHERE season_id = $1 AND number > $2', [
    seasonId,
    Math.max(...episodes.map((episode) => episode.number)),
  ])
}

/**
 * TMDB episodes that belong to a season row: its TMDB season from its offset up to
 * where the next row cut from the same TMDB season starts, renumbered from 1.
 * @param {object} season - Season document
 * @param {object[]} siblings - Every season of the series
 * @param {object[]} tmdbEpisodes - `mapTmdbEpisode` cards of the whole show
 * @returns {object[]}
 */
export function tmdbEpisodesForSeason(season, siblings, tmdbEpisodes) {
  if (season.tmdbSeasonNumber == null) return []
  const offset = season.tmdbEpisodeOffset || 0
  const next = siblings
    .filter(
      (other) =>
        other.tmdbSeasonNumber === season.tmdbSeasonNumber &&
        (other.tmdbEpisodeOffset || 0) > offset,
    )
    .map((other) => other.tmdbEpisodeOffset)
    .sort((left, right) => left - right)[0]
  return tmdbEpisodes
    .filter(
      (episode) =>
        episode.seasonNumber === season.tmdbSeasonNumber &&
        episode.episodeNumber > offset &&
        (next == null || episode.episodeNumber <= next),
    )
    .map(({ seasonNumber: _season, episodeNumber, ...episode }) => ({
      ...episode,
      number: episodeNumber - offset,
    }))
}

/**
 * Seasons of a series, by season and part.
 * @param {string} seriesId
 * @returns {Promise<object[]>} Content documents
 */
export async function loadSeasons(seriesId) {
  const { rows } = await query(
    `SELECT content_id FROM seasons WHERE series_id = $1 ORDER BY season_number, part_number`,
    [seriesId],
  )
  const works = await loadWorksById(rows.map((row) => String(row.content_id)))
  return rows
    .map((row) => works.get(String(row.content_id)))
    .filter(Boolean)
    .map((plain) => new Content(plain, { fromDb: true }))
}

/**
 * A series' totals from its seasons: counts, airing state, the next episode, and
 * scores (each the average of its seasons that have one).
 * @param {object[]} seasons - Season documents
 * @returns {object} Content fields
 */
export function seriesTotals(seasons) {
  const average = (values) => {
    const list = values.map(Number).filter((value) => Number.isFinite(value) && value > 0)
    return list.length
      ? Math.round((list.reduce((a, b) => a + b, 0) / list.length) * 100) / 100
      : null
  }
  const statuses = seasons.map((season) => season.malStatus)
  const airing = seasons
    .filter((season) => season.malStatus === 'currently_airing' && season.nextEpisodeAirDate)
    .sort(
      (left, right) => new Date(left.nextEpisodeAirDate) - new Date(right.nextEpisodeAirDate),
    )[0]
  const counted = seasons.filter((season) => Number(season.episodeCount) > 0)
  const dated = seasons
    .map((season) => season.releaseDate)
    .filter(Boolean)
    .sort((left, right) => new Date(left) - new Date(right))
  return {
    seasonCount: new Set(seasons.map((season) => season.seasonNumber)).size || null,
    episodeCount: counted.length
      ? counted.reduce((sum, season) => sum + Number(season.episodeCount), 0)
      : null,
    malStatus: statuses.includes('currently_airing')
      ? 'currently_airing'
      : statuses.length && statuses.every((status) => status === 'not_yet_aired')
        ? 'not_yet_aired'
        : statuses.includes('finished_airing')
          ? 'finished_airing'
          : null,
    nextEpisodeAirDate: airing?.nextEpisodeAirDate || null,
    nextEpisodeNumber: airing?.nextEpisodeNumber ?? null,
    nextEpisodeSeason: airing?.seasonNumber ?? null,
    releaseDate: dated[0] || null,
    malScore: average(seasons.map((season) => season.malScore)),
    unifiedScore: average(seasons.map((season) => season.unifiedScore)),
  }
}

/**
 * Import one season: its own sources (MAL/AniList for anime), its slice of TMDB's
 * show, and its episodes.
 * @param {object} season - Season document
 * @param {{ siblings: object[], tmdb?: { seasons: object[], episodes: object[] } | null,
 *   seriesTmdbId?: number | null, save?: object }} context
 * @returns {Promise<object>}
 */
export async function importSeason(
  season,
  { siblings, tmdb = null, seriesTmdbId = null, save = {} },
) {
  const { snapshots, schedule } = await fetchSnapshots(season)
  if (season.tmdbSeasonNumber == null && tmdb) {
    // A season the airing dates couldn't place (announced, or added later): Fribb's
    // placement, when it fits TMDB's seasons.
    const entry = fribbEntryFor(await loadFribbIndex(), {
      malId: season.malId || snapshots.anilist?.malId,
      anilistId: season.anilistId,
    })
    Object.assign(season, fribbTmdbPlacement(entry, seriesTmdbId, tmdb.seasons) || {})
  }
  const anime = isAnime(season, snapshots)
  const sameTmdb = siblings.filter(
    (other) => other.tmdbSeasonNumber != null && other.tmdbSeasonNumber === season.tmdbSeasonNumber,
  )
  const summary = tmdb?.seasons.find((entry) => entry.seasonNumber === season.tmdbSeasonNumber)
  const tmdbSeason = compactSnapshot(
    tmdbSeasonSnapshot(summary, {
      starts: !(season.tmdbEpisodeOffset > 0),
      shared: sameTmdb.length > 1,
    }),
  )
  if (tmdbSeason) snapshots.tmdb = tmdbSeason

  await saveResolved(season, snapshots, {
    save,
    adjust: (doc) => {
      const part = Number(doc.partNumber) > 1 ? ` Part ${doc.partNumber}` : ''
      doc.seasonLabel ||= `Season ${doc.seasonNumber}${part}`
    },
  })

  const tmdbEpisodes = tmdb ? tmdbEpisodesForSeason(season, siblings, tmdb.episodes) : []
  const jikan = season.malId ? await fetchJikanEpisodes(season.malId) : []
  await writeEpisodes(
    String(season._id),
    mergeEpisodes({ anime, count: season.episodeCount, tmdb: tmdbEpisodes, jikan, schedule }),
  )
  return season
}

/**
 * Import a series: every season, then the series itself from TMDB's show and its
 * first season's anime sources, with totals and scores from its seasons. A show
 * that is not anime gains a season row for each TMDB season it lacks.
 * @param {string} seriesId
 * @param {{ save?: object }} [options] - Passed to `Content.save`
 * @returns {Promise<object | null>} The series document
 */
export async function importSeries(seriesId, { save = {} } = {}) {
  const series = await Content.findById(seriesId)
  if (!series || series.contentType !== 'tv') return null
  let seasons = await loadSeasons(seriesId)
  const tmdb = series.tmdbId
    ? await unifiedContentService.fetchTmdbSeasonData(series.tmdbId, series.seasonCount)
    : null

  const anime = seasons.some((season) => season.malId || season.anilistId)
  if (tmdb && !anime) {
    const stored = new Set(seasons.map((season) => season.tmdbSeasonNumber))
    for (const summary of tmdb.seasons) {
      if (stored.has(summary.seasonNumber)) continue
      const label = summary.name || `Season ${summary.seasonNumber}`
      seasons.push(
        new Content({
          contentType: 'season',
          title: seasonRowName(series.title, label),
          englishTitle: seasonRowName(series.title, label),
          seriesId: String(series._id),
          seasonNumber: summary.seasonNumber,
          seasonLabel: label,
          tmdbSeasonNumber: summary.seasonNumber,
          tmdbEpisodeOffset: 0,
          originCountries: series.originCountries,
        }),
      )
    }
  }

  for (const season of seasons) {
    await importSeason(season, { siblings: seasons, tmdb, seriesTmdbId: series.tmdbId, save })
  }
  seasons = await loadSeasons(seriesId)

  const { snapshots } = await fetchSnapshots(series)
  const first = seasons[0] ? await loadSnapshots(String(seasons[0]._id)) : {}
  for (const source of ['anilist', 'mal']) {
    if (!first[source]) continue
    // The show's name and art follow its first season's anime listing; its counts,
    // scores, and ids stay the season's.
    const {
      episodeCount: _count,
      airingStatus: _status,
      score: _score,
      votes: _votes,
      rank: _rank,
      malId: _malId,
      anilistId: _anilistId,
      nextEpisodeAt: _nextAt,
      nextEpisodeNumber: _nextNumber,
      ...rest
    } = first[source]
    snapshots[source] = rest
  }
  return saveResolved(series, snapshots, {
    save,
    adjust: (doc) => Object.assign(doc, seriesTotals(seasons)),
  })
}

/**
 * Import a movie or special.
 * @param {string} contentId
 * @param {{ save?: object }} [options]
 * @returns {Promise<object | null>}
 */
export async function importStandalone(contentId, { save = {} } = {}) {
  const doc = await Content.findById(contentId)
  if (!doc || !['movie', 'special'].includes(doc.contentType)) return null
  const { snapshots } = await fetchSnapshots(doc)
  return saveResolved(doc, snapshots, { save })
}

/**
 * Re-import shows with a season airing now or starting within two weeks, so their
 * episodes (titles, air times, stills) and schedules stay current. Most recently
 * refreshed last.
 * @param {{ limit?: number }} [options]
 * @returns {Promise<{ refreshed: number, failed: number }>}
 */
export async function refreshAiringSeries({ limit = 40 } = {}) {
  const { rows } = await query(
    `SELECT sn.series_id::text AS id, max(c.updated_at) AS touched
     FROM seasons sn JOIN content c ON c.id = sn.content_id
     WHERE sn.airing_status = 'airing'
        OR (sn.airing_status = 'upcoming' AND sn.release_date <= current_date + 14)
     GROUP BY sn.series_id
     ORDER BY max(c.updated_at)
     LIMIT $1`,
    [limit],
  )
  let failed = 0
  for (const row of rows) {
    try {
      await importSeries(row.id)
    } catch (error) {
      failed += 1
      console.error(`Airing refresh of series ${row.id} failed:`, error.message)
    }
  }
  return { refreshed: rows.length - failed, failed }
}
