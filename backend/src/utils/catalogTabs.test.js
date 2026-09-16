import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  matchTvCatalogTab,
  mergeCatalogQuery,
  normalizeTvCatalogTab,
  sortForTvCatalogTab,
} from './catalogTabs.js'

describe('TV catalog Mongo filters', () => {
  const from = new Date('2026-09-16T12:00:00.000Z')

  it('normalizes unknown tabs to popular', () => {
    assert.equal(normalizeTvCatalogTab('nope'), 'popular')
    assert.equal(normalizeTvCatalogTab('airing'), 'airing')
  })

  it('adds no extra match for popular', () => {
    assert.deepEqual(matchTvCatalogTab('popular', from), {})
    assert.deepEqual(sortForTvCatalogTab('popular'), { hiddenSortScore: -1, _id: -1 })
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
