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
