import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { continuesTitle, matchSeasonsToWorks } from './seasonService.js'

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
      { _id: 'final2', title: 'Shingeki no Kyojin: The Final Season Part 2', releaseDate: '2022-01-01' },
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
      { _id: 'other-show', tmdbId: 999, title: 'Attack on Titan Season 2', releaseDate: '2017-04-01' },
    ])
    assert.deepEqual([...matches.entries()], [[1, 'aot']])
  })
})

describe('continuesTitle', () => {
  it('matches names that continue the prefix at a word boundary', () => {
    assert.equal(continuesTitle('attack on titan season 2', 'attack on titan'), true)
    assert.equal(continuesTitle('mushoku tensei ii: isekai ittara honki dasu', 'mushoku tensei'), true)
    assert.equal(continuesTitle('narutos', 'naruto'), false)
    assert.equal(continuesTitle('aot 2', 'aot'), false)
  })
})
