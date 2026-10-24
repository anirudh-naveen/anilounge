import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { lockCompletedProgress, reopenCompletedProgress, touchProgress } from './watchlistWrites.js'

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

describe('touchProgress', () => {
  const before = new Date('2026-01-01T00:00:00Z')

  it('leaves the row alone when only the rating changed', () => {
    const item = { status: 'watching', currentEpisode: 4, rating: 9, updatedAt: before }
    touchProgress(item, 'watching', 4)
    assert.equal(item.updatedAt, before)
  })

  it('bumps the row when the episode or status moved', () => {
    const episode = { status: 'watching', currentEpisode: 5, updatedAt: before }
    touchProgress(episode, 'watching', 4)
    assert.ok(episode.updatedAt > before)
    const status = { status: 'completed', currentEpisode: 4, updatedAt: before }
    touchProgress(status, 'watching', 4)
    assert.ok(status.updatedAt > before)
  })

  it('stamps backlog edits as imported', () => {
    const item = { status: 'watching', currentEpisode: 5, updatedAt: before }
    touchProgress(item, 'watching', 4, true)
    assert.equal(item.importedAt, item.updatedAt)
  })
})
