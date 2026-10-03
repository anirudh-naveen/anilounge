import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { computeProfileStats, DEFAULT_EPISODE_MINUTES, minutesWatched } from './profileStats.js'

const now = new Date('2026-09-15T00:00:00Z')

const movie = {
  contentType: 'movie',
  runtime: 120,
  genres: [{ name: 'Drama' }, { name: 'Animation' }],
}
const series = { contentType: 'tv', episodeCount: 12, genres: [{ name: 'Action' }] }

describe('minutesWatched', () => {
  it('counts a movie runtime only once completed', () => {
    assert.equal(minutesWatched({ status: 'completed', content: movie }), 120)
    assert.equal(minutesWatched({ status: 'watching', content: movie }), 0)
  })

  it('multiplies watched episodes by the default episode length for series', () => {
    assert.equal(
      minutesWatched({ status: 'watching', currentEpisode: 5, content: series }),
      5 * DEFAULT_EPISODE_MINUTES,
    )
    assert.equal(
      minutesWatched({ status: 'completed', content: series }),
      12 * DEFAULT_EPISODE_MINUTES,
    )
  })
})

describe('computeProfileStats', () => {
  const stats = computeProfileStats(
    [
      { status: 'completed', rating: 9, updatedAt: '2026-09-02', content: movie },
      { status: 'watching', currentEpisode: 5, rating: 7, updatedAt: '2026-03-10', content: series },
      { status: 'plan_to_watch', updatedAt: '2026-09-01', content: series },
      { status: 'completed', updatedAt: '2024-01-01', content: movie },
      { status: 'completed', content: 'unpopulated-id' },
    ],
    now,
  )

  it('totals statuses, minutes, and ratings', () => {
    assert.equal(stats.totals.titles, 4)
    assert.equal(stats.totals.completed, 2)
    assert.equal(stats.totals.completedMovies, 2)
    assert.equal(stats.totals.watching, 1)
    assert.equal(stats.totals.planToWatch, 1)
    assert.equal(stats.totals.minutesWatched, 240 + 5 * DEFAULT_EPISODE_MINUTES)
    assert.equal(stats.totals.episodesWatched, 5)
    assert.equal(stats.totals.averageRating, 8)
    assert.equal(stats.ratingDistribution[8], 1)
    assert.equal(stats.ratingDistribution[6], 1)
  })

  it('buckets the trailing twelve months by last activity', () => {
    assert.equal(stats.monthly.length, 12)
    assert.equal(stats.monthly[0].month, '2025-10')
    assert.equal(stats.monthly[11].month, '2026-09')
    assert.equal(stats.monthly[11].minutes, 120)
    assert.equal(stats.monthly.find((row) => row.month === '2026-03').minutes, 120)
  })

  it('maps the whole history of watch time by day', () => {
    assert.deepEqual(stats.daily, {
      '2026-09-02': 120,
      '2026-03-10': 5 * DEFAULT_EPISODE_MINUTES,
      '2024-01-01': 120,
    })
  })

  it('places watch time on the days the history logs, the rest on the last update', () => {
    const naruto = { _id: 'naruto', contentType: 'tv', episodeCount: 220, genres: [] }
    const withHistory = computeProfileStats(
      [{ status: 'watching', currentEpisode: 30, updatedAt: '2026-09-10', content: naruto }],
      now,
      new Map([
        [
          'naruto',
          [
            { day: '2026-09-01', units: 10 },
            { day: '2026-09-05', units: 10 },
          ],
        ],
      ]),
    )
    assert.deepEqual(withHistory.daily, {
      '2026-09-01': 10 * DEFAULT_EPISODE_MINUTES,
      '2026-09-05': 10 * DEFAULT_EPISODE_MINUTES,
      '2026-09-10': 10 * DEFAULT_EPISODE_MINUTES,
    })
    assert.equal(withHistory.monthly[11].minutes, 30 * DEFAULT_EPISODE_MINUTES)
  })

  it('scales history down when progress was lowered since', () => {
    const show = { _id: 'show', contentType: 'tv', episodeCount: 12, genres: [] }
    const stats = computeProfileStats(
      [{ status: 'watching', currentEpisode: 4, updatedAt: '2026-09-10', content: show }],
      now,
      new Map([['show', [{ day: '2026-09-01', units: 8 }]]]),
    )
    assert.deepEqual(stats.daily, { '2026-09-01': 4 * DEFAULT_EPISODE_MINUTES })
  })

  it('ranks genres by watch time and skips Animation and plan-to-watch rows', () => {
    assert.deepEqual(
      stats.genres.map((row) => [row.name, row.titles]),
      [
        ['Drama', 2],
        ['Action', 1],
      ],
    )
  })
})
