import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { seriesEntryCounts } from './episodes.js'

describe('seriesEntryCounts', () => {
  it("keeps a MAL season's own count when TMDB's total is for the whole show", () => {
    assert.deepEqual(
      seriesEntryCounts({ malId: 31964, malEpisodes: 13, episodeCount: 170, seasonCount: 7 }),
      { episodeCount: 13, seasonCount: 1 },
    )
  })

  it('leaves rows whose MAL entry covers the whole TMDB show', () => {
    assert.deepEqual(
      seriesEntryCounts({ malId: 1735, malEpisodes: 500, episodeCount: 500, seasonCount: 22 }),
      { episodeCount: 500, seasonCount: 22 },
    )
  })

  it('falls back to the TMDB count while MAL has none (still airing)', () => {
    assert.deepEqual(
      seriesEntryCounts({ malId: 21, malEpisodes: 0, episodeCount: 1100, seasonCount: 22 }),
      { episodeCount: 1100, seasonCount: 22 },
    )
  })

  it('leaves TMDB-only rows alone and uses the MAL count when TMDB has none', () => {
    assert.deepEqual(seriesEntryCounts({ episodeCount: 24, seasonCount: 2 }), {
      episodeCount: 24,
      seasonCount: 2,
    })
    assert.deepEqual(seriesEntryCounts({ malId: 5, malEpisodes: 12 }), {
      episodeCount: 12,
      seasonCount: null,
    })
  })
})
