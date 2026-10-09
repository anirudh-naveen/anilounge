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
import { appUrl } from '../services/emailService.js'
import { rateLimitStore } from '../middleware/pgRateLimitStore.js'
import { sendError } from '../utils/httpError.js'

const router = express.Router()

const seoLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 240,
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

export default router
