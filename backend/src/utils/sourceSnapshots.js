/**
 * Normalized snapshots of a watchable from each source, in the field names
 * utils/sourcePriority.js resolves (`title`, `posterPath`, `airingStatus`, ...), plus
 * the merge of a season's episodes from TMDB and AniList.
 *
 * Utils layer: pure. Fetching lives in services/catalogImport.js; snapshots are stored
 * in `content_source_data`. Only fields the catalog uses are kept.
 */
import { airingFromMalStatus } from '../db/kinds.js'
import { isMissing } from './sourcePriority.js'
import { tmdbKeyStaff } from './staffCredits.js'

const SEASONS = ['winter', 'spring', 'summer', 'fall']

/** AniList staff roles kept as key staff, by the role before any "(eps 1-12)" note. */
const KEY_STAFF_ROLES = new Map(
  [
    'Original Creator',
    'Original Story',
    'Director',
    'Chief Director',
    'Series Composition',
    'Script',
    'Character Design',
    'Original Character Design',
    'Chief Animation Director',
    'Music',
    'Art Director',
    'Sound Director',
  ].map((role, index) => [role.toLowerCase(), index]),
)
const MAX_STAFF = 16
const MAX_TAGS = 20

/**
 * @param {unknown} value
 * @returns {string}
 */
const text = (value) => (typeof value === 'string' ? value.trim() : '')

/**
 * @param {unknown} value
 * @returns {number | null}
 */
function positive(value) {
  const number = Number(value)
  return Number.isFinite(number) && number > 0 ? number : null
}

/**
 * @param {unknown} value
 * @returns {number | null}
 */
function finite(value) {
  if (value == null || value === '') return null
  const number = Number(value)
  return Number.isFinite(number) ? number : null
}

/**
 * 'YYYY-MM-DD' from AniList's `{ year, month, day }`; month/day default to 1.
 * @param {{ year?: number, month?: number, day?: number } | null | undefined} date
 * @returns {string | null}
 */
export function anilistDateString(date) {
  const year = positive(date?.year)
  if (!year) return null
  const pad = (value) => String(positive(value) || 1).padStart(2, '0')
  return `${year}-${pad(date.month)}-${pad(date.day)}`
}

/**
 * 'YYYY-MM-DD' from a date string MAL or TMDB sends ('2024', '2024-10', '2024-10-03').
 * @param {unknown} value
 * @returns {string | null}
 */
export function dateString(value) {
  const match = /^(\d{4})(?:-(\d{2}))?(?:-(\d{2}))?/.exec(text(value))
  if (!match) return null
  return `${match[1]}-${match[2] || '01'}-${match[3] || '01'}`
}

/**
 * 'manga', 'light_novel', 'original' from AniList ('LIGHT_NOVEL') or MAL ('light_novel').
 * @param {unknown} value
 * @returns {string | null}
 */
function sourceMaterial(value) {
  const key = text(value).toLowerCase().replace(/\s+/g, '_')
  return key && key !== 'other' && key !== 'unknown' ? key : null
}

/**
 * @param {unknown} status - AniList media status
 * @returns {'upcoming' | 'airing' | 'finished' | null}
 */
function anilistAiring(status) {
  if (status === 'RELEASING' || status === 'HIATUS') return 'airing'
  if (status === 'NOT_YET_RELEASED') return 'upcoming'
  if (status === 'FINISHED' || status === 'CANCELLED') return 'finished'
  return null
}

/**
 * Key staff from AniList staff edges, ordered by role then billing.
 * @param {object[]} [edges]
 * @returns {{ anilistId: number, name: string, nativeName: string, imagePath: string, role: string }[]}
 */
export function anilistKeyStaff(edges = []) {
  const kept = []
  const seen = new Set()
  for (const edge of edges) {
    const role = text(edge?.role)
      .replace(/\s*\(.*\)\s*$/, '')
      .trim()
    const rank = KEY_STAFF_ROLES.get(role.toLowerCase())
    const anilistId = positive(edge?.node?.id)
    const name = text(edge?.node?.name?.full)
    if (rank == null || !anilistId || !name || seen.has(`${anilistId}:${role}`)) continue
    seen.add(`${anilistId}:${role}`)
    kept.push({
      anilistId,
      name,
      nativeName: text(edge.node.name?.native),
      imagePath: text(edge.node.image?.large),
      role,
      rank,
    })
  }
  return kept
    .sort((left, right) => left.rank - right.rank)
    .slice(0, MAX_STAFF)
    .map(({ rank: _rank, ...staff }) => staff)
}

