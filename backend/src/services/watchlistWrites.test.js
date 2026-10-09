import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { lockCompletedProgress, reopenCompletedProgress } from './watchlistWrites.js'

describe('lockCompletedProgress', () => {
  it('moves a completed row to the last episode and remembers where it was', () => {
    const item = { status: 'completed', currentEpisode: 5, previousEpisode: 4 }
    lockCompletedProgress(item, 12)
    assert.equal(item.currentEpisode, 12)
    assert.equal(item.previousEpisode, 5)
  })

  it('leaves rows alone when the episode total is unknown', () => {
    const item = { status: 'completed', currentEpisode: 5, previousEpisode: 4 }
    lockCompletedProgress(item, 0)
    assert.deepEqual(item, { status: 'completed', currentEpisode: 5, previousEpisode: 4 })
  })

  it('leaves rows that are not completed alone', () => {
    const item = { status: 'watching', currentEpisode: 5, previousEpisode: 4 }
    lockCompletedProgress(item, 12)
    assert.equal(item.currentEpisode, 5)
  })

  it('keeps the remembered episode when a completed row is saved again', () => {
    const item = { status: 'completed', currentEpisode: 12, previousEpisode: 5 }
    lockCompletedProgress(item, 12)
    assert.equal(item.previousEpisode, 5)
  })
})

describe('reopenCompletedProgress', () => {
  it('returns a completed row moved back to watching to its earlier episode', () => {
    const item = { status: 'watching', currentEpisode: 12, previousEpisode: 5 }
    reopenCompletedProgress(item, 'completed', 12)
    assert.equal(item.currentEpisode, 5)
    assert.equal(item.previousEpisode, 12)
  })

  it('keeps an episode the same edit set explicitly', () => {
    const item = { status: 'watching', currentEpisode: 8, previousEpisode: 12 }
    reopenCompletedProgress(item, 'completed', 12)
    assert.equal(item.currentEpisode, 8)
  })

  it('stays on the last episode when there is no earlier one (e.g. imported as completed)', () => {
    const item = { status: 'watching', currentEpisode: 12, previousEpisode: 0 }
    reopenCompletedProgress(item, 'completed', 12)
    assert.equal(item.currentEpisode, 12)
  })

  it('only applies when moving from completed to watching', () => {
    const onHold = { status: 'on_hold', currentEpisode: 12, previousEpisode: 5 }
    reopenCompletedProgress(onHold, 'completed', 12)
    assert.equal(onHold.currentEpisode, 12)

    const watching = { status: 'watching', currentEpisode: 12, previousEpisode: 5 }
    reopenCompletedProgress(watching, 'watching', 12)
    assert.equal(watching.currentEpisode, 12)
  })
})
