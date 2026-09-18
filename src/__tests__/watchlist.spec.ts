import { describe, expect, it } from 'vitest'
import { getWatchlistStatusLabel, WATCHLIST_STATUS_FILTER_OPTIONS } from '@/utils/watchlist'

describe('watchlist status labels', () => {
  it('maps stored statuses to the labels used on the watchlist page', () => {
    expect(getWatchlistStatusLabel('all')).toBe('All')
    expect(getWatchlistStatusLabel('plan_to_watch')).toBe('Planned')
    expect(getWatchlistStatusLabel('watching')).toBe('Watching')
    expect(getWatchlistStatusLabel('completed')).toBe('Completed')
    expect(getWatchlistStatusLabel('dropped')).toBe('Dropped')
  })

  it('includes All plus every saved status in the filter dropdown', () => {
    expect(WATCHLIST_STATUS_FILTER_OPTIONS.map((opt) => opt.value)).toEqual([
      'all',
      'plan_to_watch',
      'watching',
      'completed',
      'dropped',
    ])
  })

  it('falls back when a title is saved without a known status', () => {
    expect(getWatchlistStatusLabel()).toBe('In Watchlist')
    expect(getWatchlistStatusLabel('unknown')).toBe('In Watchlist')
  })
})
