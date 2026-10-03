import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import DatabasePopulator, { anilistSearchInput, isAnilistCandidate } from './contentSyncService.js'
import unifiedContentService from './unifiedContentService.js'
import { convertAnilistToContent } from './anilistService.js'

const tmdbPayload = {
  id: 114410,
  name: 'Chainsaw Man',
  original_name: 'チェンソーマン',
  vote_average: 8.4,
  vote_count: 900,
  production_companies: [
    { id: 3464, name: 'MAPPA', logo_path: '/mappa.png' },
    { id: 7440, name: 'Shueisha', logo_path: null },
  ],
}

const malPayload = {
  id: 44511,
  title: 'Chainsaw Man',
  media_type: 'tv',
  num_episodes: 12,
  alternative_titles: { en: 'Chainsaw Man', ja: 'チェンソーマン' },
  studios: [{ id: 569, name: 'MAPPA' }],
}

describe('studio references from upstream payloads', () => {
  it('keeps TMDB company ids and logos', () => {
    const content = unifiedContentService.convertTmdbToContent(tmdbPayload, 'tv')
    assert.deepEqual(content.studioRefs, [
      { name: 'MAPPA', tmdbId: 3464, imagePath: '/mappa.png' },
      { name: 'Shueisha', tmdbId: 7440, imagePath: undefined },
    ])
  })

  it('keeps MAL producer ids', () => {
    const content = unifiedContentService.convertMalToContent(malPayload)
    assert.deepEqual(content.studios, ['MAPPA'])
    assert.deepEqual(content.studioRefs, [{ name: 'MAPPA', malId: 569 }])
  })
})

describe('studio merge policy', () => {
  it('replaces studios with the MAL animation studio list', async () => {
    const populator = new DatabasePopulator()
    const existing = { title: 'Chainsaw Man', studios: ['Shueisha', 'MAPPA'], genres: [] }
    const malData = unifiedContentService.convertMalToContent(malPayload)
    await populator.mergeMalIntoExisting(existing, malData, { save: false })
    assert.deepEqual(existing.studios, ['MAPPA'])
    assert.deepEqual(existing.studioRefs, [{ name: 'MAPPA', malId: 569 }])
  })

  it('keeps MAL studios when TMDB production companies arrive', async () => {
    const populator = new DatabasePopulator()
    const existing = { title: 'Chainsaw Man', malId: 44511, studios: ['MAPPA'], genres: [] }
    const tmdbData = unifiedContentService.convertTmdbToContent(tmdbPayload, 'tv')
    await populator.mergeTmdbIntoExisting(existing, tmdbData, { save: false })
    assert.deepEqual(existing.studios, ['MAPPA'])
  })

  it('uses TMDB production companies when the title has no MAL studios', async () => {
    const populator = new DatabasePopulator()
    const existing = { title: 'Chainsaw Man', studios: [], genres: [] }
    const tmdbData = unifiedContentService.convertTmdbToContent(tmdbPayload, 'tv')
    await populator.mergeTmdbIntoExisting(existing, tmdbData, { save: false })
    assert.deepEqual(existing.studios, ['MAPPA', 'Shueisha'])
    assert.equal(existing.studioRefs[0].tmdbId, 3464)
  })
})

const anilistMedia = {
  id: 127230,
  idMal: 44511,
  format: 'TV',
  title: { romaji: 'Chainsaw Man', english: 'Chainsaw Man', native: 'チェンソーマン' },
  synonyms: ['CSM'],
  description: 'Denji is a teenage boy.<br>~!Spoiler!~',
  coverImage: { extraLarge: 'https://s4.anilist.co/cover.jpg' },
  studios: {
    edges: [
      { isMain: false, node: { id: 6570, name: 'Shueisha', isAnimationStudio: false } },
      { isMain: true, node: { id: 569, name: 'MAPPA', isAnimationStudio: true } },
    ],
  },
}

describe('AniList merge policy', () => {
  it('keeps MAL studios and attaches AniList studio ids to the same studios', async () => {
    const populator = new DatabasePopulator()
    const existing = {
      title: 'Chainsaw Man',
      malId: 44511,
      studios: ['MAPPA'],
      studioRefs: [{ name: 'MAPPA', malId: 569 }],
      genres: [],
    }
    await populator.mergeAnilistIntoExisting(existing, convertAnilistToContent(anilistMedia), {
      save: false,
    })
    assert.equal(existing.anilistId, 127230)
    assert.deepEqual(existing.studios, ['MAPPA'])
    assert.deepEqual(existing.studioRefs, [
      { name: 'MAPPA', malId: 569 },
      { name: 'MAPPA', anilistId: 569 },
    ])
    assert.ok(existing.alternativeTitles.includes('CSM'))
  })

  it('replaces TMDB companies with AniList animation studios on non-MAL titles', async () => {
    const populator = new DatabasePopulator()
    const existing = { title: 'Chainsaw Man', studios: [], genres: [] }
    const tmdbData = unifiedContentService.convertTmdbToContent(tmdbPayload, 'tv')
    await populator.mergeTmdbIntoExisting(existing, tmdbData, { save: false })
    await populator.mergeAnilistIntoExisting(existing, convertAnilistToContent(anilistMedia), {
      save: false,
    })
    assert.deepEqual(existing.studios, ['MAPPA'])
    assert.deepEqual(existing.studioRefs, [
      { name: 'MAPPA', anilistId: 569 },
      { name: 'MAPPA', tmdbId: 3464, imagePath: '/mappa.png' },
    ])
  })

  it('fills a missing overview without AniList spoilers or markup', async () => {
    const populator = new DatabasePopulator()
    const existing = { title: 'Chainsaw Man', studios: [], genres: [] }
    await populator.mergeAnilistIntoExisting(existing, convertAnilistToContent(anilistMedia), {
      save: false,
    })
    assert.equal(existing.overview, 'Denji is a teenage boy.')
  })
})

describe('AniList search input', () => {
  it('only searches East Asian TMDB titles', () => {
    assert.equal(isAnilistCandidate({ originCountries: ['JP'] }), true)
    assert.equal(isAnilistCandidate({ originCountries: ['US'] }), false)
  })

  it('uses every title and the release year', () => {
    const input = anilistSearchInput({
      englishTitle: 'Chainsaw Man',
      nativeTitle: 'チェンソーマン',
      contentType: 'tv',
      releaseDate: '2022-10-12',
    })
    assert.deepEqual(input, { titles: ['Chainsaw Man', 'チェンソーマン'], contentType: 'tv', year: 2022 })
  })
})
