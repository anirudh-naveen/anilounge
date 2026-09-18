import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  collectContentTitles,
  contentExactTitlesMatchOr,
  contentTitlesOverlap,
  exactTitleMatcher,
  externalIdsConflict,
} from './titles.js'

describe('contentTitlesOverlap', () => {
  it('matches when one source native title is the other source English title', () => {
    const tmdb = {
      title: '薫る花は凛と咲く',
      englishTitle: '薫る花は凛と咲く',
      nativeTitle: 'The Fragrant Flower Blooms With Dignity',
    }
    const mal = {
      title: 'The Fragrant Flower Blooms With Dignity',
      englishTitle: 'The Fragrant Flower Blooms With Dignity',
      nativeTitle: '薫る花は凛と咲く',
    }

    assert.equal(contentTitlesOverlap(tmdb, mal), true)
    assert.equal(
      collectContentTitles(tmdb).includes('The Fragrant Flower Blooms With Dignity'),
      true,
    )
  })

  it('does not match unrelated titles', () => {
    assert.equal(
      contentTitlesOverlap(
        { title: 'Spirited Away', nativeTitle: '千と千尋の神隠し' },
        { title: 'My Neighbor Totoro', nativeTitle: 'となりのトトロ' },
      ),
      false,
    )
  })

  it('matches alternative titles across sources', () => {
    assert.equal(
      contentTitlesOverlap(
        { title: 'Koe no Katachi', alternativeTitles: ['A Silent Voice'] },
        { englishTitle: 'A Silent Voice', nativeTitle: '聲の形' },
      ),
      true,
    )
  })
})

describe('externalIdsConflict', () => {
  it('allows a TMDB row to merge with a MAL-only row of the same title', () => {
    assert.equal(
      externalIdsConflict({ tmdbId: 1, title: 'A Silent Voice' }, { malId: 28851, title: 'Koe no Katachi' }),
      false,
    )
  })

  it('rejects two TMDB ids or two MAL ids that do not match', () => {
    assert.equal(externalIdsConflict({ tmdbId: 1 }, { tmdbId: 2 }), true)
    assert.equal(externalIdsConflict({ malId: 10 }, { malId: 11 }), true)
    assert.equal(externalIdsConflict({ tmdbId: 1, malId: 10 }, { tmdbId: 1, malId: 10 }), false)
    assert.equal(externalIdsConflict({ tmdbId: null, malId: 10 }, { tmdbId: 2, malId: 10 }), false)
  })
})

describe('exactTitleMatcher', () => {
  it('anchors the regex so substring franchise titles do not match', () => {
    const matcher = exactTitleMatcher('Naruto')
    assert.equal(new RegExp(matcher.$regex, matcher.$options).test('Naruto'), true)
    assert.equal(new RegExp(matcher.$regex, matcher.$options).test('Naruto Shippuden'), false)
    assert.equal(new RegExp(matcher.$regex, matcher.$options).test('naruto'), true)
  })
})

describe('contentExactTitlesMatchOr', () => {
  it('searches every name field for each source title', () => {
    const clauses = contentExactTitlesMatchOr({
      title: 'The Fragrant Flower Blooms With Dignity',
      nativeTitle: '薫る花は凛と咲く',
    })
    const titles = clauses.map((clause) => Object.values(clause)[0].$regex)
    assert.equal(titles.includes('^The Fragrant Flower Blooms With Dignity$'), true)
    assert.equal(titles.includes('^薫る花は凛と咲く$'), true)
  })
})
