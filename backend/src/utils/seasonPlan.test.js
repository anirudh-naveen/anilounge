import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  continuesTitle,
  matchSeasonsToWorks,
  numberSeasons,
  planChainShow,
  planTmdbShow,
  renumberedTitle,
  seasonRowName,
  splitCombinedSeasons,
} from './seasonPlan.js'

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

  it("renames TMDB's placeholder titles after their new numbers", () => {
    // Blue Box: TMDB runs season 2 on as episodes 26-37 of "Season 1", untitled past 26.
    const blueBox = [
      ...weekly(1, '2024-10-03', 25),
      { seasonNumber: 1, episodeNumber: 26, title: 'Déjà Vu', airDate: '2026-10-04' },
      { seasonNumber: 1, episodeNumber: 27, title: 'Episode 27', airDate: '2026-10-11' },
      { seasonNumber: 1, episodeNumber: 28, title: 'Episode 28', airDate: '2026-10-18' },
    ]
    const { episodes } = splitCombinedSeasons(
      [{ seasonNumber: 1, name: 'Season 1', airDate: '2024-10-03', episodeCount: 37 }],
      blueBox,
      { _id: 'bb1', tmdbId: 207347, malId: 57181 },
      [{ _id: 'bb2', malId: 61316, title: 'Ao no Hako 2nd Season', releaseDate: '2026-10-02' }],
    )
    assert.deepEqual(
      episodes.filter((episode) => episode.seasonNumber === 2).map(({ title }) => title),
      ['Déjà Vu', 'Episode 2', 'Episode 3'],
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

describe('renumberedTitle', () => {
  it('keeps real titles and renames placeholders that match the TMDB number', () => {
    assert.equal(renumberedTitle('Episode 28', 28, 3), 'Episode 3')
    assert.equal(renumberedTitle('episode 028', 28, 3), 'Episode 3')
    assert.equal(renumberedTitle('', 28, 3), 'Episode 3')
    assert.equal(renumberedTitle('Episode 1', 28, 3), 'Episode 1')
    assert.equal(renumberedTitle('Déjà Vu', 26, 1), 'Déjà Vu')
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

describe('numberSeasons', () => {
  it('numbers entries in order and keeps later parts in their season', () => {
    assert.deepEqual(
      numberSeasons([
        { content: { title: 'The Apothecary Diaries' }, name: 'Season 1' },
        { content: { title: 'The Apothecary Diaries Season 2' } },
        { content: { title: 'The Apothecary Diaries Season 3' } },
        { content: { title: 'The Apothecary Diaries Season 3 Part 2' } },
        { content: null, name: 'The Final Season' },
      ]),
      [
        { seasonNumber: 1, partNumber: 1, label: 'Season 1' },
        { seasonNumber: 2, partNumber: 1, label: 'Season 2' },
        { seasonNumber: 3, partNumber: 1, label: 'Season 3' },
        { seasonNumber: 3, partNumber: 2, label: 'Season 3 Part 2' },
        { seasonNumber: 4, partNumber: 1, label: 'The Final Season' },
      ],
    )
  })
})

describe('seasonRowName', () => {
  it('adds plain labels and sets named seasons apart', () => {
    assert.equal(seasonRowName('Blue Box', 'Season 2'), 'Blue Box Season 2')
    assert.equal(
      seasonRowName('Avatar: The Last Airbender', 'Book One: Water'),
      'Avatar: The Last Airbender – Book One: Water',
    )
  })
})

describe('planTmdbShow', () => {
  // Blue Box: TMDB runs season 2 on as episodes 26-37 of its one "Season 1".
  const blueBoxEpisodes = [
    ...weekly(1, '2024-10-03', 25),
    ...weekly(26, '2026-10-04', 12).map((episode) => ({
      ...episode,
      title: episode.episodeNumber === 26 ? 'Déjà Vu' : `Episode ${episode.episodeNumber}`,
    })),
  ]
  const blueBox = { _id: 'bb1', tmdbId: 207347, malId: 57181, title: 'Blue Box' }
  const blueBoxS2 = {
    _id: 'bb2',
    malId: 61323,
    anilistId: 189123,
    title: 'Blue Box Season 2',
    releaseDate: '2026-10-02',
  }

  it('makes the anime TMDB entry season 1 and its sequel season 2, with TMDB offsets', () => {
    const plan = planTmdbShow({
      seasons: [{ seasonNumber: 1, name: 'Season 1', airDate: '2024-10-03', episodeCount: 37 }],
      episodes: blueBoxEpisodes,
      anchor: blueBox,
      candidates: [blueBoxS2],
    })
    assert.deepEqual(
      plan.seasons.map((season) => [
        season.contentId,
        season.seasonNumber,
        season.partNumber,
        season.label,
        season.tmdbSeasonNumber,
        season.tmdbEpisodeOffset,
        season.episodeCount,
      ]),
      [
        ['bb1', 1, 1, 'Season 1', 1, 0, 25],
        ['bb2', 2, 1, 'Season 2', 1, 25, 12],
      ],
    )
    const second = plan.episodes.filter((episode) => episode.seasonKey === 2)
    assert.deepEqual(
      second.slice(0, 3).map(({ number, title }) => [number, title]),
      [
        [1, 'Déjà Vu'],
        [2, 'Episode 2'],
        [3, 'Episode 3'],
      ],
    )
    assert.equal(second.at(-1).number, 12)
  })

  it('makes every season a new row for a show that is not anime', () => {
    const plan = planTmdbShow({
      seasons: [
        { seasonNumber: 1, name: 'Book One: Water', airDate: '2005-02-21', episodeCount: 20 },
        { seasonNumber: 2, name: 'Book Two: Earth', airDate: '2006-03-17', episodeCount: 20 },
      ],
      episodes: [
        { seasonNumber: 1, episodeNumber: 1, airDate: '2005-02-21' },
        { seasonNumber: 2, episodeNumber: 1, airDate: '2006-03-17' },
      ],
      anchor: { _id: 'avatar', tmdbId: 246 },
      candidates: [],
    })
    assert.deepEqual(
      plan.seasons.map(({ contentId, seasonNumber, label, tmdbSeasonNumber }) => [
        contentId,
        seasonNumber,
        label,
        tmdbSeasonNumber,
      ]),
      [
        [null, 1, 'Book One: Water', 1],
        [null, 2, 'Book Two: Earth', 2],
      ],
    )
  })
})

describe('planChainShow', () => {
  it('orders TV entries by premiere and numbers them', () => {
    assert.deepEqual(
      planChainShow([
        { _id: 'b', title: 'Show Season 2', releaseDate: '2022-01-01' },
        { _id: 'a', title: 'Show', releaseDate: '2020-01-01' },
        { _id: 'c', title: 'Show Season 2 Part 2', releaseDate: '2022-07-01' },
      ]),
      [
        { contentId: 'a', seasonNumber: 1, partNumber: 1, label: 'Season 1' },
        { contentId: 'b', seasonNumber: 2, partNumber: 1, label: 'Season 2' },
        { contentId: 'c', seasonNumber: 2, partNumber: 2, label: 'Season 2 Part 2' },
      ],
    )
  })
})
