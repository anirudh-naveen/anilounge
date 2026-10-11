import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { firstUrl, parseTitleLink } from './shareService.js'

describe('firstUrl', () => {
  it('pulls the link out of shared text', () => {
    assert.equal(
      firstUrl('Check out Frieren! https://anilist.co/anime/154587/Frieren/.'),
      'https://anilist.co/anime/154587/Frieren/',
    )
    assert.equal(firstUrl('no link here'), null)
  })
})

describe('parseTitleLink', () => {
  it('reads AniList, MyAnimeList, and TMDB links', () => {
    assert.deepEqual(parseTitleLink('https://anilist.co/anime/154587/Sousou-no-Frieren/'), {
      column: 'anilist_id',
      value: 154587,
      kinds: ['series', 'season', 'movie', 'special'],
    })
    assert.equal(
      parseTitleLink('https://myanimelist.net/anime/52991/Sousou_no_Frieren').value,
      52991,
    )
    assert.equal(parseTitleLink('https://m.myanimelist.net/anime.php?id=52991').value, 52991)
    assert.deepEqual(parseTitleLink('https://www.themoviedb.org/tv/209867-frieren').kinds, [
      'series',
    ])
    assert.deepEqual(parseTitleLink('https://www.themoviedb.org/movie/1/x').kinds, ['movie'])
  })

  it('reads AniLounge title pages by their id', () => {
    const link = parseTitleLink(
      'https://www.anilounge.net/tv-show/frieren/5A3B8C1D-0000-4000-8000-000000000001',
    )
    assert.deepEqual(link, {
      column: 'id',
      value: '5a3b8c1d-0000-4000-8000-000000000001',
      kinds: ['series', 'season', 'movie', 'special'],
    })
  })

  it('ignores other links', () => {
    assert.equal(parseTitleLink('https://anilist.co/manga/30002'), null)
    assert.equal(parseTitleLink('https://example.com/anime/1'), null)
    assert.equal(parseTitleLink('https://www.anilounge.net/forum'), null)
    assert.equal(parseTitleLink(''), null)
  })
})
