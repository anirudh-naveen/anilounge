import { describe, expect, it } from 'vitest'
import {
  MOVIE_CATALOG_TABS,
  MOVIE_BROWSE_RAILS,
  TV_CATALOG_TABS,
  TV_BROWSE_RAILS,
  catalogTabHasPagination,
  getMovieCatalogTab,
  getTvCatalogTab,
  isMovieCatalogPath,
  isTvCatalogPath,
  movieCatalogLocationFromUrl,
  movieCatalogPath,
  movieCatalogRouteQuery,
  movieCatalogScrollKey,
  normalizeBrowseType,
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
  it('exposes Currently Trending, Airing Right Now, and Upcoming Highlights', () => {
    expect(TV_CATALOG_TABS.map((tab) => tab.label)).toEqual([
      'Currently Trending',
      'Airing Right Now',
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
    expect(getTvCatalogTab('airing').label).toBe('Airing Right Now')
  })

  it('treats popular as a single page', () => {
    expect(catalogTabHasPagination('popular')).toBe(false)
    expect(catalogTabHasPagination('airing')).toBe(true)
  })
})

describe('Movie catalog tabs', () => {
  it('exposes Currently Trending, In Theatres Now, and Upcoming Highlights', () => {
    expect(MOVIE_CATALOG_TABS.map((tab) => tab.label)).toEqual([
      'Currently Trending',
      'In Theatres Now',
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
    expect(getMovieCatalogTab('theatres').label).toBe('In Theatres Now')
  })
})

describe('Search browse type', () => {
  it('defaults to movies and treats tv as series', () => {
    expect(normalizeBrowseType(undefined)).toBe('movie')
    expect(normalizeBrowseType('tv')).toBe('tv')
    expect(normalizeBrowseType(['tv'])).toBe('tv')
    expect(normalizeBrowseType('movie')).toBe('movie')
  })

  it('builds view-all links for the three rails', () => {
    expect(MOVIE_BROWSE_RAILS.map((rail) => rail.title)).toEqual([
      'Currently Trending',
      'In Theatres Now',
      'Upcoming Highlights',
    ])
    expect(TV_BROWSE_RAILS.map((rail) => [rail.title, rail.viewAll])).toEqual([
      ['Currently Trending', '/tv'],
      ['Airing Right Now', '/tv?tab=airing'],
      ['Upcoming Highlights', '/tv?tab=upcoming'],
    ])
  })
})
