import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { dedupeSeasonNumbers, groupRemaining, renumberByTvdb } from './seriesGrouping.js'

describe('groupRemaining', () => {
  it("adds an announced sequel to its show's seasons", () => {
    const blueBox = {
      seasons: [
        { contentId: 'bb1', seasonNumber: 1, partNumber: 1 },
        { contentId: 'bb2', seasonNumber: 2, partNumber: 1 },
      ],
    }
    const { appended, chains } = groupRemaining({
      groups: [blueBox],
      rows: [{ _id: 'bb3', title: 'Blue Box Season 3', releaseDate: null }],
      edges: [{ fromId: 'bb2', toId: 'bb3' }],
    })
    assert.equal(appended, 1)
    assert.deepEqual(chains, [])
    assert.deepEqual(blueBox.seasons.at(-1), {
      contentId: 'bb3',
      seasonNumber: 3,
      partNumber: 1,
      label: 'Season 3',
      tmdbSeasonNumber: null,
      tmdbEpisodeOffset: 0,
    })
  })

  it('follows a chain of sequels and keeps later parts in their season', () => {
    const show = { seasons: [{ contentId: 's1', seasonNumber: 1, partNumber: 1 }] }
    groupRemaining({
      groups: [show],
      rows: [
        { _id: 's2p2', title: 'Show Season 2 Part 2', releaseDate: '2023-07-01' },
        { _id: 's2', title: 'Show Season 2', releaseDate: '2023-01-01' },
      ],
      edges: [
        { fromId: 's1', toId: 's2' },
        { fromId: 's2', toId: 's2p2' },
      ],
    })
    assert.deepEqual(
      show.seasons.map(({ contentId, seasonNumber, partNumber }) => [
        contentId,
        seasonNumber,
        partNumber,
      ]),
      [
        ['s1', 1, 1],
        ['s2', 2, 1],
        ['s2p2', 2, 2],
      ],
    )
  })

  it('makes one show per remaining chain, and single entries their own show', () => {
    const { chains } = groupRemaining({
      groups: [],
      rows: [
        { _id: 'a2', title: 'Anime 2nd Season', releaseDate: '2021-01-01' },
        { _id: 'a1', title: 'Anime', releaseDate: '2019-01-01' },
        { _id: 'solo', title: 'Solo', releaseDate: '2020-01-01' },
      ],
      edges: [{ fromId: 'a1', toId: 'a2' }],
    })
    assert.deepEqual(
      chains.map((chain) =>
        chain.seasons.map(({ contentId, seasonNumber }) => [contentId, seasonNumber]),
      ),
      [
        [
          ['a1', 1],
          ['a2', 2],
        ],
        [['solo', 1]],
      ],
    )
  })
})

describe('dedupeSeasonNumbers', () => {
  it('moves a second row claiming the same season part to the next free part', () => {
    // Dr. Stone: the catalog holds "Science Future Part 2" under two MAL ids.
    const show = {
      seasons: [
        { contentId: 'sf1', seasonNumber: 4, partNumber: 1 },
        { contentId: 'sf2a', seasonNumber: 4, partNumber: 2 },
        { contentId: 'sf3', seasonNumber: 4, partNumber: 3 },
        { contentId: 'sf2b', seasonNumber: 4, partNumber: 2 },
      ],
    }
    assert.deepEqual(dedupeSeasonNumbers(show), ['sf2b'])
    assert.deepEqual(
      show.seasons.map(({ partNumber }) => partNumber),
      [1, 2, 3, 4],
    )
    assert.equal(show.seasons[3].label, 'Season 4 Part 4')
  })
})

describe('renumberByTvdb', () => {
  it("numbers seasons by TVDB's seasons, parts in episode order", () => {
    // Attack on Titan; the Final Season's catalog date was off, so it came in as "S5".
    const tvdb = {
      s1: { tvdbSeason: 1 },
      s3: { tvdbSeason: 3 },
      s3p2: { tvdbSeason: 3, tvdbOffset: 12 },
      fs: { tvdbSeason: 4 },
      fs2: { tvdbSeason: 4, tvdbOffset: 16 },
      end: { tvdbSeason: 4, tvdbOffset: 28 },
    }
    const show = {
      seasons: [
        { contentId: 's1', seasonNumber: 1, label: 'Season 1' },
        { contentId: 's3', seasonNumber: 3, label: 'Season 3' },
        {
          contentId: 's3p2',
          seasonNumber: 3,
          partNumber: 2,
          label: 'Season 3 Part 2',
          tmdbEpisodeOffset: 12,
        },
        { contentId: 'fs', seasonNumber: 5, label: 'Season 5', tmdbEpisodeOffset: 4 },
        { contentId: 'end', seasonNumber: 6, label: 'Season 6' },
        { contentId: 'fs2', seasonNumber: 5, partNumber: 2, label: 'Season 5 Part 2' },
        { contentId: 'new', seasonNumber: 7, label: 'Season 7' },
      ],
    }
    assert.equal(
      renumberByTvdb(show, (id) => tvdb[id] || null),
      true,
    )
    assert.deepEqual(
      show.seasons.map(({ contentId, seasonNumber, partNumber, label }) => [
        contentId,
        seasonNumber,
        partNumber,
        label,
      ]),
      [
        ['s1', 1, 1, 'Season 1'],
        ['s3', 3, 1, 'Season 3'],
        ['s3p2', 3, 2, 'Season 3 Part 2'],
        ['fs', 4, 1, 'Season 4'],
        ['fs2', 4, 2, 'Season 4 Part 2'],
        ['end', 4, 3, 'Season 4 Part 3'],
        ['new', 5, 1, 'Season 5'],
      ],
    )
  })

  it("keeps TMDB's name for a season that starts a TMDB season", () => {
    const show = { seasons: [{ contentId: 'a', seasonNumber: 2, label: 'Stone Wars' }] }
    renumberByTvdb(show, () => ({ tvdbSeason: 2 }))
    assert.equal(show.seasons[0].label, 'Stone Wars')
  })

  it('leaves a show the list has no seasons for alone', () => {
    const show = { seasons: [{ contentId: 'a', seasonNumber: 1 }] }
    assert.equal(
      renumberByTvdb(show, () => null),
      false,
    )
  })
})
