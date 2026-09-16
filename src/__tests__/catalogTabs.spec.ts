import { describe, expect, it } from 'vitest'
import {
  TV_CATALOG_TABS,
  getTvCatalogTab,
  isTvCatalogPath,
  normalizeTvCatalogTab,
  parseTvCatalogPage,
  tvCatalogLocationFromUrl,
  tvCatalogPath,
  tvCatalogRouteQuery,
  tvCatalogScrollKey,
} from '@/utils/catalogTabs'

describe('TV catalog tabs', () => {
  it('exposes Popular Right Now, Currently Airing, and Upcoming Highlights', () => {
    expect(TV_CATALOG_TABS.map((tab) => tab.label)).toEqual([
      'Popular Right Now',
      'Currently Airing',
      'Upcoming Highlights',
    ])
  })

  it('normalizes unknown or missing tab values to popular', () => {
    expect(normalizeTvCatalogTab(undefined)).toBe('popular')
    expect(normalizeTvCatalogTab('nope')).toBe('popular')
    expect(normalizeTvCatalogTab(['airing'])).toBe('airing')
    expect(normalizeTvCatalogTab('upcoming')).toBe('upcoming')
  })

  it('omits default popular/page-1 params from the catalog URL', () => {
    expect(tvCatalogRouteQuery('popular', 1)).toEqual({})
    expect(tvCatalogPath('popular', 1)).toBe('/tv')
    expect(tvCatalogPath('airing', 2)).toBe('/tv?tab=airing&page=2')
    expect(tvCatalogScrollKey('upcoming', 3)).toBe('tv-page-upcoming-3')
  })

  it('parses catalog URLs including the legacy /tv-shows path', () => {
    expect(isTvCatalogPath('/tv')).toBe(true)
    expect(isTvCatalogPath('/tv-shows')).toBe(true)
    expect(parseTvCatalogPage('4')).toBe(4)
    expect(parseTvCatalogPage('0')).toBe(1)

    const location = tvCatalogLocationFromUrl(
      new URL('https://example.test/tv-shows?tab=upcoming&page=3'),
    )
    expect(location.path).toBe('/tv')
    expect(location.query).toEqual({ tab: 'upcoming', page: '3' })
    expect(location.scrollKey).toBe('tv-page-upcoming-3')
    expect(getTvCatalogTab('airing').label).toBe('Currently Airing')
  })
})
