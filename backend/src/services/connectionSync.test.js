import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  anilistEntryVariables,
  malListStatusFields,
  pollConfig,
  providerPulls,
  syncEnabled,
  rowMatchesEntry,
  tmdbRatingValue,
  toFuzzyDate,
} from './connectionSync.js'

describe('connection sync mapping', () => {
  it('maps a watchlist row to AniList SaveMediaListEntry variables', () => {
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

  it('maps a watchlist row to MyAnimeList list status fields with whole scores', () => {
    assert.deepEqual(
      malListStatusFields({
        status: 'completed',
        rating: 7.5,
        currentEpisode: 24,
        rewatchCount: 2,
        startedOn: '2026-01-05',
        completedOn: new Date('2026-02-01T00:00:00Z'),
      }),
      {
        status: 'completed',
        score: '8',
        num_watched_episodes: '24',
        num_times_rewatched: '2',
        start_date: '2026-01-05',
        finish_date: '2026-02-01',
      },
    )
    const bare = malListStatusFields({ status: 'nonsense' })
    assert.equal(bare.status, 'plan_to_watch')
    assert.equal(bare.score, '0')
    assert.equal('start_date' in bare, false)
  })

  it('rounds TMDB ratings to half steps', () => {
    assert.equal(tmdbRatingValue(7.3), 7.5)
    assert.equal(tmdbRatingValue(0.1), 0.5)
    assert.equal(tmdbRatingValue(null), null)
    assert.equal(tmdbRatingValue(0), null)
  })
})

describe('rowMatchesEntry', () => {
  const row = { status: 'watching', currentEpisode: 5, rating: 7.5, rewatchCount: 0 }
  const entry = { status: 'watching', score: 7.5, rewatchCount: 0 }

  it('compares status, progress, rating, and rewatches', () => {
    assert.equal(rowMatchesEntry(row, entry, 5, 'anilist'), true)
    assert.equal(rowMatchesEntry(row, entry, 6, 'anilist'), false)
    assert.equal(rowMatchesEntry(row, { ...entry, status: 'completed' }, 5, 'anilist'), false)
    assert.equal(rowMatchesEntry({ ...row, rating: 0 }, { ...entry, score: null }, 5, 'anilist'), true)
  })

  it("treats MyAnimeList's whole-number score as matching a finer rating", () => {
    assert.equal(rowMatchesEntry(row, { ...entry, score: 8 }, 5, 'mal'), true)
    assert.equal(rowMatchesEntry(row, { ...entry, score: 8 }, 5, 'anilist'), false)
  })
})

describe('polling', () => {
  it('only pulls from AniList and MyAnimeList', () => {
    assert.equal(providerPulls('anilist'), true)
    assert.equal(providerPulls('mal'), true)
    assert.equal(providerPulls('tmdb'), false)
  })

  it('is on unless CONNECTIONS_SYNC_ENABLED turns it off', () => {
    assert.equal(syncEnabled({}), true)
    assert.equal(syncEnabled({ CONNECTIONS_SYNC_ENABLED: 'true' }), true)
    for (const off of ['false', 'FALSE', '0', 'off', ' no ']) {
      assert.equal(syncEnabled({ CONNECTIONS_SYNC_ENABLED: off }), false)
    }
  })

  it('reads its budget from the environment with safe floors', () => {
    assert.deepEqual(pollConfig({}), { intervalSeconds: 120, perMinute: { anilist: 12, mal: 20 } })
    const custom = pollConfig({
      CONNECTIONS_POLL_INTERVAL_SECONDS: '5',
      CONNECTIONS_ANILIST_POLLS_PER_MINUTE: '40',
    })
    assert.equal(custom.intervalSeconds, 30)
    assert.equal(custom.perMinute.anilist, 40)
  })
})
