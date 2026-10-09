/**
 * Greenlit search engine crawlers: Google and Bing.
 *
 * Layer: middleware. Anyone can send a "Googlebot" User-Agent, so a crawler is only
 * trusted after the check Google and Bing document: the address's reverse DNS name is
 * under their crawler domains, and that name resolves back to the same address. A
 * verified crawler gets `req.verifiedCrawler` ('google' | 'bing') and is never refused:
 * no IP ban, bot check, burst check, slowdown, or rate limit (see `isCrawlerExempt` and
 * its callers). Rendering a page, Google's browser also runs the app's session check
 * (POST /api/auth/refresh); refusing it once got Googlebot banned and every page it
 * read became an error ("soft 404").
 *
 * A request that only claims to be a crawler is treated like any browser: not banned
 * for its User-Agent, but held to the normal limits.
 */

import dns from 'node:dns/promises'
import { normalizeIp } from '../models/IPBan.js'

/** Who is greenlit: what their User-Agent says and the DNS domains their crawlers use. */
export const GREENLIT_CRAWLERS = [
  {
    name: 'google',
    userAgent:
      /\b(?:Googlebot|Google-InspectionTool|GoogleOther|Storebot-Google|APIs-Google|AdsBot-Google|Mediapartners-Google)\b/i,
    domains: ['googlebot.com', 'google.com', 'googleusercontent.com'],
  },
  {
    name: 'bing',
    userAgent: /\b(?:bingbot|BingPreview|msnbot|adidxbot)\b/i,
    domains: ['search.msn.com'],
  },
]

const VERIFIED_TTL_MS = 24 * 60 * 60 * 1000
const REJECTED_TTL_MS = 60 * 60 * 1000
/** A DNS failure is retried soon: it says nothing about the address. */
const FAILED_TTL_MS = 5 * 60 * 1000
const DNS_TIMEOUT_MS = 1500
const CACHE_MAX = 10000

/** `${crawler}|${ip}` → { ok, until } */
const cache = new Map()

/**
 * The greenlit crawler a request's User-Agent claims to be, or null.
 * @param {{ get?: (name: string) => string | undefined }} req
 * @returns {(typeof GREENLIT_CRAWLERS)[number] | null}
 */
export function claimedCrawler(req) {
  const userAgent = req.get?.('User-Agent') || ''
  return GREENLIT_CRAWLERS.find((crawler) => crawler.userAgent.test(userAgent)) || null
}

/**
 * Whether `host` is one of the domains or under one.
 * @param {string} host
 * @param {string[]} domains
 * @returns {boolean}
 */
export function hostInDomains(host, domains) {
  const name = String(host || '')
    .toLowerCase()
    .replace(/\.$/, '')
  return domains.some((domain) => name === domain || name.endsWith(`.${domain}`))
}

const withTimeout = (promise) =>
  Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error('DNS timeout')), DNS_TIMEOUT_MS)),
  ])

/**
 * Reverse-then-forward DNS check that `ip` belongs to `crawler`.
 * @param {string} ip
 * @param {(typeof GREENLIT_CRAWLERS)[number]} crawler
 * @param {{ reverse: Function, lookup: Function }} [resolver] - Injectable for tests.
 * @returns {Promise<boolean | null>} null when DNS failed (unknown).
 */
export async function verifyCrawlerIp(ip, crawler, resolver = dns) {
  try {
    const hosts = await withTimeout(resolver.reverse(ip))
    const host = hosts.find((name) => hostInDomains(name, crawler.domains))
    if (!host) return false
    const addresses = await withTimeout(resolver.lookup(host, { all: true }))
    return addresses.some((entry) => normalizeIp(entry.address) === ip)
  } catch (error) {
    // No reverse name at all is a clear "no"; anything else (timeouts) is unknown.
    return error?.code === 'ENOTFOUND' ? false : null
  }
}

/**
 * Set `req.verifiedCrawler` for verified Google/Bing crawlers. Never blocks a request.
 * @type {import('express').RequestHandler}
 */
export async function greenlightSearchCrawlers(req, res, next) {
  const crawler = claimedCrawler(req)
  const ip = normalizeIp(req.ip)
  if (!crawler || !ip) return next()

  const key = `${crawler.name}|${ip}`
  let entry = cache.get(key)
  if (!entry || entry.until < Date.now()) {
    const ok = await verifyCrawlerIp(ip, crawler)
    const ttl = ok ? VERIFIED_TTL_MS : ok === false ? REJECTED_TTL_MS : FAILED_TTL_MS
    entry = { ok: Boolean(ok), until: Date.now() + ttl }
    if (cache.size >= CACHE_MAX) cache.delete(cache.keys().next().value)
    cache.set(key, entry)
  }
  if (entry.ok) req.verifiedCrawler = crawler.name
  next()
}

/**
 * Whether a request skips the bot checks and rate limits: any verified Google/Bing
 * crawler request.
 * @param {import('express').Request} req
 * @returns {boolean}
 */
export function isCrawlerExempt(req) {
  return Boolean(req.verifiedCrawler)
}

export default greenlightSearchCrawlers