/**
 * Snapshot of an AniList anime (`MEDIA_FIELDS` + `DETAIL_FIELDS` in anilistService.js).
 * @param {object} media
 * @returns {object | null}
 */
export function anilistSnapshot(media) {
  if (!positive(media?.id)) return null
  const english = text(media.title?.english)
  const romaji = text(media.title?.romaji)
  const season = text(media.season).toLowerCase()
  const movie = media.format === 'MOVIE'
  const trailer =
    media.trailer?.site === 'youtube' && text(media.trailer.id)
      ? { site: 'youtube', key: text(media.trailer.id) }
      : null
  const next = media.nextAiringEpisode
  return {
    title: english || romaji,
    romajiTitle: romaji,
    nativeTitle: text(media.title?.native),
    synonyms: (media.synonyms || []).map(text).filter(Boolean),
    overview: text(media.description)
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<[^>]+>/g, '')
      .replace(/\n{3,}/g, '\n\n')
      .trim(),
    posterPath: text(media.coverImage?.extraLarge || media.coverImage?.large),
    bannerPath: text(media.bannerImage),
    coverColor: text(media.coverImage?.color),
    releaseDate: anilistDateString(media.startDate),
    endDate: anilistDateString(media.endDate),
    airingStatus: anilistAiring(media.status),
    format: text(media.format),
    episodeCount: movie ? null : positive(media.episodes),
    episodeRuntime: movie ? null : positive(media.duration),
    runtime: movie ? positive(media.duration) : null,
    startSeason: SEASONS.includes(season) ? season : null,
    startYear: positive(media.seasonYear),
    nextEpisodeAt: positive(next?.airingAt) ? new Date(next.airingAt * 1000).toISOString() : null,
    nextEpisodeNumber: positive(next?.episode),
    genres: (media.genres || []).map(text).filter(Boolean),
    tags: (media.tags || [])
      .filter((tag) => text(tag?.name))
      .slice(0, MAX_TAGS)
      .map((tag) => ({
        name: text(tag.name),
        category: text(tag.category),
        rank: Math.max(0, Math.min(100, Number(tag.rank) || 0)),
        isSpoiler: Boolean(tag.isMediaSpoiler || tag.isGeneralSpoiler),
        isAdult: Boolean(tag.isAdult),
      })),
    // Every studio with what it did: animation studios (main first), then producers.
    studios: (media.studios?.edges || [])
      .filter((edge) => text(edge?.node?.name))
      .map((edge) => ({
        name: text(edge.node.name),
        anilistId: positive(edge.node.id),
        role: edge.node.isAnimationStudio ? 'animation' : 'production',
        isMain: Boolean(edge.isMain && edge.node.isAnimationStudio),
      }))
      .sort(
        (left, right) =>
          Number(right.role === 'animation') - Number(left.role === 'animation') ||
          Number(right.isMain) - Number(left.isMain),
      ),
    staff: anilistKeyStaff(media.staff?.edges),
    originCountry: text(media.countryOfOrigin) || null,
    sourceMaterial: sourceMaterial(media.source),
    trailer,
    score: positive(media.averageScore) ? media.averageScore / 10 : null,
    externalIds: {},
    malId: positive(media.idMal),
    anilistId: positive(media.id),
  }
}

/**
 * Snapshot of a MyAnimeList anime (official API v2 document).
 * @param {object} anime
 * @returns {object | null}
 */
