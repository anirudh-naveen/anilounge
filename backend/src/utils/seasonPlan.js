/**
 * Season planning: how a show's seasons line up across sources. TMDB lists a show as
 * one row with numbered seasons, sometimes running several seasons together as one
 * (The Apothecary Diaries' seasons 1–3 as a 60-episode "Season 1"), while MAL and
 * AniList list each season, often each cour, as its own entry. These helpers cut
 * TMDB's seasons where MAL/AniList entries premiere and match each season to the
 * catalog row that is that season.
 *
 * Utils layer: pure. Used by the season import (services/seasonImport.js), the
 * series migration (scripts/restructureSeries.js), and services/seasonService.js.
 */
import { contentSeason } from './titles.js'

const DAY_MS = 24 * 60 * 60 * 1000
/** MAL/AniList start dates can be a season (quarter) start, well before the premiere. */
const START_TOLERANCE_MS = 75 * DAY_MS
const END_TOLERANCE_MS = 30 * DAY_MS
/** A pause between episodes this long may be a break between seasons. */
const MIN_BREAK_MS = 28 * DAY_MS
/** MAL dates are Japan's; TMDB's can be a day later or earlier. */
const PREMIERE_SLACK_MS = 3 * DAY_MS
export const MIN_PREFIX_LENGTH = 6
/** TMDB's default season name; anything else ("The Final Season") is kept. */
const PLAIN_SEASON_NAME = /^season\s*\d+$/i

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
export function isListedAnime(content) {
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
 * An episode's title after it is renumbered. TMDB names episodes it has no title
 * for yet "Episode 27" after their place in its own numbering; those follow the
 * new number, and real titles are kept.
 * @param {string} title
 * @param {number} tmdbNumber - The episode's number on TMDB
 * @param {number} number - The episode's number in the guide
 * @returns {string}
 */
export function renumberedTitle(title, tmdbNumber, number) {
  const placeholder = /^episode\s*0*(\d+)$/i.exec(String(title || '').trim())
  if (!title || (placeholder && Number(placeholder[1]) === tmdbNumber)) return `Episode ${number}`
  return title
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

  const splitSeasons = []
  const splitEpisodes = []
  let number = 0
  for (const { season, run, cuts } of plans) {
    if (!run.length) {
      number += 1
      const name =
        !season.name || PLAIN_SEASON_NAME.test(season.name) ? `Season ${number}` : season.name
      splitSeasons.push({ ...season, seasonNumber: number, name })
      continue
    }
    const starts = [0, ...[...cuts].sort((left, right) => left - right)]
    for (const [part, start] of starts.entries()) {
      number += 1
      const slice = run.slice(start, starts[part + 1] ?? run.length)
      const first = slice[0].episode.episodeNumber
      for (const { episode } of slice) {
        const episodeNumber = episode.episodeNumber - first + 1
        splitEpisodes.push({
          ...episode,
          title: renumberedTitle(episode.title, episode.episodeNumber, episodeNumber),
          seasonNumber: number,
          episodeNumber,
          tmdbSeasonNumber: episode.seasonNumber,
          tmdbEpisodeNumber: episode.episodeNumber,
        })
      }
      const own = part === 0 ? season : { overview: '', posterPath: '', voteAverage: null }
      const name =
        part === 0 && season.name && !PLAIN_SEASON_NAME.test(season.name)
          ? season.name
          : `Season ${number}`
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
 * Name of a season row made from TMDB: "Show Season 2", or "Show – Book One: Water"
 * when TMDB gives the season a name of its own.
 * @param {string} seriesTitle
 * @param {string} label
 * @returns {string}
 */
export function seasonRowName(seriesTitle, label) {
  return PLAIN_SEASON_NAME.test(label) ? `${seriesTitle} ${label}` : `${seriesTitle} – ${label}`
}

/**
 * Season and part numbers for a show's entries in airing order. An entry whose title
 * names a later part ("Season 3 Part 2", "2nd Cour") continues the season before it;
 * every other entry starts the next season.
 * @param {{ content?: object | null, name?: string }[]} entries - In airing order
 * @returns {{ seasonNumber: number, partNumber: number, label: string }[]}
 */
export function numberSeasons(entries) {
  const numbered = []
  for (const [index, entry] of entries.entries()) {
    const named = entry.content ? contentSeason(entry.content) : null
    const previous = numbered[index - 1]
    const continues = Boolean(previous && named && named.part > 1)
    const seasonNumber = continues ? previous.seasonNumber : (previous?.seasonNumber ?? 0) + 1
    const partNumber = continues ? named.part : 1
    const name = String(entry.name || '').trim()
    const label =
      partNumber > 1
        ? `Season ${seasonNumber} Part ${partNumber}`
        : name && !PLAIN_SEASON_NAME.test(name)
          ? name
          : `Season ${seasonNumber}`
    numbered.push({ seasonNumber, partNumber, label })
  }
  return numbered
}

/**
 * A TMDB show's seasons as stored: TMDB's seasons cut where MAL/AniList entries
 * premiere (`splitCombinedSeasons`), each matched to its catalog row
 * (`matchSeasonsToWorks`), numbered (`numberSeasons`), with where its episodes sit on
 * TMDB. For anime the TMDB-linked entry is season 1 itself; for other shows it is the
 * show, and every season is a new row (`contentId` null).
 * @param {{ seasons: object[], episodes: object[], anchor: object, candidates: object[] }} input
 *   TMDB season summaries and episode cards (`mapTmdbSeason` / `mapTmdbEpisode`), the
 *   TMDB-linked row, and rows that may be its later seasons.
 * @returns {{ seasons: object[], episodes: object[] }} Seasons with `key` (guide
 *   number), `contentId`, `seasonNumber`, `partNumber`, `label`, `tmdbSeasonNumber`,
 *   `tmdbEpisodeOffset`, and TMDB's summary fields; episodes with `seasonKey` and
 *   `number`, numbered within their season.
 */
export function planTmdbShow({ seasons, episodes, anchor, candidates }) {
  const split = splitCombinedSeasons(seasons, episodes, anchor, candidates)
  const anchorIsSeason = isListedAnime(anchor)
  const matches = matchSeasonsToWorks(split.seasons, split.episodes, anchor, candidates)
  if (!anchorIsSeason) {
    for (const [key, id] of matches) if (id === String(anchor._id)) matches.delete(key)
  }
  const byId = new Map(candidates.map((row) => [String(row._id), row]))
  byId.set(String(anchor._id), anchor)

  const ordered = [...split.seasons].sort((left, right) => left.seasonNumber - right.seasonNumber)
  const numbers = numberSeasons(
    ordered.map((season) => ({
      content: byId.get(matches.get(season.seasonNumber)) || null,
      name: season.name,
    })),
  )

  const planned = ordered.map((season, index) => {
    const first = split.episodes
      .filter((episode) => episode.seasonNumber === season.seasonNumber)
      .sort((left, right) => left.episodeNumber - right.episodeNumber)[0]
    const tmdbSeasonNumber = first?.tmdbSeasonNumber ?? season.seasonNumber
    const tmdbEpisodeOffset =
      first?.tmdbEpisodeNumber != null ? first.tmdbEpisodeNumber - first.episodeNumber : 0
    return {
      ...season,
      key: season.seasonNumber,
      contentId: matches.get(season.seasonNumber) || null,
      ...numbers[index],
      tmdbSeasonNumber,
      tmdbEpisodeOffset,
    }
  })

  return {
    seasons: planned,
    episodes: split.episodes.map(({ seasonNumber, episodeNumber, ...episode }) => ({
      ...episode,
      seasonKey: seasonNumber,
      number: episodeNumber,
    })),
  }
}

/**
 * Seasons of an anime with no TMDB show: its TV entries in airing order.
 * @param {object[]} rows - TV entries of one show (a sequel chain)
 * @returns {{ contentId: string, seasonNumber: number, partNumber: number, label: string }[]}
 */
export function planChainShow(rows) {
  const ordered = [...rows].sort(
    (left, right) =>
      (toTime(left.releaseDate) ?? Infinity) - (toTime(right.releaseDate) ?? Infinity),
  )
  const numbers = numberSeasons(ordered.map((content) => ({ content })))
  return ordered.map((content, index) => ({ contentId: String(content._id), ...numbers[index] }))
}
