/**
 * episodes.ts — TV episode list helpers.
 *
 * Groups catalog episode cards by season, formats labels used by the
 * horizontal episode row on TV details, and resolves which season (and whose
 * details) a TV details route shows.
 */

import type { Episode, SeasonSummary, UnifiedContent } from '@/types/content'

/**
 * Stable key for one episode within a series.
 * @param episode - Season and episode numbers.
 * @returns `"season-episode"` string, e.g. `"1-8"`.
 */
export function episodeKey(episode: Pick<Episode, 'seasonNumber' | 'episodeNumber'>) {
  return `${episode.seasonNumber}-${episode.episodeNumber}`
}

/**
 * Distinct season numbers in ascending order.
 * @param episodes - Episode cards for a series.
 * @returns Unique season numbers.
 */
export function getSeasonNumbers(episodes: Episode[]) {
  return [...new Set(episodes.map((episode) => episode.seasonNumber))].sort(
    (left, right) => left - right,
  )
}

/**
 * Episodes in one season, ordered by episode number.
 * @param episodes - Episode cards for a series.
 * @param seasonNumber - Season to keep.
 * @returns Filtered, sorted episode list.
 */
export function episodesForSeason(episodes: Episode[], seasonNumber: number) {
  return episodes
    .filter((episode) => episode.seasonNumber === seasonNumber)
    .sort((left, right) => left.episodeNumber - right.episodeNumber)
}

/**
 * Short index label: `Episode 3` for single-season shows, `S2E3` otherwise.
 * @param episode - Episode to label.
 * @param multiSeason - True when the series has more than one season in the list.
 * @returns Display index string.
 */
export function formatEpisodeIndex(episode: Episode, multiSeason: boolean) {
  if (multiSeason) return `S${episode.seasonNumber}E${episode.episodeNumber}`
  return `Episode ${episode.episodeNumber}`
}

/**
 * Heading for a season: `Season 2`, or `Season 4 · The Final Season` when it has its own name.
 * @param season - Season summary.
 * @returns Display label.
 */
export function formatSeasonLabel(season: Pick<SeasonSummary, 'seasonNumber' | 'name'>) {
  const plain = `Season ${season.seasonNumber}`
  const name = season.name?.trim()
  return !name || name.toLowerCase() === plain.toLowerCase() ? plain : `${plain} · ${name}`
}

/**
 * Season a details route points at: the `?season=` number when that season
 * has no title of its own (or is this title), else the season this title is.
 * @param seasons - Season guide for the show.
 * @param contentId - Route content id.
 * @param requested - Raw `season` query value.
 * @returns Matching season, or null.
 */
export function findRouteSeason(seasons: SeasonSummary[], contentId: string, requested?: unknown) {
  const number = Number(Array.isArray(requested) ? requested[0] : requested)
  return (
    seasons.find(
      (season) =>
        season.seasonNumber === number && (!season.contentId || season.contentId === contentId),
    ) ||
    seasons.find((season) => season.contentId === contentId) ||
    null
  )
}

/**
 * Details for a season with no catalog title of its own: the show with the
 * season's poster, overview, premiere, episode count, and TMDB score. Earlier
 * seasons are finished, so the show's airing schedule only applies to the latest.
 * @param series - The show the season belongs to.
 * @param season - Season summary.
 * @param isLatest - Whether this is the show's newest season.
 * @returns Content shaped for the details header.
 */
export function seasonContent(
  series: UnifiedContent,
  season: SeasonSummary,
  isLatest: boolean,
): UnifiedContent {
  const view: UnifiedContent = {
    ...series,
    posterPath: season.posterPath || series.posterPath,
    overview: season.overview || series.overview,
    releaseDate: season.airDate || series.releaseDate,
    episodeCount: season.episodeCount || undefined,
    malEpisodes: undefined,
  }
  if (season.voteAverage) {
    Object.assign(view, {
      voteAverage: undefined,
      voteCount: undefined,
      malScore: undefined,
      malScoredBy: undefined,
      userRatingAverage: undefined,
      userRatingCount: undefined,
      unifiedScore: season.voteAverage,
    })
  }
  if (!isLatest) {
    Object.assign(view, {
      malStatus: 'finished_airing',
      nextEpisodeAirDate: undefined,
      nextEpisodeNumber: undefined,
      nextEpisodeSeason: undefined,
    })
  }
  return view
}