export function malSnapshot(anime) {
  if (!positive(anime?.id)) return null
  const titles = anime.alternative_titles || {}
  const movie = String(anime.media_type || '').toLowerCase() === 'movie'
  const season = text(anime.start_season?.season).toLowerCase()
  const runtime = positive(anime.average_episode_duration)
    ? Math.round(anime.average_episode_duration / 60)
    : null
  return {
    title: text(titles.en) || text(anime.title),
    romajiTitle: text(anime.title),
    nativeTitle: text(titles.ja),
    synonyms: (titles.synonyms || []).map(text).filter(Boolean),
    overview: text(anime.synopsis)
      .replace(/\n*\[Written by MAL Rewrite\]\s*$/i, '')
      .trim(),
    posterPath: text(anime.main_picture?.large || anime.main_picture?.medium),
    releaseDate: dateString(anime.start_date),
    endDate: dateString(anime.end_date),
    airingStatus: airingFromMalStatus(anime.status),
    format: text(anime.media_type).toUpperCase(),
    episodeCount: movie ? null : positive(anime.num_episodes),
    episodeRuntime: movie ? null : runtime,
    runtime: movie ? runtime : null,
    startSeason: SEASONS.includes(season) ? season : null,
    startYear: positive(anime.start_season?.year),
    broadcastDay: text(anime.broadcast?.day_of_the_week) || null,
    broadcastTime: text(anime.broadcast?.start_time) || null,
    genres: (anime.genres || []).map((genre) => text(genre?.name)).filter(Boolean),
    studios: (anime.studios || [])
      .filter((studio) => text(studio?.name))
      // MAL's "studios" are the animation studios (producers are listed apart).
      .map((studio) => ({
        name: text(studio.name),
        malId: positive(studio.id),
        role: 'animation',
      })),
    ageRating: text(anime.rating) || null,
    sourceMaterial: sourceMaterial(anime.source),
    score: positive(anime.mean),
    votes: positive(anime.num_scoring_users),
    rank: positive(anime.rank),
    externalIds: {},
    malId: positive(anime.id),
  }
}

/**
 * First official YouTube trailer (else teaser) in TMDB `videos`.
 * @param {object} [videos]
 * @returns {{ site: string, key: string } | null}
 */
export function tmdbTrailer(videos) {
  const list = (videos?.results || []).filter((video) => video?.site === 'YouTube' && video.key)
  const pick =
    list.find((video) => video.type === 'Trailer' && video.official) ||
    list.find((video) => video.type === 'Trailer') ||
    list.find((video) => video.type === 'Teaser')
  return pick ? { site: 'youtube', key: pick.key } : null
}

/**
 * US age rating from TMDB `content_ratings` (TV) or `release_dates` (movies).
 * @param {object} details
 * @returns {string | null}
 */
function tmdbAgeRating(details) {
  const tv = (details.content_ratings?.results || []).find((entry) => entry.iso_3166_1 === 'US')
  if (text(tv?.rating)) return text(tv.rating)
  const release = (details.release_dates?.results || []).find((entry) => entry.iso_3166_1 === 'US')
  const certified = (release?.release_dates || []).find((entry) => text(entry.certification))
  return certified ? text(certified.certification) : null
}

/**
 * @param {object} details - TMDB TV document
 * @returns {'upcoming' | 'airing' | 'finished' | null}
 */
function tmdbShowAiring(details) {
  if (details.next_episode_to_air) return 'airing'
  if (details.status === 'Ended' || details.status === 'Canceled') return 'finished'
  if (!details.first_air_date) return 'upcoming'
  return null
}

/**
 * Snapshot of a TMDB movie or TV show, requested with
 * `append_to_response=external_ids,videos,content_ratings|release_dates`.
 * @param {object} details
 * @param {'movie' | 'tv'} contentType
 * @returns {object | null}
 */
