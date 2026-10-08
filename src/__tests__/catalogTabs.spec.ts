import { describe, expect, it } from 'vitest'
import {
  MOVIE_CATALOG_TABS,
  MOVIE_BROWSE_RAILS,
  TV_CATALOG_TABS,
  TV_BROWSE_RAILS,
  catalogLocationFromUrl,
  catalogPath,
  catalogRouteQuery,
  catalogScrollKey,
  catalogTabHasPagination,
  getCatalogTab,
  isMovieCatalogPath,
  isTvCatalogPath,
  normalizeBrowseType,
  normalizeCatalogTab,
  parseCatalogPage,
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
    expect(normalizeCatalogTab('tv', undefined)).toBe('popular')
    expect(normalizeCatalogTab('tv', 'nope')).toBe('popular')
    expect(normalizeCatalogTab('tv', ['airing'])).toBe('airing')
    expect(normalizeCatalogTab('tv', 'upcoming')).toBe('upcoming')
  })

  it('omits default popular/page-1 params from the catalog URL', () => {
    expect(catalogRouteQuery('popular', 1)).toEqual({})
    expect(catalogPath('tv', 'popular', 1)).toBe('/tv')
    expect(catalogPath('tv', 'popular', 2)).toBe('/tv')
    expect(catalogPath('tv', 'airing', 2)).toBe('/tv?tab=airing&page=2')
    expect(catalogScrollKey('tv', 'upcoming', 3)).toBe('tv-page-upcoming-3')
  })

  it('parses catalog URLs including the legacy /tv-shows path', () => {
    expect(isTvCatalogPath('/tv')).toBe(true)
    expect(isTvCatalogPath('/tv-shows')).toBe(true)
    expect(parseCatalogPage('4')).toBe(4)
    expect(parseCatalogPage('0')).toBe(1)
    expect(parseCatalogPage('4', 'popular')).toBe(1)

    const location = catalogLocationFromUrl(
      'tv',
      new URL('https://example.test/tv-shows?tab=upcoming&page=3'),
    )
    expect(location.path).toBe('/tv')
    expect(location.query).toEqual({ tab: 'upcoming', page: '3' })
    expect(location.scrollKey).toBe('tv-page-upcoming-3')
    expect(getCatalogTab('tv', 'airing').label).toBe('Airing Right Now')
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
    expect(normalizeCatalogTab('movie', undefined)).toBe('popular')
    expect(normalizeCatalogTab('movie', 'airing')).toBe('popular')
    expect(normalizeCatalogTab('movie', ['theatres'])).toBe('theatres')
    expect(normalizeCatalogTab('movie', 'upcoming')).toBe('upcoming')
  })

  it('omits default popular/page-1 params from the catalog URL', () => {
    expect(catalogRouteQuery('popular', 1)).toEqual({})
    expect(catalogPath('movie', 'popular', 2)).toBe('/movies')
    expect(catalogPath('movie', 'theatres', 2)).toBe('/movies?tab=theatres&page=2')
    expect(catalogScrollKey('movie', 'upcoming', 3)).toBe('movies-page-upcoming-3')
  })

  it('parses catalog URLs', () => {
    expect(isMovieCatalogPath('/movies')).toBe(true)
    expect(parseCatalogPage('4', 'popular')).toBe(1)
    expect(parseCatalogPage('4', 'upcoming')).toBe(4)

    const location = catalogLocationFromUrl(
      'movie',
      new URL('https://example.test/movies?tab=theatres&page=2'),
    )
    expect(location.path).toBe('/movies')
    expect(location.query).toEqual({ tab: 'theatres', page: '2' })
    expect(location.scrollKey).toBe('movies-page-theatres-2')
    expect(getCatalogTab('movie', 'theatres').label).toBe('In Theatres Now')
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
