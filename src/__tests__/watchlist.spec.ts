import { describe, expect, it } from 'vitest'
import {
  averageSeasonRating,
  getWatchlistStatusLabel,
  summarizeSeasonStatuses,
  watchedEpisodes,
  WATCHLIST_STATUS_FILTER_OPTIONS,
  WATCHLIST_TYPE_FILTER_OPTIONS,
} from '@/utils/watchlist'
import { matchesContentTypeFilter } from '@/services/api'

describe('watchlist status labels', () => {
  it('maps stored statuses to the labels used on the watchlist page', () => {
    expect(getWatchlistStatusLabel('all')).toBe('All')
    expect(getWatchlistStatusLabel('plan_to_watch')).toBe('Planned')
    expect(getWatchlistStatusLabel('watching')).toBe('Watching')
    expect(getWatchlistStatusLabel('completed')).toBe('Completed')
    expect(getWatchlistStatusLabel('on_hold')).toBe('On Hold')
    expect(getWatchlistStatusLabel('dropped')).toBe('Dropped')
  })

  it('includes All plus every saved status in the filter dropdown', () => {
    expect(WATCHLIST_STATUS_FILTER_OPTIONS.map((opt) => opt.value)).toEqual([
      'all',
      'plan_to_watch',
      'watching',
      'completed',
      'on_hold',
      'dropped',
    ])
  })

  it('falls back when a title is saved without a known status', () => {
    expect(getWatchlistStatusLabel()).toBe('In Watchlist')
    expect(getWatchlistStatusLabel('unknown')).toBe('In Watchlist')
  })
})

describe('watchedEpisodes', () => {
  it('puts completed titles on their last episode when the total is known', () => {
    expect(watchedEpisodes('completed', 3, 12)).toBe(12)
    expect(watchedEpisodes('completed', 3, 0)).toBe(3)
    expect(watchedEpisodes('watching', 3, 12)).toBe(3)
    expect(watchedEpisodes('plan_to_watch', undefined, 12)).toBe(0)
  })
})

describe('watchlist type filters', () => {
  it('offers All, Movies, Series, and Seasons chips that sort titles by kind', () => {
    expect(WATCHLIST_TYPE_FILTER_OPTIONS.map((opt) => opt.value)).toEqual([
      'all',
      'movie',
      'series',
      'season',
    ])
    expect(matchesContentTypeFilter('movie', 'movie')).toBe(true)
    expect(matchesContentTypeFilter('tv', 'movie')).toBe(false)
    expect(matchesContentTypeFilter('season', 'tv')).toBe(true)
    expect(matchesContentTypeFilter('tv', 'series')).toBe(true)
    expect(matchesContentTypeFilter('season', 'series')).toBe(false)
    expect(matchesContentTypeFilter('season', 'season')).toBe(true)
    expect(matchesContentTypeFilter('tv', 'season')).toBe(false)
    expect(matchesContentTypeFilter('movie', 'all')).toBe(true)
  })
})

describe('series summed up from their seasons', () => {
  it('is completed only once every season is', () => {
    expect(summarizeSeasonStatuses(['completed', 'completed'], 2)).toBe('completed')
    expect(summarizeSeasonStatuses(['completed'], 3)).toBe('watching')
    expect(summarizeSeasonStatuses(['completed', 'on_hold'])).toBe('on_hold')
    expect(summarizeSeasonStatuses([], 2)).toBeUndefined()
  })

  it('rates a series as the average of its rated seasons', () => {
    expect(averageSeasonRating([8, 9, undefined, null])).toBe(8.5)
    expect(averageSeasonRating([7, 8, 8])).toBe(7.7)
    expect(averageSeasonRating([undefined])).toBeUndefined()
  })
})
