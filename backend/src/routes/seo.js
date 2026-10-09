/**
 * Page descriptions for the site's Vercel middleware (search engines and link
 * previews; see services/seoService.js).
 *
 * Layer: router. Mounted in server.js ahead of the general limiter and the bot and
 * referer checks: the caller is Vercel's middleware, on behalf of every visitor
 * (crawlers included). It has its own per-visitor limit; the middleware passes the
 * visitor's address in X-Vercel-Forwarded-For (middleware/clientIp.js). Read-only, and
 * only what the public pages already show.
 */

import express from 'express'
import rateLimit from 'express-rate-limit'
import { describePage } from '../services/seoService.js'
import { renderCard } from '../services/shareCardService.js'
import { appUrl } from '../services/emailService.js'
import { rateLimitStore } from '../middleware/pgRateLimitStore.js'
import { isCrawlerExempt } from '../middleware/searchCrawler.js'
import { sendError } from '../utils/httpError.js'

const router = express.Router()

const seoLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 240,
  skip: isCrawlerExempt,
  ...rateLimitStore('seo'),
  standardHeaders: true,
  legacyHeaders: false,
})

/**
 * `GET /api/seo/page?path=/movie/<id>/<slug>` — 200 `{ data: page }`, 404 when the
 * page's record doesn't exist, 400 for a path this API doesn't describe.
 */
router.get('/page', seoLimiter, async (req, res) => {
  try {
    const result = await describePage(req.query.path, appUrl())
    if (!result) return res.status(400).json({ success: false, message: 'Not a described page' })
    // `notFound` tells the middleware this is a missing record, not a missing route.
    if (!result.found) {
      return res.status(404).json({ success: false, notFound: true, message: 'Page not found' })
    }
    res.set('Cache-Control', 'public, max-age=300')
    res.json({ success: true, data: result.page })
  } catch (error) {
    sendError(res, error, 'Error describing the page')
  }
})

/** Drawing a card takes a poster fetch and ~100ms of CPU; previews ask for each once. */
const cardLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 120,
  skip: isCrawlerExempt,
  ...rateLimitStore('seo-card'),
  standardHeaders: true,
  legacyHeaders: false,
})

const CARD_CACHE_TTL_MS = 60 * 60 * 1000
const CARD_CACHE_MAX = 200
/** canonical URL → { at, png } */
const cardCache = new Map()

/**
 * `GET /api/seo/card.png?path=/movie/<slug>/<id>` — the page's 1200×630 share card
 * (services/shareCardService.js); 404 when the page's record doesn't exist, 400 for a
 * path this API doesn't describe.
 */
router.get('/card.png', cardLimiter, async (req, res) => {
  try {
    const result = await describePage(req.query.path, appUrl())
    if (!result) return res.status(400).json({ success: false, message: 'Not a described page' })
    if (!result.found) return res.status(404).json({ success: false, message: 'Page not found' })
    const key = result.page.canonical
    let hit = cardCache.get(key)
    if (!hit || Date.now() - hit.at > CARD_CACHE_TTL_MS) {
      hit = { at: Date.now(), png: await renderCard(result.page.card) }
      cardCache.delete(key)
      if (cardCache.size >= CARD_CACHE_MAX) cardCache.delete(cardCache.keys().next().value)
      cardCache.set(key, hit)
    }
    res.set('Content-Type', 'image/png')
    res.set('Cache-Control', 'public, max-age=86400, s-maxage=86400')
    res.send(hit.png)
  } catch (error) {
    sendError(res, error, 'Error drawing the share card')
  }
})

export default router
