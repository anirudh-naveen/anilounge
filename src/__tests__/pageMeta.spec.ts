import { describe, expect, it } from 'vitest'
import { aggregateRating, entityPageMeta, genreNames, titlePageMeta } from '@/utils/pageMeta'
import type { UnifiedContent } from '@/types/content'
import type { PageMeta } from '@/composables/usePageMeta'

/** The page's own schema.org object (the first; breadcrumbs follow). */
const main = (meta: PageMeta) => (meta.jsonLd as Record<string, unknown>[])[0]!
const crumbs = (meta: PageMeta) =>
  (meta.jsonLd as Array<{ itemListElement?: Array<{ name: string; item: string }> }>)[1]!
    .itemListElement!

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
    expect(main(meta)).toMatchObject({
      '@type': 'TVSeries',
      startDate: '2013-04-07',
      numberOfEpisodes: 25,
      genre: ['Action', 'Drama'],
      image: 'https://img.test/p.jpg',
      productionCompany: [{ '@type': 'Organization', name: 'Wit Studio' }],
    })
    expect(String(main(meta).url)).toMatch(/\/tv-show\/t1$/)
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
    expect(main(meta)['@type']).toBe('Movie')
    expect(main(meta)).not.toHaveProperty('image')
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
    expect(main(meta)).toMatchObject({ '@type': 'Person', additionalType: 'FictionalCharacter' })
  })

  it('uses the about text and organization type for a studio', () => {
    const meta = entityPageMeta(
      'studio',
      { name: 'Wit Studio', about: 'Tokyo studio.' },
      { path: '/studio/s1', image: null },
    )
    expect(meta.description).toBe('Tokyo studio.')
    expect(main(meta)['@type']).toBe('Organization')
  })
})

describe('genreNames', () => {
  it('reads string and object genres', () => {
    expect(
      genreNames({ genres: ['A', { name: 'B' }, { id: 3 }] as UnifiedContent['genres'] }),
    ).toEqual(['A', 'B'])
  })
})

describe('ratings and breadcrumbs', () => {
  it('adds stars only from enough AniLounge ratings', () => {
    expect(aggregateRating(8.25, 2)).toBeNull()
    expect(aggregateRating(8.25, 3)).toMatchObject({
      ratingValue: 8.3,
      bestRating: 10,
      ratingCount: 3,
    })
    const rated = titlePageMeta(title({ userRatingAverage: 9, userRatingCount: 4 }), {
      path: '/tv-show/t1',
      image: null,
    })
    expect(main(rated).aggregateRating).toMatchObject({ ratingValue: 9, ratingCount: 4 })
    expect(main(titlePageMeta(title(), { path: '/tv-show/t1', image: null }))).not.toHaveProperty(
      'aggregateRating',
    )
  })

  it('puts titles under their catalog and characters under their title', () => {
    const show = titlePageMeta(title(), { path: '/tv-show/t1/attack-on-titan', image: null })
    expect(crumbs(show).map((item) => item.name)).toEqual([
      'AniLounge',
      'Animated Series',
      'Attack on Titan',
    ])
    expect(crumbs(show)[1]!.item).toMatch(/\/tv$/)
    const levi = entityPageMeta(
      'character',
      { name: 'Levi' },
      {
        path: '/character/c1/levi',
        image: null,
        parent: { name: 'Attack on Titan', path: '/tv-show/t1' },
      },
    )
    expect(crumbs(levi).map((item) => item.name)).toEqual(['AniLounge', 'Attack on Titan', 'Levi'])
  })
})
