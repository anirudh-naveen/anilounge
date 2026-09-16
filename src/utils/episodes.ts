/**
 * episodes.ts — TV episode list helpers.
 *
 * Groups catalog episode cards by season and formats labels used by the
 * horizontal episode row on TV details.
 */

import type { Episode } from '@/types/content'

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
