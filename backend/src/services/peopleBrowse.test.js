import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { isTrendingQuery, parseBrowseQuery } from './peopleBrowse.js'

describe('people browse query', () => {
  it('shows trending when nothing is searched, filtered, or re-sorted', () => {
    assert.equal(isTrendingQuery(parseBrowseQuery({}, 'character')), true)
    assert.equal(isTrendingQuery(parseBrowseQuery({ q: 'Naruto' }, 'character')), false)
    assert.equal(isTrendingQuery(parseBrowseQuery({ role: 'main' }, 'character')), false)
    assert.equal(isTrendingQuery(parseBrowseQuery({ sort: 'name' }, 'character')), false)
  })

  it('keeps only the filters that fit the tab', () => {
    const voice = parseBrowseQuery({ role: 'main', language: 'Korean' }, 'voice_actor')
    assert.equal(voice.role, null)
    assert.equal(voice.language, 'Korean')
    const character = parseBrowseQuery({ language: 'Korean', media: 'series' }, 'character')
    assert.equal(character.language, null)
    assert.equal(character.media, 'series')
  })

  it('drops unknown sorts and reads names A–Z by default', () => {
    assert.equal(parseBrowseQuery({ sort: 'rating' }, 'character').sort, 'popularity')
    assert.equal(parseBrowseQuery({ sort: 'roles' }, 'character').sort, 'popularity')
    assert.equal(parseBrowseQuery({ sort: 'name' }, 'voice_actor').direction, 'asc')
    assert.equal(parseBrowseQuery({ page: '9999' }, 'character').page, 500)
  })
})
