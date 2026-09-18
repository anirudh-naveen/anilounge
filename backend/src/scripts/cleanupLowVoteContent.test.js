import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { LOW_VOTE_THRESHOLD, lowVoteCleanupFilter } from './cleanupLowVoteContent.js'

describe('lowVoteCleanupFilter', () => {
  it('keeps MAL-backed titles even when TMDB votes are missing', () => {
    const query = lowVoteCleanupFilter()
    assert.equal(LOW_VOTE_THRESHOLD, 100)
    assert.deepEqual(query.$and[0], { $or: [{ malId: { $exists: false } }, { malId: null }] })
  })

  it('excludes watchlisted or rated catalog ids', () => {
    const excludeIds = ['abc', 'def']
    const query = lowVoteCleanupFilter({ excludeIds })
    assert.deepEqual(query.$and.at(-1), { _id: { $nin: excludeIds } })
  })
})
