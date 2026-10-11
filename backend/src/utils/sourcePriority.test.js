import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { isAnime, isMissing, resolveFields, sourceOrder } from './sourcePriority.js'

const snapshots = {
  anilist: {
    title: 'Blue Box Season 2',
    nativeTitle: 'アオのハコ 第2期',
    overview: '',
    posterPath: 'https://s4.anilist.co/cover.jpg',
    bannerPath: 'https://s4.anilist.co/banner.jpg',
    genres: ['Romance', 'Sports'],
    score: 8.1,
    externalIds: { livechart: '12345', tvdb: '1' },
  },
  mal: {
    title: 'Ao no Hako 2nd Season',
    overview: 'Second season of Ao no Hako.',
    episodeCount: 12,
    score: 8.3,
    votes: 40000,
    rank: 210,
    externalIds: { anidb: '19000' },
  },
  tmdb: {
    title: 'Blue Box',
    overview: 'Taiki Inomata is on the badminton team...',
    backdropPath: '/backdrop.jpg',
    genres: ['Animation', 'Drama'],
    episodeCount: 37,
    score: 8.5,
    votes: 300,
    popularity: 42,
    externalIds: { tvdb: '440000', imdb: 'tt3' },
  },
}

describe('sourceOrder', () => {
  it('puts AniList then MAL first for anime, TMDB first otherwise', () => {
    assert.deepEqual(sourceOrder(true), ['anilist', 'mal', 'tmdb'])
    assert.deepEqual(sourceOrder(false), ['tmdb', 'anilist', 'mal'])
  })
})

describe('isAnime', () => {
  it('is anime when MAL or AniList lists it', () => {
    assert.equal(isAnime({ malId: 1 }), true)
    assert.equal(isAnime({}, { anilist: {} }), true)
    assert.equal(isAnime({ tmdbId: 1 }, { tmdb: {} }), false)
  })
})

describe('isMissing', () => {
  it('treats blanks and empty lists as missing, zero and false as values', () => {
    assert.equal(isMissing(''), true)
    assert.equal(isMissing('  '), true)
    assert.equal(isMissing([]), true)
    assert.equal(isMissing(Number.NaN), true)
    assert.equal(isMissing(0), false)
    assert.equal(isMissing(false), false)
  })
})

describe('resolveFields', () => {
  it('follows AniList, then MAL, then TMDB for anime', () => {
    const { fields, sources } = resolveFields(snapshots, { anime: true })
    assert.equal(fields.title, 'Blue Box Season 2')
    assert.equal(fields.overview, 'Second season of Ao no Hako.')
    assert.equal(sources.overview, 'mal')
    assert.equal(fields.episodeCount, 12)
    assert.equal(fields.backdropPath, '/backdrop.jpg')
    assert.deepEqual(fields.genres, ['Romance', 'Sports'])
  })

  it('follows TMDB first for everything else', () => {
    const { fields } = resolveFields(snapshots, { anime: false })
    assert.equal(fields.title, 'Blue Box')
    assert.equal(fields.episodeCount, 37)
    assert.deepEqual(fields.genres, ['Animation', 'Drama'])
    assert.equal(fields.bannerPath, 'https://s4.anilist.co/banner.jpg')
  })

  it('keeps each source its own scores', () => {
    const { fields } = resolveFields(snapshots, { anime: true })
    assert.equal(fields.tmdbScore, 8.5)
    assert.equal(fields.tmdbVotes, 300)
    assert.equal(fields.malScore, 8.3)
    assert.equal(fields.malRank, 210)
    assert.equal(fields.anilistScore, 8.1)
    assert.equal(fields.popularity, 42)
  })

  it('keeps ids from every source, the earlier source winning', () => {
    assert.deepEqual(resolveFields(snapshots, { anime: true }).externalIds, {
      tvdb: '1',
      imdb: 'tt3',
      anidb: '19000',
      livechart: '12345',
    })
    assert.equal(resolveFields(snapshots, { anime: false }).externalIds.tvdb, '440000')
  })

  it('leaves out fields no source has', () => {
    const { fields } = resolveFields({ tmdb: { title: 'Only' } }, { anime: false })
    assert.deepEqual(fields, { title: 'Only' })
  })
})
