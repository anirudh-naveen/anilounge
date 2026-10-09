import { describe, expect, it } from 'vitest'
import { entityPageMeta, genreNames, titlePageMeta } from '@/utils/pageMeta'
import type { UnifiedContent } from '@/types/content'

const title = (overrides: Partial<UnifiedContent> = {}) =>
  ({
    _id: 't1',
    title: 'Shingeki no Kyojin',
    englishTitle: 'Attack on Titan',
    overview: 'Humanity fights the Titans.',
    contentType: 'tv',
    genres: [{ name: 'Action' }, 'Drama'],
    releaseDate: '2013-04-07',
    episodeCount: 25,
    studios: ['Wit Studio'],
    ...overrides,
  }) as UnifiedContent

describe('titlePageMeta', () => {
  it('describes a series with its year, season, and schema.org data', () => {
    const meta = titlePageMeta(title(), {
      path: '/tv-show/t1',
      image: 'https://img.test/p.jpg',
      seasonLabel: 'Season 2',
    })
    expect(meta.title).toMatch(/Season 2 \(2013\)$/)
    expect(meta.description).toContain('Humanity fights the Titans.')
    expect(meta.jsonLd).toMatchObject({
      '@type': 'TVSeries',
      startDate: '2013-04-07',
      numberOfEpisodes: 25,
      genre: ['Action', 'Drama'],
      image: 'https://img.test/p.jpg',
      productionCompany: [{ '@type': 'Organization', name: 'Wit Studio' }],
    })
    expect(String(meta.jsonLd?.url)).toMatch(/\/tv-show\/t1$/)
  })

  it('writes a description for a movie without an overview', () => {
    const meta = titlePageMeta(
      title({ contentType: 'movie', overview: '', releaseDate: undefined }),
      {
        path: '/movie/t1',
        image: null,
      },
    )
    expect(meta.description).toMatch(/an animated movie · Action, Drama/)
    expect(meta.jsonLd?.['@type']).toBe('Movie')
    expect(meta.jsonLd).not.toHaveProperty('image')
  })
})

describe('entityPageMeta', () => {
  it('falls back to the works a character appears in', () => {
    const meta = entityPageMeta(
      'character',
      { name: 'Levi', about: '' },
      { path: '/character/c1', image: null, works: ['Attack on Titan'] },
    )
    expect(meta.description).toContain('a character from Attack on Titan')
    expect(meta.jsonLd).toMatchObject({ '@type': 'Person', additionalType: 'FictionalCharacter' })
  })

  it('uses the about text and organization type for a studio', () => {
    const meta = entityPageMeta(
      'studio',
      { name: 'Wit Studio', about: 'Tokyo studio.' },
      { path: '/studio/s1', image: null },
    )
    expect(meta.description).toBe('Tokyo studio.')
    expect(meta.jsonLd?.['@type']).toBe('Organization')
  })
})

describe('genreNames', () => {
  it('reads string and object genres', () => {
    expect(
      genreNames({ genres: ['A', { name: 'B' }, { id: 3 }] as UnifiedContent['genres'] }),
    ).toEqual(['A', 'B'])
  })
})
