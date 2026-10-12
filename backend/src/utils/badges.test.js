import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  avatarFrame,
  badgesForUser,
  earnsInfluencer,
  featuredEmblem,
  isValidEmblemChoice,
} from './badges.js'

describe('badgesForUser', () => {
  it('combines the role badge with granted badges in registry order', () => {
    assert.deepEqual(badgesForUser({ role: 'creator', granted: ['influencer', 'developer'] }), [
      'creator',
      'admin',
      'developer',
      'influencer',
    ])
    assert.deepEqual(badgesForUser({ role: 'user', isStaff: true }), ['admin'])
    assert.deepEqual(badgesForUser({ role: 'user', granted: ['artist', 'bogus', 'bot'] }), [
      'artist',
    ])
  })

  it('only gives Admin with admin access, never as a stored badge', () => {
    assert.deepEqual(badgesForUser({ role: 'user', granted: ['admin', 'artist'] }), ['artist'])
    assert.deepEqual(badgesForUser({ role: 'admin', granted: ['artist'] }), ['admin', 'artist'])
  })

  it('gives the bot accounts the bot badge and nothing else', () => {
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

describe('earnsInfluencer', () => {
  it('takes 5 posts or 10 comments in a week', () => {
    assert.equal(earnsInfluencer({ posts: 5, comments: 0 }), true)
    assert.equal(earnsInfluencer({ posts: 0, comments: 10 }), true)
    assert.equal(earnsInfluencer({ posts: 4, comments: 9 }), false)
  })
})

describe('avatarFrame', () => {
  it('uses a held pick, hides on none, and otherwise matches the emblem', () => {
    const held = ['admin', 'artist']
    assert.equal(avatarFrame(held, 'admin', 'artist'), 'artist')
    assert.equal(avatarFrame(held, 'admin', 'none'), null)
    assert.equal(avatarFrame(held, 'admin', null), 'admin')
    assert.equal(avatarFrame(held, null, null), null)
    assert.equal(avatarFrame(held, 'admin', 'creator'), 'admin')
  })
})
