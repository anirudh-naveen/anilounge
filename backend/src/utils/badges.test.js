import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { badgesForUser, featuredEmblem, isValidEmblemChoice } from './badges.js'

describe('badgesForUser', () => {
  it('combines the role badge with granted badges in registry order', () => {
    assert.deepEqual(badgesForUser({ role: 'creator', granted: ['influencer', 'developer'] }), [
      'creator',
      'developer',
      'influencer',
    ])
    assert.deepEqual(badgesForUser({ role: 'user', isStaff: true }), ['admin'])
    assert.deepEqual(badgesForUser({ role: 'user', granted: ['artist', 'bogus', 'admin'] }), [
      'artist',
    ])
  })

  it('gives the release bot the bot badge and nothing else', () => {
    assert.deepEqual(badgesForUser({ role: 'admin', isBot: true, granted: ['developer'] }), ['bot'])
    assert.deepEqual(badgesForUser({ role: 'user', granted: ['bot'] }), [])
    assert.equal(featuredEmblem(['bot'], null), 'bot')
  })
})

describe('featuredEmblem', () => {
  const badges = ['admin', 'artist']
  it('uses the pick, falls back to the highest, and honors none', () => {
    assert.equal(featuredEmblem(badges, 'artist'), 'artist')
    assert.equal(featuredEmblem(badges, null), 'admin')
    assert.equal(featuredEmblem(badges, 'developer'), 'admin')
    assert.equal(featuredEmblem(badges, 'none'), null)
    assert.equal(featuredEmblem([], null), null)
  })

  it('only accepts held emblem badges as a choice', () => {
    assert.equal(isValidEmblemChoice(badges, 'artist'), true)
    assert.equal(isValidEmblemChoice(badges, null), true)
    assert.equal(isValidEmblemChoice(badges, 'none'), true)
    assert.equal(isValidEmblemChoice(badges, 'developer'), false)
  })
})
