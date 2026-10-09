import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { isSearchCrawlerRead } from './antiBot.js'

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
