import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  THEATRICAL_WINDOW_MS,
  catalogTabIsSinglePage,
  matchMovieCatalogTab,
  matchTvCatalogTab,
  mergeCatalogQuery,
  normalizeMovieCatalogTab,
  normalizeTvCatalogTab,
  sortForCatalogTab,
} from './catalogTabs.js'

describe('TV catalog Mongo filters', () => {
  const from = new Date('2026-09-16T12:00:00.000Z')

  it('normalizes unknown tabs to popular', () => {
    assert.equal(normalizeTvCatalogTab('nope'), 'popular')
    assert.equal(normalizeTvCatalogTab('airing'), 'airing')
  })

  it('adds no extra match for popular', () => {
    assert.deepEqual(matchTvCatalogTab('popular', from), {})
    assert.deepEqual(sortForCatalogTab('popular'), { hiddenSortScore: -1, _id: -1 })
    assert.equal(catalogTabIsSinglePage('popular'), true)
  })

  it('matches currently airing MAL status or a future next episode', () => {
    const query = matchTvCatalogTab('airing', from)
    assert.equal(query.contentType, 'tv')
    assert.deepEqual(query.$or, [
      { malStatus: 'currently_airing' },
      {
        malStatus: { $nin: ['finished_airing', 'not_yet_aired'] },
        nextEpisodeAirDate: { $gte: from },
      },
    ])
    assert.equal(catalogTabIsSinglePage('airing'), false)
  })

  it('matches not-yet-aired MAL status or a future premiere', () => {
    const query = matchTvCatalogTab('upcoming', from)
    assert.equal(query.contentType, 'tv')
    assert.deepEqual(query.$or, [
      { malStatus: 'not_yet_aired' },
      {
        malStatus: { $nin: ['finished_airing', 'currently_airing'] },
        releaseDate: { $gt: from },
      },
    ])
  })

  it('combines type and tab filters with $and', () => {
    assert.deepEqual(mergeCatalogQuery({ contentType: 'tv' }, matchTvCatalogTab('airing', from)), {
      $and: [{ contentType: 'tv' }, matchTvCatalogTab('airing', from)],
    })
  })
})

describe('Movie catalog Mongo filters', () => {
  const from = new Date('2026-09-16T12:00:00.000Z')

  it('normalizes unknown tabs to popular', () => {
    assert.equal(normalizeMovieCatalogTab('nope'), 'popular')
    assert.equal(normalizeMovieCatalogTab('theatres'), 'theatres')
    assert.equal(normalizeMovieCatalogTab('airing'), 'popular')
  })

  it('matches theatrical movies released in the last four months', () => {
    const query = matchMovieCatalogTab('theatres', from)
    assert.equal(query.contentType, 'movie')
    assert.deepEqual(query.malStatus, { $nin: ['not_yet_aired'] })
    assert.deepEqual(query.releaseDate, {
      $gte: new Date(from.getTime() - THEATRICAL_WINDOW_MS),
      $lte: from,
    })
    assert.deepEqual(sortForCatalogTab('theatres'), {
      hasScheduleDate: -1,
      releaseDate: -1,
      hiddenSortScore: -1,
      _id: -1,
    })
  })

  it('matches upcoming movies without forcing contentType tv', () => {
    const query = matchMovieCatalogTab('upcoming', from)
    assert.equal(query.contentType, undefined)
    assert.deepEqual(query.$or, [
      { malStatus: 'not_yet_aired' },
      {
        malStatus: { $nin: ['finished_airing', 'currently_airing'] },
        releaseDate: { $gt: from },
      },
    ])
  })
})
