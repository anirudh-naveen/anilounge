/**
 * Season guide for TV details: TMDB lists a show as one row with numbered
 * seasons, while MAL/AniList list each season as its own title. This maps
 * every TMDB season onto the catalog row for that season (when one exists) so
 * the season picker can show that season's own content.
 *
 * Domain service used by `contentController.getContentEpisodes`.
 */
import { query } from '../../config/postgres.js'
import { escapeLike } from '../db/mongoFilter.js'
import Content from '../models/Content.js'
import unifiedContentService from './unifiedContentService.js'
import { collectContentTitles, contentSeason, normalizeTitle } from '../utils/titles.js'

const DAY_MS = 24 * 60 * 60 * 1000
/** MAL/AniList start dates can be a season (quarter) start, well before the premiere. */
const START_TOLERANCE_MS = 75 * DAY_MS
const END_TOLERANCE_MS = 30 * DAY_MS
/** A pause between episodes this long may be a break between seasons. */
const MIN_BREAK_MS = 28 * DAY_MS
/** MAL dates are Japan's; TMDB's can be a day later or earlier. */
const PREMIERE_SLACK_MS = 3 * DAY_MS
const MIN_PREFIX_LENGTH = 6
const MAX_ANCHORS = 3

/**
 * @param {unknown} value
 * @returns {number | null} Epoch ms, or null when missing/invalid.
 */
function toTime(value) {
  if (!value) return null
  const time = new Date(value).getTime()
  return Number.isFinite(time) ? time : null
}

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
 * Whether `name` is `prefix` or continues it past a word boundary
 * ("attack on titan season 2" continues "attack on titan"; "narutos" does not).
 * @param {string} name
 * @param {string} prefix
 * @returns {boolean}
 */
export function continuesTitle(name, prefix) {
  if (prefix.length < MIN_PREFIX_LENGTH || !name.startsWith(prefix)) return false
  const next = name.charAt(prefix.length)
  return !next || !/\p{L}/u.test(next) || !/\p{L}/u.test(prefix.charAt(prefix.length - 1))
}

/**
 * First air date and last aired episode per season number.
 * @param {object[]} seasons - TMDB season summaries
 * @param {object[]} episodes - Episode cards
 * @returns {Map<number, { start: number | null, end: number | null }>}
 */
function seasonSpans(seasons, episodes) {
  const spans = new Map(
    seasons.map((season) => [season.seasonNumber, { start: toTime(season.airDate), end: null }]),
  )
  for (const episode of episodes) {
    const span = spans.get(episode.seasonNumber)
    const aired = toTime(episode.airDate)
    if (!span || aired == null) continue
    if (span.start == null || aired < span.start) span.start = aired
    if (span.end == null || aired > span.end) span.end = aired
  }
  return spans
}

/**
 * Episode cards grouped by season number.
 * @param {object[]} episodes
 * @returns {Map<number, object[]>}
 */
function bySeasonNumber(episodes) {
  const groups = new Map()
  for (const episode of episodes) {
    const list = groups.get(episode.seasonNumber)
    if (list) list.push(episode)
    else groups.set(episode.seasonNumber, [episode])
  }
  return groups
}

/**
 * Episodes of one season in order, each with the pause since the previous one.
 * @param {object[]} episodes - Episode cards of a single season
 * @returns {{ episode: object, aired: number | null, gap: number | null }[]}
 */
function airingRun(episodes) {
  const sorted = [...episodes].sort((left, right) => left.episodeNumber - right.episodeNumber)
  return sorted.map((episode, index) => {
    const aired = toTime(episode.airDate)
    const before = index ? toTime(sorted[index - 1].airDate) : null
    return { episode, aired, gap: aired != null && before != null ? aired - before : null }
  })
}

/**
 * Whether a row is a MyAnimeList/AniList entry. Those sites list each anime
 * season (and often each cour) as its own title, which the guide follows.
 * @param {object} [content]
 * @returns {boolean}
 */
function isListedAnime(content) {
  return Boolean(content?.malId || content?.anilistId)
}

