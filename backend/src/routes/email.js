/**
 * Email link routes: one-click unsubscribe for optional emails (announcements,
 * friend requests), per category or from all of them.
 *
 * Layer: router. Mounted in server.js ahead of the anti-bot and referer checks, since
 * these links are opened from mail clients and mail providers POST the one-click
 * unsubscribe (RFC 8058) from their own servers. Links are HMAC-signed per user.
 */

import express from 'express'
import {
  EMAIL_CATEGORIES,
  unsubscribe,
  verifyUnsubscribeToken,
} from '../services/emailPreferenceService.js'

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
  '<p>This unsubscribe link is incomplete or has been changed. Use the link from the most recent email, or manage emails in your AniLounge settings.</p>',
)

/**
 * Validated link parameters. Links without `c` are announcement links sent before
 * categories existed.
 * @param {import('express').Request} req
 * @returns {{ userId: string, token: string, category: string } | null}
 */
function readLink(req) {
  const userId = String(req.query.u || '')
  const token = String(req.query.t || '')
  const category = String(req.query.c || 'announcements')
  return verifyUnsubscribeToken(userId, token, category) ? { userId, token, category } : null
}

const button = (label, primary) =>
  `<button type="submit" style="background:${primary ? '#e07a5f' : '#fff'};color:${primary ? '#fff' : '#152238'};border:${primary ? '0' : '1px solid #d6dae2'};padding:12px 20px;border-radius:8px;font-size:15px;cursor:pointer">${label}</button>`

const ACCOUNT_NOTE =
  'Account and security emails (sign-in codes, unlock links, email-change and deletion notices) still arrive, since they protect your account.'

/** Confirmation page. GET never unsubscribes, so link scanners cannot opt people out. */
router.get('/unsubscribe', (req, res) => {
  const link = readLink(req)
  if (!link) return res.status(400).send(invalidLink)
  const { label } = EMAIL_CATEGORIES[link.category]
  const params = new URLSearchParams({ u: link.userId, t: link.token, c: link.category })
  res.send(
    page(
      `Unsubscribe from ${label}?`,
      `<p>You'll stop getting AniLounge ${label}. ${ACCOUNT_NOTE}</p>
<form method="post" action="?${params}" style="margin:0 0 12px">${button(`Unsubscribe from ${label}`, true)}</form>
<form method="post" action="?${params}&amp;scope=all">${button('Unsubscribe from all optional emails', false)}</form>
<p style="color:#5b6578;font-size:14px;margin-top:24px">You can turn these back on anytime in Settings → Email.</p>`,
    ),
  )
})

/** Unsubscribe; used by the confirm buttons and by mail providers' one-click POST. */
router.post('/unsubscribe', async (req, res) => {
  const link = readLink(req)
  if (!link) return res.status(400).send(invalidLink)
  const scope = req.query.scope === 'all' ? 'all' : link.category
  try {
    await unsubscribe(link.userId, scope)
    const what = scope === 'all' ? 'optional emails' : EMAIL_CATEGORIES[scope].label
    res.send(
      page(
        'You are unsubscribed',
        `<p>You will no longer receive AniLounge ${what}. ${ACCOUNT_NOTE}</p>
<p style="color:#5b6578;font-size:14px">Changed your mind? Turn them back on in Settings → Email.</p>`,
      ),
    )
  } catch (error) {
    console.error('Email unsubscribe failed:', error)
    res.status(500).send(page('Something went wrong', '<p>Please try the link again later.</p>'))
  }
})

export default router
