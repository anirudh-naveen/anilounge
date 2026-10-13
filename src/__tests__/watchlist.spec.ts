import { describe, expect, it } from 'vitest'
import {
  averageSeasonRating,
  getWatchlistStatusLabel,
  summarizeSeasonStatuses,
  type WatchlistStatus,
  watchedEpisodes,
  WATCHLIST_STATUS_FILTER_OPTIONS,
  WATCHLIST_TYPE_FILTER_OPTIONS,
  readTypeChips,
  toggleTypeChip,
} from '@/utils/watchlist'
import { matchesContentTypeFilter } from '@/services/api'
import type { UnifiedContent } from '@/types/content'
import {
  defaultCatalogFilters,
  matchesCatalogFilters,
  readCatalogFilters,
} from '@/utils/catalogFilters'

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
  it('offers Movies, Series, and Seasons chips that sort titles by kind', () => {
    expect(WATCHLIST_TYPE_FILTER_OPTIONS.map((opt) => opt.value)).toEqual([
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

  it('keeps Series and Seasons apart and never leaves no chip picked', () => {
    expect(toggleTypeChip(['movie', 'series'], 'season')).toEqual(['movie', 'season'])
    expect(toggleTypeChip(['season'], 'series')).toEqual(['series'])
    expect(toggleTypeChip(['movie', 'series'], 'movie')).toEqual(['series'])
    expect(toggleTypeChip(['series'], 'series')).toEqual(['series'])
    expect(toggleTypeChip(['series'], 'movie')).toEqual(['series', 'movie'])
  })

  it('reads saved type chips, falling back to Movies and Series', () => {
    expect(readTypeChips(undefined)).toEqual(['movie', 'series'])
    expect(readTypeChips([])).toEqual(['movie', 'series'])
    expect(readTypeChips(['all', 'bogus'])).toEqual(['movie', 'series'])
    expect(readTypeChips(['season', 'movie'])).toEqual(['movie', 'season'])
    expect(readTypeChips(['series', 'season'])).toEqual(['series'])
  })
})

describe('series summed up from their seasons', () => {
  const s1 = (status: WatchlistStatus) => ({ status, first: true })
  const later = (status: WatchlistStatus) => ({ status, first: false })

  const upcoming = (status: WatchlistStatus) => ({ status, first: false, released: false })

  it('is completed once every released season is', () => {
    expect(summarizeSeasonStatuses([s1('completed'), later('completed')], 2)).toBe('completed')
    expect(summarizeSeasonStatuses([s1('completed'), upcoming('plan_to_watch')], 1)).toBe(
      'completed',
    )
    expect(summarizeSeasonStatuses([], 2)).toBeUndefined()
  })

  it('is on hold when listed seasons are done but a released one is not listed', () => {
    expect(summarizeSeasonStatuses([s1('completed')], 3)).toBe('on_hold')
  })

  it('is watching while any season is, then dropped, then on hold', () => {
    expect(summarizeSeasonStatuses([s1('dropped'), later('watching')])).toBe('watching')
    expect(summarizeSeasonStatuses([s1('completed'), later('dropped')])).toBe('dropped')
    expect(summarizeSeasonStatuses([s1('completed'), later('on_hold')])).toBe('on_hold')
  })

  it('is planned until something is done, then on hold unless a season is being watched', () => {
    expect(summarizeSeasonStatuses([s1('plan_to_watch')])).toBe('plan_to_watch')
    expect(summarizeSeasonStatuses([s1('plan_to_watch'), later('plan_to_watch')])).toBe(
      'plan_to_watch',
    )
    expect(summarizeSeasonStatuses([upcoming('plan_to_watch')])).toBe('plan_to_watch')
    expect(summarizeSeasonStatuses([later('plan_to_watch')])).toBe('on_hold')
    expect(summarizeSeasonStatuses([s1('completed'), later('plan_to_watch')], 2)).toBe('on_hold')
    expect(summarizeSeasonStatuses([s1('completed'), later('watching')], 2)).toBe('watching')
  })

  it('rates a series as the average of its rated seasons', () => {
    expect(averageSeasonRating([8, 9, undefined, null])).toBe(8.5)
    expect(averageSeasonRating([7, 8, 8])).toBe(7.7)
    expect(averageSeasonRating([undefined])).toBeUndefined()
  })
})

describe('catalog filters', () => {
  it('reads saved filters, dropping bad fields and keeping the rating range in order', () => {
    expect(readCatalogFilters(undefined)).toEqual(defaultCatalogFilters())
    expect(
      readCatalogFilters({ genre: 'Drama', year: 2024, ratingMin: 8, ratingMax: 3, country: 'JP' }),
    ).toEqual({
      ...defaultCatalogFilters(),
      genre: 'Drama',
      ratingMin: 8,
      ratingMax: 8,
      country: 'JP',
    })
    expect(readCatalogFilters({ ratingMin: Number.NaN }).ratingMin).toBe(1)
  })

  it('matches titles by genre and community rating', () => {
    const title = {
      _id: 'x',
      title: 'X',
      contentType: 'movie',
      genres: [{ name: 'Drama' }],
    } as unknown as UnifiedContent
    expect(matchesCatalogFilters(title, defaultCatalogFilters())).toBe(true)
    expect(matchesCatalogFilters(title, { ...defaultCatalogFilters(), genre: 'Drama' })).toBe(true)
    expect(matchesCatalogFilters(title, { ...defaultCatalogFilters(), genre: 'Comedy' })).toBe(
      false,
    )
    // Unrated titles drop out once the rating range is narrowed.
    expect(matchesCatalogFilters(title, { ...defaultCatalogFilters(), ratingMin: 5 })).toBe(false)
  })
})
