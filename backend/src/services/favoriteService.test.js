import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { favoriteCategory } from './favoriteService.js'

describe('favoriteCategory', () => {
  it('ranks every watchable kind together as titles', () => {
    for (const kind of ['movie', 'series', 'special']) assert.equal(favoriteCategory(kind), 'title')
  })

  it('ranks characters, voice actors, and studios separately', () => {
    assert.equal(favoriteCategory('character'), 'character')
    assert.equal(favoriteCategory('voice'), 'voice')
    assert.equal(favoriteCategory('studio'), 'studio')
  })
})
