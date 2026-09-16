import { describe, expect, it } from 'vitest'
import {
  MOVIE_CATALOG_TABS,
  TV_CATALOG_TABS,
  catalogTabHasPagination,
  getMovieCatalogTab,
  getTvCatalogTab,
  isMovieCatalogPath,
  isTvCatalogPath,
  movieCatalogLocationFromUrl,
  movieCatalogPath,
  movieCatalogRouteQuery,
  movieCatalogScrollKey,
  normalizeMovieCatalogTab,
  normalizeTvCatalogTab,
  parseMovieCatalogPage,
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
    expect(tvCatalogPath('popular', 2)).toBe('/tv')
    expect(tvCatalogPath('airing', 2)).toBe('/tv?tab=airing&page=2')
    expect(tvCatalogScrollKey('upcoming', 3)).toBe('tv-page-upcoming-3')
  })

  it('parses catalog URLs including the legacy /tv-shows path', () => {
    expect(isTvCatalogPath('/tv')).toBe(true)
    expect(isTvCatalogPath('/tv-shows')).toBe(true)
    expect(parseTvCatalogPage('4')).toBe(4)
    expect(parseTvCatalogPage('0')).toBe(1)
    expect(parseTvCatalogPage('4', 'popular')).toBe(1)

    const location = tvCatalogLocationFromUrl(
      new URL('https://example.test/tv-shows?tab=upcoming&page=3'),
    )
    expect(location.path).toBe('/tv')
    expect(location.query).toEqual({ tab: 'upcoming', page: '3' })
    expect(location.scrollKey).toBe('tv-page-upcoming-3')
    expect(getTvCatalogTab('airing').label).toBe('Currently Airing')
  })

  it('treats popular as a single page', () => {
    expect(catalogTabHasPagination('popular')).toBe(false)
    expect(catalogTabHasPagination('airing')).toBe(true)
  })
})

describe('Movie catalog tabs', () => {
  it('exposes Popular Right Now, Now in Theatres, and Upcoming Highlights', () => {
    expect(MOVIE_CATALOG_TABS.map((tab) => tab.label)).toEqual([
      'Popular Right Now',
      'Now in Theatres',
      'Upcoming Highlights',
    ])
  })

  it('normalizes unknown or missing tab values to popular', () => {
    expect(normalizeMovieCatalogTab(undefined)).toBe('popular')
    expect(normalizeMovieCatalogTab('airing')).toBe('popular')
    expect(normalizeMovieCatalogTab(['theatres'])).toBe('theatres')
    expect(normalizeMovieCatalogTab('upcoming')).toBe('upcoming')
  })

  it('omits default popular/page-1 params from the catalog URL', () => {
    expect(movieCatalogRouteQuery('popular', 1)).toEqual({})
    expect(movieCatalogPath('popular', 2)).toBe('/movies')
    expect(movieCatalogPath('theatres', 2)).toBe('/movies?tab=theatres&page=2')
    expect(movieCatalogScrollKey('upcoming', 3)).toBe('movies-page-upcoming-3')
  })

  it('parses catalog URLs', () => {
    expect(isMovieCatalogPath('/movies')).toBe(true)
    expect(parseMovieCatalogPage('4', 'popular')).toBe(1)
    expect(parseMovieCatalogPage('4', 'upcoming')).toBe(4)

    const location = movieCatalogLocationFromUrl(
      new URL('https://example.test/movies?tab=theatres&page=2'),
    )
    expect(location.path).toBe('/movies')
    expect(location.query).toEqual({ tab: 'theatres', page: '2' })
    expect(location.scrollKey).toBe('movies-page-theatres-2')
    expect(getMovieCatalogTab('theatres').label).toBe('Now in Theatres')
  })
})
