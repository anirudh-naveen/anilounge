import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { favoriteCategory } from './favoriteService.js'

describe('favoriteCategory', () => {
  it('ranks movies on their own and series, seasons, and specials together', () => {
    assert.equal(favoriteCategory('movie'), 'movie')
    for (const kind of ['series', 'season', 'special']) {
      assert.equal(favoriteCategory(kind), 'series')
    }
  })

  it('ranks characters, voice actors, and studios separately', () => {
    assert.equal(favoriteCategory('character'), 'character')
    assert.equal(favoriteCategory('voice'), 'voice')
    assert.equal(favoriteCategory('studio'), 'studio')
  })
})