/**
 * Where in a season's episode run an entry premiering at `released` begins:
 * the episode that resumes after the airing break nearest the premiere, else
 * the first episode aired from the premiere on.
 * @param {{ aired: number | null, gap: number | null }[]} run
 * @param {number} released
 * @returns {number | null} Index past the first episode, or null when none fits.
 */
function entryStart(run, released) {
  let best = null
  for (const [index, { aired, gap }] of run.entries()) {
    if (gap == null || gap < MIN_BREAK_MS) continue
    if (released < aired - START_TOLERANCE_MS || released > aired + END_TOLERANCE_MS) continue
    if (best == null || Math.abs(released - aired) < Math.abs(released - run[best].aired)) {
      best = index
    }
  }
  if (best != null) return best
  const index = run.findIndex(({ aired }) => aired != null && aired >= released - PREMIERE_SLACK_MS)
  return index > 0 && run[index].aired <= released + END_TOLERANCE_MS ? index : null
}

/**
 * For anime, follow MAL/AniList's seasons over TMDB's. TMDB sometimes lists a
 * show as one long season (The Apothecary Diaries: seasons 1–3 as "Season 1",
 * episodes 1–60) while MAL/AniList list "Season 2" and "Season 3" as titles of
 * their own. A TMDB season is cut where another MAL/AniList TV entry of the
 * franchise premiered inside it (`entryStart`). Seasons are then numbered in
 * order and each part's episodes restart at 1, so the guide matches the
 * catalog rows. Non-anime shows keep TMDB's seasons.
 * @param {object[]} seasons - TMDB season summaries
 * @param {object[]} episodes - Episode cards with `seasonNumber` and `airDate`
 * @param {{ _id: unknown, tmdbId?: number, malId?: number, anilistId?: number }} anchor - The TMDB-backed row
 * @param {object[]} candidates - Series rows from the same franchise
 * @returns {{ seasons: object[], episodes: object[] }} Unchanged when nothing splits
 */
export function splitCombinedSeasons(seasons, episodes, anchor, candidates) {
  if (!isListedAnime(anchor)) return { seasons, episodes }
  const ordered = [...seasons].sort((left, right) => left.seasonNumber - right.seasonNumber)
  const bySeason = bySeasonNumber(episodes)
  const premieres = candidates
    .filter(
      (candidate) =>
        isListedAnime(candidate) &&
        String(candidate._id) !== String(anchor._id) &&
        (candidate.contentType ?? 'tv') === 'tv' &&
        !(candidate.tmdbId && anchor.tmdbId && Number(candidate.tmdbId) !== Number(anchor.tmdbId)),
    )
    .map((candidate) => toTime(candidate.releaseDate))
    .filter((released) => released != null)

  const plans = ordered.map((season) => {
    const run = airingRun(bySeason.get(season.seasonNumber) || [])
    const cuts = new Set()
    for (const released of premieres) {
      const start = entryStart(run, released)
      if (start != null) cuts.add(start)
    }
    return { season, run, cuts }
  })
  if (plans.every(({ cuts }) => !cuts.size)) return { seasons, episodes }

  const plainName = /^season\s*\d+$/i
  const splitSeasons = []
  const splitEpisodes = []
  let number = 0
  for (const { season, run, cuts } of plans) {
    if (!run.length) {
      number += 1
      const name = !season.name || plainName.test(season.name) ? `Season ${number}` : season.name
      splitSeasons.push({ ...season, seasonNumber: number, name })
      continue
    }
    const starts = [0, ...[...cuts].sort((left, right) => left - right)]
    for (const [part, start] of starts.entries()) {
      number += 1
      const slice = run.slice(start, starts[part + 1] ?? run.length)
      const first = slice[0].episode.episodeNumber
      for (const { episode } of slice) {
        splitEpisodes.push({
          ...episode,
          seasonNumber: number,
          episodeNumber: episode.episodeNumber - first + 1,
          tmdbSeasonNumber: episode.seasonNumber,
          tmdbEpisodeNumber: episode.episodeNumber,
        })
      }
      const own = part === 0 ? season : { overview: '', posterPath: '', voteAverage: null }
      const name =
        part === 0 && season.name && !plainName.test(season.name) ? season.name : `Season ${number}`
      splitSeasons.push({
        ...own,
        seasonNumber: number,
        name,
        airDate: part === 0 ? season.airDate : slice[0].episode.airDate,
        episodeCount: starts.length > 1 ? slice.length : season.episodeCount,
      })
    }
  }
  return { seasons: splitSeasons, episodes: splitEpisodes }
}

