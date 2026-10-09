import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  GREENLIT_CRAWLERS,
  claimedCrawler,
  hostInDomains,
  isCrawlerExempt,
  verifyCrawlerIp,
} from './searchCrawler.js'

const [google, bing] = GREENLIT_CRAWLERS
const req = (userAgent) => ({ get: () => userAgent })

/** Fake DNS: reverse names per IP, forward addresses per name. */
const resolver = (reverse, forward) => ({
  reverse: async (ip) => {
    if (!reverse[ip]) throw Object.assign(new Error('no PTR'), { code: 'ENOTFOUND' })
    return reverse[ip]
  },
  lookup: async (host) => (forward[host] || []).map((address) => ({ address, family: 4 })),
})

describe('claimedCrawler', () => {
  it('recognizes Google and Bing user agents', () => {
    assert.equal(
      claimedCrawler(
        req('Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)'),
      ),
      google,
    )
    assert.equal(claimedCrawler(req('Mozilla/5.0 Google-InspectionTool/1.0')), google)
    assert.equal(claimedCrawler(req('Mozilla/5.0 (compatible; bingbot/2.0)')), bing)
    assert.equal(claimedCrawler(req('Mozilla/5.0 (Macintosh) Safari/605.1.15')), null)
    assert.equal(claimedCrawler(req('Mozilla/5.0 (compatible; YandexBot/3.0)')), null)
  })
})

describe('hostInDomains', () => {
  it('matches the domain and its subdomains only', () => {
    assert.equal(hostInDomains('crawl-66-249-66-1.googlebot.com.', google.domains), true)
    assert.equal(hostInDomains('rate-limited-proxy-66-249-90-77.google.com', google.domains), true)
    assert.equal(hostInDomains('msnbot-157-55-39-1.search.msn.com', bing.domains), true)
    assert.equal(hostInDomains('googlebot.com.evil.test', google.domains), false)
    assert.equal(hostInDomains('fakegooglebot.com', google.domains), false)
  })
})

describe('verifyCrawlerIp', () => {
  it('needs the reverse name in their domains and a matching forward lookup', async () => {
    const dns = resolver(
      {
        '66.249.66.1': ['crawl-66-249-66-1.googlebot.com'],
        '203.0.113.9': ['crawl-66-249-66-1.googlebot.com'],
        '198.51.100.4': ['host.example.test'],
      },
      { 'crawl-66-249-66-1.googlebot.com': ['66.249.66.1'] },
    )
    assert.equal(await verifyCrawlerIp('66.249.66.1', google, dns), true)
    // A spoofed PTR record: the name doesn't resolve back to the address.
    assert.equal(await verifyCrawlerIp('203.0.113.9', google, dns), false)
    assert.equal(await verifyCrawlerIp('198.51.100.4', google, dns), false)
    assert.equal(await verifyCrawlerIp('192.0.2.1', google, dns), false)
  })

  it('reports DNS trouble as unknown', async () => {
    const broken = {
      reverse: async () => Promise.reject(new Error('SERVFAIL')),
      lookup: async () => [],
    }
    assert.equal(await verifyCrawlerIp('66.249.66.1', google, broken), null)
  })
})

describe('isCrawlerExempt', () => {
  it('only exempts verified crawlers', () => {
    assert.equal(isCrawlerExempt({ verifiedCrawler: 'google' }), true)
    assert.equal(isCrawlerExempt({}), false)
  })
})
