/**
 * Email link routes: announcement unsubscribe.
 *
 * Layer: router. Mounted in server.js ahead of the anti-bot and referer checks, since
 * these links are opened from mail clients and mail providers POST the one-click
 * unsubscribe (RFC 8058) from their own servers. Links are HMAC-signed per user.
 */

import express from 'express'
import {
  unsubscribeFromAnnouncements,
  verifyUnsubscribeToken,
} from '../services/announcementService.js'

const router = express.Router()

/**
 * Tiny standalone page; `bodyHtml` is trusted template markup.
 * @param {string} heading
 * @param {string} bodyHtml
 * @returns {string}
 */
function page(heading, bodyHtml) {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>${heading} · AniLounge</title></head>
<body style="margin:0;background:#f4f5f7;font-family:Arial,sans-serif;color:#152238">
<div style="max-width:440px;margin:48px auto;background:#fff;border-radius:12px;padding:32px">
<h1 style="font-size:22px;margin:0 0 16px">${heading}</h1>${bodyHtml}</div></body></html>`
}

const invalidLink = page(
  'Link not valid',
  '<p>This unsubscribe link is incomplete or has been changed. Use the link from the most recent announcement email.</p>',
)

/** Confirmation page. GET never unsubscribes, so link scanners cannot opt people out. */
router.get('/unsubscribe', (req, res) => {
  const userId = String(req.query.u || '')
  const token = String(req.query.t || '')
  if (!verifyUnsubscribeToken(userId, token)) return res.status(400).send(invalidLink)
  const params = new URLSearchParams({ u: userId, t: token })
  res.send(
    page(
      'Unsubscribe from announcements?',
      `<p>You'll stop getting AniLounge announcement emails. Account and security emails still arrive.</p>
<form method="post" action="?${params}">
<button type="submit" style="background:#e07a5f;color:#fff;border:0;padding:12px 20px;border-radius:8px;font-size:15px;cursor:pointer">Unsubscribe</button>
</form>`,
    ),
  )
})

/** Unsubscribe; used by the confirm button and by mail providers' one-click POST. */
router.post('/unsubscribe', async (req, res) => {
  const userId = String(req.query.u || '')
  const token = String(req.query.t || '')
  if (!verifyUnsubscribeToken(userId, token)) return res.status(400).send(invalidLink)
  try {
    await unsubscribeFromAnnouncements(userId)
    res.send(
      page(
        'You are unsubscribed',
        '<p>You will no longer receive AniLounge announcement emails. Account and security emails still arrive.</p>',
      ),
    )
  } catch (error) {
    console.error('Announcement unsubscribe failed:', error)
    res.status(500).send(page('Something went wrong', '<p>Please try the link again later.</p>'))
  }
})

export default router