/**
 * Assign catalog rows to TMDB seasons. The first season is the TMDB row
 * itself. Each other row goes to the latest season that started (with
 * tolerance) by its release date and had not ended; per season the row whose
 * title names that season (first part before later parts) wins, then the one
 * released closest to the premiere.
 * @param {object[]} seasons - TMDB season summaries, any order
 * @param {object[]} episodes - Episode cards with `seasonNumber` and `airDate`
 * @param {{ _id: unknown, tmdbId?: number }} anchor - The TMDB-backed row
 * @param {object[]} candidates - Series rows from the same franchise
 * @returns {Map<number, string>} Season number → content id
 */
export function matchSeasonsToWorks(seasons, episodes, anchor, candidates) {
  const ordered = [...seasons].sort((left, right) => left.seasonNumber - right.seasonNumber)
  const matches = new Map()
  if (!ordered.length) return matches
  const anchorId = String(anchor._id)
  matches.set(ordered[0].seasonNumber, anchorId)

  const spans = seasonSpans(ordered, episodes)
  const later = ordered.slice(1).filter((season) => spans.get(season.seasonNumber)?.start != null)
  const best = new Map()

  for (const candidate of candidates) {
    const id = String(candidate._id)
    const released = toTime(candidate.releaseDate)
    if (id === anchorId || released == null) continue
    if (candidate.tmdbId && anchor.tmdbId && Number(candidate.tmdbId) !== Number(anchor.tmdbId)) {
      continue
    }

    let season = null
    for (const option of later) {
      if (spans.get(option.seasonNumber).start - START_TOLERANCE_MS <= released) season = option
    }
    if (!season) continue
    const index = ordered.indexOf(season)
    const span = spans.get(season.seasonNumber)
    const nextStart = spans.get(ordered[index + 1]?.seasonNumber)?.start ?? null
    const end = span.end ?? nextStart
    if (end != null && released > end + END_TOLERANCE_MS) continue

    const named = contentSeason(candidate)
    const score = [
      named.season !== season.seasonNumber ? 2 : named.part === 1 ? 0 : 1,
      Math.abs(released - span.start),
    ]
    const current = best.get(season.seasonNumber)
    if (
      !current ||
      score[0] < current.score[0] ||
      (score[0] === current.score[0] && score[1] < current.score[1])
    ) {
      best.set(season.seasonNumber, { id, score })
    }
  }

  for (const [seasonNumber, { id }] of best) matches.set(seasonNumber, id)
  return matches
}

/**
 * Series rows that may be later seasons of `anchor`: its sequel/prequel chain
 * plus series whose name continues one of the anchor's names.
 * @param {object} anchor
 * @returns {Promise<object[]>}
 */
async function seasonCandidates(anchor) {
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

/**
 * Episodes, seasons, and which season `content` is. A row that is one season
 * of a TMDB show (e.g. MAL's "Season 2") gets that show's full season list
 * with its own season selected; otherwise the row's own episodes.
 * @param {object} content
 * @returns {Promise<{ seriesId: string, currentSeason: number | null, episodes: object[], seasons: object[] }>}
 */
export async function getSeasonGuide(content) {
  const id = String(content._id)
  const empty = { seriesId: id, currentSeason: null, episodes: [], seasons: [] }
  if (content.contentType !== 'tv') return empty

  const currentIn = (guide) =>
    guide.seasons.find((season) => season.contentId === id)?.seasonNumber ?? null

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
  const guide = await getSeasonGuide(content)
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
