import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { fribbEntryFor, fribbTmdbPlacement, indexFribb, mapFribbEntry } from './fribb.js'

const blueBoxS2 = {
  type: 'TV',
  anidb_id: 19249,
  anilist_id: 189123,
  'anime-planet_id': 'blue-box-season-2',
  imdb_id: ['tt32639706'],
  kitsu_id: 49752,
  livechart_id: 13118,
  mal_id: 61323,
  themoviedb_id: { tv: 207347 },
  tvdb_id: 429934,
  season: { tvdb: 2, tmdb: 2 },
}
const apothecaryS2 = {
  mal_id: 58514,
  anilist_id: 176301,
  themoviedb_id: { tv: 220542 },
  season: { tmdb: 1 },
  episode_offset: { tmdb: 24 },
}

describe('mapFribbEntry', () => {
  it('normalizes ids and the TMDB placement', () => {
    assert.deepEqual(mapFribbEntry(blueBoxS2), {
      malId: 61323,
      anilistId: 189123,
      externalIds: {
        kitsu: '49752',
        anidb: '19249',
        livechart: '13118',
        anime_planet: 'blue-box-season-2',
        tvdb: '429934',
        imdb: 'tt32639706',
      },
      tmdbTvId: 207347,
      tmdbMovieId: null,
      tmdbSeason: 2,
      tmdbOffset: 0,
      tvdbSeason: 2,
      tvdbOffset: 0,
    })
  })
})

describe('fribbEntryFor', () => {
  it('finds entries by MAL id, then AniList id', () => {
    const index = indexFribb([blueBoxS2, apothecaryS2])
    assert.equal(fribbEntryFor(index, { malId: 61323 }).anilistId, 189123)
    assert.equal(fribbEntryFor(index, { anilistId: 176301 }).malId, 58514)
    assert.equal(fribbEntryFor(index, { malId: 1 }), null)
    assert.equal(fribbEntryFor(null, { malId: 61323 }), null)
  })
})

describe('fribbTmdbPlacement', () => {
  it('uses a placement that fits TMDB', () => {
    assert.deepEqual(
      fribbTmdbPlacement(mapFribbEntry(apothecaryS2), 220542, [
        { seasonNumber: 1, episodeCount: 60 },
      ]),
      { tmdbSeasonNumber: 1, tmdbEpisodeOffset: 24 },
    )
  })

  it('ignores a season TMDB does not have, or another show', () => {
    const entry = mapFribbEntry(blueBoxS2)
    assert.equal(fribbTmdbPlacement(entry, 207347, [{ seasonNumber: 1, episodeCount: 37 }]), null)
    assert.equal(fribbTmdbPlacement(entry, 1, [{ seasonNumber: 2, episodeCount: 12 }]), null)
  })
})
