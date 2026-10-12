import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { avatarFrame, badgesForUser, earnsInfluencer } from './badges.js'

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
    assert.equal(avatarFrame(['bot'], null), 'bot')
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
  it('uses a held pick, the User ring for a lost one, and the highest badge on automatic', () => {
    const held = ['admin', 'artist']
    assert.equal(avatarFrame(held, 'artist'), 'artist')
    assert.equal(avatarFrame(held, 'user'), 'user')
    assert.equal(avatarFrame(held, 'none'), 'user')
    assert.equal(avatarFrame(held, null), 'admin')
    assert.equal(avatarFrame(held, 'creator'), 'user')
    assert.equal(avatarFrame([], null), 'user')
  })
})
