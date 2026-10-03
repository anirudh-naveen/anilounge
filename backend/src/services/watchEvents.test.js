import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { spreadImportedRow } from './watchEvents.js'

const now = new Date('2026-10-03T12:00:00Z')

describe('spreadImportedRow', () => {
  it('spreads a completed series evenly from start to finish', () => {
    const days = spreadImportedRow(
      {
        status: 'completed',
        current_episode: 5,
        started_on: '2026-01-01',
        completed_on: '2026-01-09',
      },
      now,
    )
    assert.deepEqual(days, [
      { day: '2026-01-01', units: 1 },
      { day: '2026-01-03', units: 1 },
      { day: '2026-01-05', units: 1 },
      { day: '2026-01-07', units: 1 },
      { day: '2026-01-09', units: 1 },
    ])
  })

  it('puts in-progress episodes between the start and the last update', () => {
    const days = spreadImportedRow(
      {
        status: 'watching',
        current_episode: 10,
        started_on: '2026-09-01',
        updated_at: '2026-09-01T20:00:00Z',
      },
      now,
    )
    assert.deepEqual(days, [{ day: '2026-09-01', units: 10 }])
  })

  it('counts rewatches and lands on the one known date', () => {
    const days = spreadImportedRow(
      { status: 'completed', current_episode: 1, rewatch_count: 1, completed_on: '2025-05-05' },
      now,
    )
    assert.deepEqual(days, [{ day: '2025-05-05', units: 2 }])
  })

  it('estimates nothing without dates or progress', () => {
    assert.deepEqual(spreadImportedRow({ status: 'watching', current_episode: 4 }, now), [])
    assert.deepEqual(
      spreadImportedRow(
        { status: 'plan_to_watch', current_episode: 0, started_on: '2026-01-01' },
        now,
      ),
      [],
    )
  })

  it('never places watching in the future', () => {
    const days = spreadImportedRow(
      { status: 'completed', current_episode: 1, completed_on: '2027-01-01' },
      now,
    )
    assert.deepEqual(days, [{ day: '2026-10-03', units: 1 }])
  })
})
