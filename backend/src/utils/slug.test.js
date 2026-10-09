import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { SLUG_MAX, contentDisplayName, contentPagePath, detailPath, slugify } from './slug.js'

describe('slugify', () => {
  it('makes lowercase ASCII words joined by dashes', () => {
    assert.equal(slugify('Attack on Titan'), 'attack-on-titan')
    assert.equal(
      slugify('Re:ZERO -Starting Life in Another World-'),
      're-zero-starting-life-in-another-world',
    )
    assert.equal(slugify("JoJo's Bizarre Adventure"), 'jojos-bizarre-adventure')
    assert.equal(slugify('Pokémon: The Movie 2000'), 'pokemon-the-movie-2000')
    assert.equal(slugify('  Spy×Family  '), 'spy-family')
  })

  it('gives an empty slug for names without Latin letters or digits', () => {
    assert.equal(slugify('進撃の巨人'), '')
    assert.equal(slugify(''), '')
    assert.equal(slugify(null), '')
  })

  it('cuts long names on a word boundary', () => {
    const slug = slugify('word '.repeat(40))
    assert.ok(slug.length <= SLUG_MAX)
    assert.ok(!slug.endsWith('-'))
    assert.match(slug, /^(word-)*word$/)
  })
})

describe('paths', () => {
  it('builds canonical paths per kind with display names', () => {
    assert.equal(detailPath('/forum/post', 'p1', 'Best of 2026?'), '/forum/post/p1/best-of-2026')
    assert.equal(detailPath('/movie', 'm1', 'のんのんびより'), '/movie/m1')
    assert.equal(contentPagePath({ kind: 'special', id: 's1', name: 'OVA' }), '/movie/s1/ova')
    assert.equal(
      contentPagePath({ kind: 'series', id: 't1', name: 'Frieren' }),
      '/tv-show/t1/frieren',
    )
    assert.equal(
      contentPagePath({ kind: 'voice', id: 'v1', name: 'Kaji, Yuuki' }),
      '/voice-actor/v1/yuuki-kaji',
    )
    assert.equal(contentDisplayName('character', 'Natsuki, Subaru (voice)'), 'Subaru Natsuki')
  })
})
