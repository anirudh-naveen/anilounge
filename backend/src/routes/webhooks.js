/**
 * Payment webhooks: Ko-fi donations (Supporter badge).
 *
 * Layer: router. Mounted in server.js ahead of the body sanitizers and the anti-bot and
 * referer checks: Ko-fi POSTs from its own servers, and the sanitizers would rewrite the
 * JSON inside its `data` field. Each request carries Ko-fi's verification token, checked
 * in services/donationService.js.
 */

import express from 'express'
import { recordKofiWebhook } from '../services/donationService.js'
import { sendError } from '../utils/httpError.js'

const router = express.Router()

/**
 * `POST /api/webhooks/kofi` — Ko-fi payment notification (form-encoded `data` JSON).
 * 200 once handled (Ko-fi retries anything else), 400 malformed, 401 wrong token.
 */
router.post('/kofi', express.urlencoded({ extended: false, limit: '64kb' }), async (req, res) => {
  try {
    res.json({ success: true, ...(await recordKofiWebhook(req.body)) })
  } catch (error) {
    sendError(res, error, 'Error recording the donation')
  }
})

export default router
