import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { continuesTitle, matchSeasonsToWorks, splitCombinedSeasons } from './seasonService.js'

const seasons = [
  { seasonNumber: 1, airDate: '2013-04-07', episodeCount: 25 },
  { seasonNumber: 2, airDate: '2017-04-01', episodeCount: 12 },
  { seasonNumber: 3, airDate: '2018-07-23', episodeCount: 22 },
  { seasonNumber: 4, airDate: '2020-12-07', episodeCount: 28 },
]
const episodes = [
  { seasonNumber: 1, airDate: '2013-09-28' },
  { seasonNumber: 2, airDate: '2017-06-17' },
  { seasonNumber: 3, airDate: '2019-07-01' },
  { seasonNumber: 4, airDate: '2023-11-05' },
]
const anchor = { _id: 'aot', tmdbId: 1429 }

describe('matchSeasonsToWorks', () => {
  it('maps the first season to the TMDB row and later seasons by premiere date', () => {
    const matches = matchSeasonsToWorks(seasons, episodes, anchor, [
      { _id: 's3p2', title: 'Attack on Titan Season 3 Part 2', releaseDate: '2019-04-01' },
      { _id: 'final', title: 'Shingeki no Kyojin: The Final Season', releaseDate: '2021-01-01' },
      {
        _id: 'final2',
        title: 'Shingeki no Kyojin: The Final Season Part 2',
        releaseDate: '2022-01-01',
      },
    ])
    assert.equal(matches.get(1), 'aot')
    assert.equal(matches.get(2), undefined)
    assert.equal(matches.get(3), 's3p2')
    assert.equal(matches.get(4), 'final')
  })

  it('prefers the row whose title names the season', () => {
    const matches = matchSeasonsToWorks(seasons, episodes, anchor, [
      { _id: 's3p2', title: 'Attack on Titan Season 3 Part 2', releaseDate: '2018-07-20' },
      { _id: 's3', title: 'Attack on Titan Season 3', releaseDate: '2018-07-01' },
    ])
    assert.equal(matches.get(3), 's3')
  })

  it('skips rows released outside every later season, and other TMDB shows', () => {
    const matches = matchSeasonsToWorks(seasons, episodes, anchor, [
      { _id: 'junior-high', title: 'Attack on Titan: Junior High', releaseDate: '2015-10-04' },
      {
        _id: 'other-show',
        tmdbId: 999,
        title: 'Attack on Titan Season 2',
        releaseDate: '2017-04-01',
      },
    ])
    assert.deepEqual([...matches.entries()], [[1, 'aot']])
  })
})

/**
 * Weekly episodes of TMDB season 1 numbered on from `first`.
 * @param {number} first
 * @param {string} start - First air date
 * @param {number} count
 */
function weekly(first, start, count) {
  return Array.from({ length: count }, (_, index) => ({
    seasonNumber: 1,
    episodeNumber: first + index,
    airDate: new Date(Date.parse(start) + index * 7 * 86400000).toISOString().slice(0, 10),
  }))
}

describe('splitCombinedSeasons', () => {
  // TMDB lists The Apothecary Diaries' three seasons as one 60-episode "Season 1".
  const combined = [
    {
      seasonNumber: 1,
      name: 'Season 1',
      airDate: '2023-10-22',
      episodeCount: 60,
      posterPath: '/s1.jpg',
    },
  ]
  const run = [
    ...weekly(1, '2023-10-22', 12),
    ...weekly(13, '2024-01-07', 12),
    ...weekly(25, '2025-01-10', 24),
    ...weekly(49, '2026-10-02', 12),
  ]
  const candidates = [
    {
      _id: 's2',
      malId: 58514,
      title: 'The Apothecary Diaries Season 2',
      releaseDate: '2025-01-09',
    },
    {
      _id: 's3',
      malId: 61987,
      title: 'The Apothecary Diaries Season 3',
      releaseDate: '2026-10-01',
    },
    {
      _id: 's3p2',
      malId: 62841,
      title: 'The Apothecary Diaries Season 3 Part 2',
      releaseDate: '2027-04-01',
    },
  ]
  const anchor = { _id: 's1', tmdbId: 220542, malId: 54492 }

  it('cuts a combined TMDB season where MAL/AniList entries premiere', () => {
    const { seasons: split, episodes: renumbered } = splitCombinedSeasons(
      combined,
      run,
      anchor,
      candidates,
    )
    assert.deepEqual(
      split.map(({ seasonNumber, name, airDate, episodeCount }) => [
        seasonNumber,
        name,
        airDate,
        episodeCount,
      ]),
      [
        [1, 'Season 1', '2023-10-22', 24],
        [2, 'Season 2', '2025-01-10', 24],
        [3, 'Season 3', '2026-10-02', 12],
      ],
    )
    assert.equal(split[0].posterPath, '/s1.jpg')
    assert.equal(split[1].posterPath, '')
    const s2e1 = renumbered.find((episode) => episode.airDate === '2025-01-10')
    assert.deepEqual([s2e1.seasonNumber, s2e1.episodeNumber], [2, 1])
    assert.equal(
      renumbered.filter((episode) => episode.seasonNumber === 3).at(-1).episodeNumber,
      12,
    )

    const matches = matchSeasonsToWorks(split, renumbered, anchor, candidates)
    assert.deepEqual(
      [...matches.entries()],
      [
        [1, 's1'],
        [2, 's2'],
        [3, 's3'],
      ],
    )
  })

  it('follows MAL entries whatever their titles say', () => {
    const { seasons: split } = splitCombinedSeasons(combined, run, anchor, [
      {
        _id: 'sequel',
        anilistId: 176301,
        title: 'Kusuriya no Hitorigoto 2',
        releaseDate: '2025-01-01',
      },
    ])
    assert.deepEqual(
      split.map(({ episodeCount }) => episodeCount),
      [24, 36],
    )
  })

  it('keeps TMDB seasons for non-anime shows, specials, and other TMDB shows', () => {
    const show = splitCombinedSeasons(combined, run, { _id: 's1', tmdbId: 220542 }, candidates)
    assert.equal(show.seasons, combined)
    const others = splitCombinedSeasons(combined, run, anchor, [
      { _id: 'ova', malId: 1, contentType: 'special', releaseDate: '2025-01-09' },
      { _id: 'other', malId: 2, tmdbId: 999, releaseDate: '2025-01-09' },
      { _id: 'tmdb-only', title: 'The Apothecary Diaries Season 2', releaseDate: '2025-01-09' },
    ])
    assert.equal(others.seasons, combined)
    assert.equal(others.episodes, run)
  })
})

describe('continuesTitle', () => {
  it('matches names that continue the prefix at a word boundary', () => {
    assert.equal(continuesTitle('attack on titan season 2', 'attack on titan'), true)
    assert.equal(
      continuesTitle('mushoku tensei ii: isekai ittara honki dasu', 'mushoku tensei'),
      true,
    )
    assert.equal(continuesTitle('narutos', 'naruto'), false)
    assert.equal(continuesTitle('aot 2', 'aot'), false)
  })
})
