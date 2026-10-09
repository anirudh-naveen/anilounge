import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { normalizeEvents, recordEvents, referrerHost } from './metricsService.js'

describe('referrerHost', () => {
  it('keeps external hosts and drops our own site', () => {
    assert.equal(referrerHost('https://www.Google.com/search?q=x'), 'google.com')
    assert.equal(referrerHost('https://anilounge.net/movies'), null)
    assert.equal(referrerHost('not a url'), null)
    assert.equal(referrerHost(''), null)
  })
})

describe('normalizeEvents', () => {
  it('keeps valid views and clicks with the pathname only', () => {
    const events = normalizeEvents([
      { type: 'view', path: '/search?q=naruto#top', referrer: 'https://reddit.com/r/anime' },
      { type: 'click', path: '/', target: 'link:/movies', referrer: 'https://x.com' },
    ])
    assert.deepEqual(events, [
      { type: 'view', path: '/search', target: null, referrer: 'reddit.com' },
      { type: 'click', path: '/', target: 'link:/movies', referrer: null },
    ])
  })

  it('drops unknown types, relative paths, and clicks without a target', () => {
    const events = normalizeEvents([
      { type: 'hover', path: '/' },
      { type: 'view', path: 'movies' },
      { type: 'click', path: '/' },
      null,
    ])
    assert.deepEqual(events, [])
    assert.deepEqual(normalizeEvents('nope'), [])
  })
})

describe('recordEvents', () => {
  it('ignores bots and bad visitor ids without touching the database', async () => {
    const req = (userAgent, visitorId) => ({
      get: () => userAgent,
      body: { visitorId, events: [{ type: 'view', path: '/' }] },
    })
    assert.equal(await recordEvents(req('Googlebot/2.1', 'abcdef123456')), 0)
    assert.equal(await recordEvents(req('Mozilla/5.0', 'x')), 0)
  })
})
