import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  anilistEntryVariables,
  fromAnilistEntry,
  isAnilistSyncUser,
  rowMatchesEntry,
  toFuzzyDate,
} from './anilistSync.js'

describe('AniList sync', () => {
  it('only syncs the configured account when a token is set', () => {
    const env = { ANILIST_SYNC_EMAIL: 'Me@Example.com', ANILIST_SYNC_TOKEN: 't' }
    assert.equal(isAnilistSyncUser({ email: 'me@example.com' }, env), true)
    assert.equal(isAnilistSyncUser({ email: 'other@example.com' }, env), false)
    assert.equal(isAnilistSyncUser({ email: 'me@example.com' }, { ...env, ANILIST_SYNC_TOKEN: '' }), false)
  })

  it('maps a watchlist row to SaveMediaListEntry variables', () => {
    const vars = anilistEntryVariables(21, {
      status: 'on_hold',
      rating: 7.5,
      currentEpisode: 12,
      rewatchCount: 1,
      startedOn: '2026-01-05',
      completedOn: null,
    })
    assert.deepEqual(vars, {
      mediaId: 21,
      status: 'PAUSED',
      scoreRaw: 75,
      progress: 12,
      repeat: 1,
      startedAt: { year: 2026, month: 1, day: 5 },
      completedAt: { year: null, month: null, day: null },
    })
    assert.equal(anilistEntryVariables(21, { status: 'watching' }).scoreRaw, 0)
    assert.deepEqual(toFuzzyDate(new Date('2025-03-09T00:00:00Z')), { year: 2025, month: 3, day: 9 })
  })

  it('maps an AniList entry back and spots rows that already agree', () => {
    const entry = fromAnilistEntry({
      status: 'REPEATING',
      score: 8.5,
      progress: 3,
      repeat: 2,
      updatedAt: 1700000000,
      startedAt: { year: 2026, month: 2, day: 1 },
      completedAt: {},
      media: { id: 9 },
    })
    assert.equal(entry.status, 'watching')
    assert.equal(entry.rating, 8.5)
    assert.equal(entry.startedOn, '2026-02-01')
    assert.equal(entry.completedOn, null)
    assert.equal(entry.updatedAt, 1700000000000)
    const row = { status: 'watching', rating: 8.5, currentEpisode: 3, rewatchCount: 2 }
    assert.equal(rowMatchesEntry(row, entry, 3), true)
    assert.equal(rowMatchesEntry({ ...row, currentEpisode: 2 }, entry, 3), false)
    assert.equal(fromAnilistEntry({ status: 'CURRENT', score: 0, media: { id: 1 } }).rating, null)
  })
})
