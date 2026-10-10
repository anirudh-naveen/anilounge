import { after, before, describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  antiBotProtection,
  databaseProtection,
  isSearchCrawler,
  isSearchCrawlerRead,
} from './antiBot.js'

const request = (method, userAgent) => ({ method, get: () => userAgent })

describe('isSearchCrawlerRead', () => {
  it('lets search engine crawlers read', () => {
    const googlebot =
      'Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; Googlebot/2.1; +http://www.google.com/bot.html) Chrome/120.0 Safari/537.36'
    assert.equal(isSearchCrawlerRead(request('GET', googlebot)), true)
    assert.equal(isSearchCrawlerRead(request('GET', 'Mozilla/5.0 (compatible; bingbot/2.0)')), true)
  })

  it('refuses their writes and other bots', () => {
    assert.equal(isSearchCrawlerRead(request('POST', 'Googlebot/2.1')), false)
    assert.equal(isSearchCrawlerRead(request('GET', 'python-requests scraper bot')), false)
    assert.equal(isSearchCrawlerRead(request('GET', 'NotGooglebotish')), false)
  })
})

describe('antiBotProtection', () => {
  // Development skips the checks; backend/.env may set it.
  let savedEnv
  before(() => {
    savedEnv = process.env.NODE_ENV
    process.env.NODE_ENV = 'test'
  })
  after(() => {
    process.env.NODE_ENV = savedEnv
  })
  const run = (method, userAgent, extra = {}) => {
    const req = { method, ip: '203.0.113.50', hostname: 'api.test', get: () => userAgent, ...extra }
    const res = {
      statusCode: 200,
      status(code) {
        this.statusCode = code
        return this
      },
      json() {
        return this
      },
    }
    let passed = false
    antiBotProtection(req, res, () => (passed = true))
    return { passed, status: res.statusCode }
  }
  const googlebot = 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)'

  it('never refuses Google or Bing, even writes (the page session check)', () => {
    assert.equal(isSearchCrawler(request('POST', googlebot)), true)
    assert.deepEqual(run('POST', googlebot, { verifiedCrawler: 'google' }), {
      passed: true,
      status: 200,
    })
    // Unverified claims are treated like a browser: let through, normal limits apply.
    assert.deepEqual(run('GET', googlebot), { passed: true, status: 200 })
    assert.deepEqual(run('POST', 'Mozilla/5.0 (compatible; bingbot/2.0)'), {
      passed: true,
      status: 200,
    })
  })

  it('still refuses other bots that write', () => {
    assert.deepEqual(run('POST', 'Mozilla/5.0 (compatible; YandexBot/3.0)'), {
      passed: false,
      status: 403,
    })
  })
})

describe('databaseProtection', () => {
  const run = (path, body) => {
    const req = {
      method: 'POST',
      path,
      body,
      query: {},
      params: {},
      ip: '203.0.113.60',
      get: () => 'Mozilla/5.0',
    }
    const res = {
      statusCode: 200,
      status(code) {
        this.statusCode = code
        return this
      },
      json() {
        return this
      },
    }
    let passed = false
    databaseProtection(req, res, () => (passed = true))
    return { passed, status: res.statusCode }
  }
  const events = (target) => ({
    visitorId: 'abcdef12-3456',
    events: [{ type: 'click', path: '/tv-show/42-medieval-tales', target }],
  })

  it('lets metrics reports carry code-ish words from slugs and button text', () => {
    assert.deepEqual(run('/api/metrics/events', events('button:Evaluate')), {
      passed: true,
      status: 200,
    })
  })

  it('still refuses those words elsewhere', () => {
    assert.equal(run('/api/somewhere', events('button:Evaluate')).status, 400)
  })
})