export function tmdbSnapshot(details, contentType) {
  if (!positive(details?.id)) return null
  const movie = contentType === 'movie'
  const ids = details.external_ids || {}
  const next = details.next_episode_to_air
  const released = text(details.release_date)
  return {
    title: text(movie ? details.title : details.name),
    nativeTitle: text(movie ? details.original_title : details.original_name),
    synonyms: (details.alternative_titles?.titles || details.alternative_titles?.results || [])
      .map((entry) => text(entry?.title))
      .filter(Boolean),
    overview: text(details.overview),
    tagline: text(details.tagline),
    posterPath: text(details.poster_path),
    backdropPath: text(details.backdrop_path),
    releaseDate: dateString(movie ? released : details.first_air_date),
    endDate: movie ? null : dateString(details.last_air_date),
    airingStatus: movie
      ? released && released <= new Date().toISOString().slice(0, 10)
        ? 'finished'
        : 'upcoming'
      : tmdbShowAiring(details),
    episodeCount: movie ? null : positive(details.number_of_episodes),
    seasonCount: movie ? null : positive(details.number_of_seasons),
    episodeRuntime: movie ? null : positive(details.episode_run_time?.[0]),
    runtime: movie ? positive(details.runtime) : null,
    nextEpisodeAt: next?.air_date ? dateString(next.air_date) : null,
    nextEpisodeNumber: positive(next?.episode_number),
    nextEpisodeSeason: positive(next?.season_number),
    genres: (details.genres || []).map((genre) => text(genre?.name)).filter(Boolean),
    studios: (details.production_companies || [])
      .filter((company) => text(company?.name))
      .map((company) => ({
        name: text(company.name),
        tmdbId: positive(company.id),
        imagePath: text(company.logo_path) || undefined,
      })),
    originCountry:
      text(details.origin_country?.[0] || details.production_countries?.[0]?.iso_3166_1) || null,
    ageRating: tmdbAgeRating(details),
    trailer: tmdbTrailer(details.videos),
    staff: tmdbKeyStaff(details, movie ? details.credits : details.aggregate_credits, { movie }),
    score: positive(details.vote_average),
    votes: positive(details.vote_count),
    popularity: finite(details.popularity),
    externalIds: {
      imdb: text(ids.imdb_id) || undefined,
      tvdb: positive(ids.tvdb_id) ? String(ids.tvdb_id) : undefined,
      wikidata: text(ids.wikidata_id) || undefined,
    },
    tmdbId: positive(details.id),
  }
}

/**
 * Snapshot of one TMDB season for a season row (`mapTmdbSeason` summary). A TMDB
 * season split over several rows (`shared`) gives its poster and overview only to the
 * row that starts it, and its counts and score to none of them.
 * @param {object | null | undefined} summary
 * @param {{ starts: boolean, shared: boolean }} placement
 * @returns {object | null}
 */
export function tmdbSeasonSnapshot(summary, { starts, shared }) {
  if (!summary) return null
  return {
    overview: starts ? text(summary.overview) : '',
    posterPath: starts ? text(summary.posterPath) : '',
    releaseDate: starts ? dateString(summary.airDate) : null,
    episodeCount: shared ? null : positive(summary.episodeCount),
    score: shared ? null : positive(summary.voteAverage),
    externalIds: {},
  }
}

/**
 * Whether an episode title is only a number ("Episode 28", "第3話"), which sources
 * use until the real title is known.
 * @param {unknown} title
 * @returns {boolean}
 */
export function isPlaceholderTitle(title) {
  const value = text(title)
  return !value || /^(episode|ep\.?)\s*\d+$/i.test(value) || /^第\s*\d+\s*話$/.test(value)
}

/**
 * AniList's streaming episodes ("Episode 3 - The Title", with a thumbnail from the
 * streaming site) by episode number within the entry. Lists numbered across a whole
 * show ("Episode 26" for a second season's first) are renumbered from 1.
 * @param {Array<{ title?: string, thumbnail?: string }>} [episodes] - `streamingEpisodes`
 * @returns {Map<number, { title: string, thumbnail: string }>}
 */
export function anilistStreamingEpisodes(episodes = []) {
  const parsed = []
  for (const episode of episodes || []) {
    const match = /^(?:episode|ep\.?)\s*(\d+)\s*[-–:]\s*(.+)$/i.exec(text(episode?.title))
    if (match)
      parsed.push({
        number: Number(match[1]),
        title: match[2].trim(),
        thumbnail: text(episode.thumbnail),
      })
  }
  const first = Math.min(...parsed.map((episode) => episode.number))
  const offset = Number.isFinite(first) && first > 1 ? first - 1 : 0
  const byNumber = new Map()
  for (const episode of parsed) {
    const number = episode.number - offset
    if (number > 0 && !byNumber.has(number)) byNumber.set(number, episode)
  }
  return byNumber
}

