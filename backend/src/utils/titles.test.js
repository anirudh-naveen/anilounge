import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  collectContentTitles,
  contentExactTitlesMatchOr,
  contentTitlesOverlap,
  externalIdsConflict,
  seasonsConflict,
  titleKeyMatcher,
  titleSeason,
  titlesEqual,
  uniqueTitles,
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

describe('titleKey / titlesEqual', () => {
  it('ignores capitalization and extra or missing spaces', () => {
    assert.equal(titlesEqual('Attack on Titan', 'attack  on   TITAN'), true)
    assert.equal(titlesEqual('Re:Zero', ' RE: ZERO '), true)
    assert.equal(titlesEqual('ＳＰＹ×ＦＡＭＩＬＹ', 'Spy×Family'), true)
  })

  it('keeps different seasons and sequels apart', () => {
    assert.equal(titlesEqual('Attack on Titan', 'Attack on Titan Season 2'), false)
    assert.equal(titlesEqual('Toy Story', 'Toy Story 2'), false)
    assert.equal(titlesEqual('', ''), false)
  })

  it('stores titles with collapsed spaces and dedupes spacing variants', () => {
    assert.deepEqual(uniqueTitles('  Attack  on Titan ', 'attack on titan', 'AoT'), [
      'Attack on Titan',
      'AoT',
    ])
  })
})

describe('seasonsConflict', () => {
  it('reads season and part markers from main names', () => {
    assert.deepEqual(titleSeason('Jujutsu Kaisen 2nd Season'), { season: 2, part: 1 })
    assert.deepEqual(titleSeason('Attack on Titan Season 3 Part 2'), { season: 3, part: 2 })
    assert.deepEqual(titleSeason('Attack on Titan'), { season: 1, part: 1 })
  })

  it('rejects rows whose main names are different seasons even when an alias overlaps', () => {
    const tmdbShow = { title: 'Attack on Titan', alternativeTitles: ['Attack on Titan Season 2'] }
    const malSeason = { title: 'Shingeki no Kyojin Season 2', englishTitle: 'Attack on Titan Season 2' }
    assert.equal(contentTitlesOverlap(tmdbShow, malSeason), true)
    assert.equal(seasonsConflict(tmdbShow, malSeason), true)
  })

  it('allows the same season named differently across sources', () => {
    assert.equal(
      seasonsConflict(
        { title: 'Jujutsu Kaisen 2nd Season' },
        { title: 'JUJUTSU KAISEN Season 2', englishTitle: 'Jujutsu Kaisen Season 2' },
      ),
      false,
    )
    assert.equal(seasonsConflict({ title: 'Re:Zero' }, { title: 're: zero' }), false)
  })
})

describe('titleKeyMatcher', () => {
  it('matches by the spacing/case-insensitive key', () => {
    assert.deepEqual(titleKeyMatcher(' Attack  on Titan '), { $titleKey: 'attackontitan' })
    assert.equal(titleKeyMatcher('  '), null)
  })
})

describe('contentExactTitlesMatchOr', () => {
  it('searches every name field for each source title', () => {
    const clauses = contentExactTitlesMatchOr({
      title: 'The Fragrant Flower Blooms With Dignity',
      nativeTitle: '薫る花は凛と咲く',
    })
    const keys = clauses.map((clause) => Object.values(clause)[0].$titleKey)
    assert.equal(keys.includes('thefragrantflowerbloomswithdignity'), true)
    assert.equal(keys.includes('薫る花は凛と咲く'), true)
  })
})