/**
 * One season's episodes from every source, numbered within the season. Titles come
 * from TMDB, then AniList's streaming episodes (titles TMDB hasn't got yet, and anime
 * often has them first); stills, overviews, runtimes, and TMDB ids from TMDB, with
 * AniList's streaming thumbnails where TMDB has no still; air times from AniList's
 * schedule (exact), then TMDB's air date.
 * @param {{ anime?: boolean, count?: number | null, tmdb?: object[],
 *   schedule?: { episode: number, airingAt: number }[], streaming?: object[] }} input
 *   `tmdb`: planned TMDB episodes (`number`, `title`, `overview`, `stillPath`,
 *   `airDate`, `runtime`, `tmdbEpisodeId`, `tmdbScore`); `schedule`: AniList
 *   `airingSchedule` nodes; `streaming`: AniList `streamingEpisodes`.
 * @returns {object[]} Rows for the `episodes` table, by number.
 */
export function mergeEpisodes({
  anime = false,
  count = null,
  tmdb = [],
  schedule = [],
  streaming = [],
}) {
  const byNumber = new Map()
  const row = (number) => {
    if (!byNumber.has(number)) byNumber.set(number, { number })
    return byNumber.get(number)
  }

  const tmdbTitles = new Map()
  for (const episode of tmdb) {
    const number = positive(episode?.number)
    if (!number) continue
    const target = row(number)
    if (!isPlaceholderTitle(episode.title)) tmdbTitles.set(number, text(episode.title))
    target.overview = text(episode.overview) || null
    target.stillPath = text(episode.stillPath) || null
    target.airAt = episode.airDate ? `${dateString(episode.airDate)}T00:00:00Z` : null
    target.runtime = positive(episode.runtime)
    target.tmdbEpisodeId = positive(episode.tmdbEpisodeId)
    target.tmdbScore = positive(episode.tmdbScore)
  }

  for (const node of schedule) {
    const number = positive(node?.episode)
    if (!number || !positive(node.airingAt)) continue
    if (count && number > count) continue
    row(number).airAt = new Date(node.airingAt * 1000).toISOString()
  }

  const streamTitles = new Map()
  for (const [number, episode] of anilistStreamingEpisodes(streaming)) {
    if (count && number > count) continue
    const target = row(number)
    if (!isPlaceholderTitle(episode.title)) streamTitles.set(number, episode.title)
    if (!target.stillPath && episode.thumbnail) target.stillPath = episode.thumbnail
  }

  // Anime: the streaming site's titles (often out first) ahead of TMDB's.
  const titleOrder = anime ? [streamTitles, tmdbTitles] : [tmdbTitles, streamTitles]
  return [...byNumber.values()]
    .filter((episode) => !count || episode.number <= count || tmdbTitles.has(episode.number))
    .sort((left, right) => left.number - right.number)
    .map((episode) => {
      const title = titleOrder.map((titles) => titles.get(episode.number)).find(Boolean)
      return {
        number: episode.number,
        title: title || `Episode ${episode.number}`,
        titleRomaji: null,
        titleNative: null,
        overview: episode.overview ?? null,
        stillPath: episode.stillPath ?? null,
        airAt: episode.airAt ?? null,
        runtime: episode.runtime ?? null,
        isFiller: false,
        isRecap: false,
        tmdbEpisodeId: episode.tmdbEpisodeId ?? null,
        tmdbScore: episode.tmdbScore ?? null,
      }
    })
}

/**
 * Drop missing values so a stored snapshot only holds what the source said.
 * @param {object | null} snapshot
 * @returns {object | null}
 */
export function compactSnapshot(snapshot) {
  if (!snapshot) return null
  const compact = {}
  for (const [key, value] of Object.entries(snapshot)) {
    if (key === 'externalIds') {
      const ids = Object.fromEntries(Object.entries(value || {}).filter(([, id]) => !isMissing(id)))
      if (Object.keys(ids).length) compact.externalIds = ids
    } else if (!isMissing(value)) {
      compact[key] = value
    }
  }
  return compact
}
