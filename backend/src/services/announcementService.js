/**
 * Site-wide announcement emails and the announcement unsubscribe flow.
 *
 * Layer: service. Announcements go out as notify@anilounge.net (via emailService) to
 * every verified, non-demo account that has not opted out. Each email carries a signed
 * one-click unsubscribe link, so opting out needs no sign-in. Security and account
 * emails are unaffected by the opt-out.
 *
 * Env: JWT_SECRET (signs unsubscribe links), ANNOUNCEMENT_DELAY_MS (pause between
 * sends, default 600 to stay under Resend's 2 requests/second limit).
 */

import crypto from 'crypto'
import { query } from '../../config/postgres.js'
import { isUuid } from '../db/ids.js'
import { appUrl, sendAnnouncementEmail } from './emailService.js'

const DEFAULT_DELAY_MS = 600

function unsubscribeSecret() {
  const secret = process.env.JWT_SECRET
  if (!secret) throw new Error('JWT_SECRET is required to sign unsubscribe links')
  return secret
}

/**
 * HMAC over the user id, so a link only unsubscribes the account it was sent to.
 * @param {string} userId
 * @returns {string} base64url token
 */
export function unsubscribeToken(userId) {
  return crypto
    .createHmac('sha256', unsubscribeSecret())
    .update(`announcements:unsubscribe:${userId}`)
    .digest('base64url')
}

/**
 * @param {string} userId
 * @param {string} token
 * @returns {boolean}
 */
export function verifyUnsubscribeToken(userId, token) {
  if (!isUuid(userId) || typeof token !== 'string') return false
  const expected = Buffer.from(unsubscribeToken(userId))
  const given = Buffer.from(token)
  return expected.length === given.length && crypto.timingSafeEqual(expected, given)
}

/**
 * One-click link (GET shows a confirm page; POST unsubscribes). Served through the
 * frontend's `/api` rewrite so it lives on the site's own domain.
 * @param {string} userId
 * @returns {string}
 */
export function unsubscribeUrl(userId) {
  const params = new URLSearchParams({ u: userId, t: unsubscribeToken(userId) })
  return `${appUrl()}/api/email/unsubscribe?${params}`
}

/**
 * @param {string} userId
 * @returns {Promise<boolean>} Whether an account was updated.
 */
export async function unsubscribeFromAnnouncements(userId) {
  const result = await query('UPDATE users SET announcement_emails = false WHERE id = $1', [userId])
  return result.rowCount > 0
}

/**
 * Accounts that should receive announcements.
 * @returns {Promise<Array<{ id: string, email: string, username: string }>>}
 */
export async function listAnnouncementRecipients() {
  const result = await query(
    `SELECT id, email, username FROM users
     WHERE announcement_emails
       AND email_verified_at IS NOT NULL
       AND NOT is_demo
       AND NOT pending_signup
     ORDER BY created_at`,
  )
  return result.rows
}

/**
 * Send one announcement to each recipient in turn. A failed send is recorded and the
 * rest continue.
 *
 * @param {{ subject: string, bodyText: string }} announcement
 * @param {Array<{ id: string, email: string, username: string }>} recipients
 * @param {{ delayMs?: number, send?: typeof sendAnnouncementEmail, onProgress?: (done: number, total: number) => void }} [options]
 * @returns {Promise<{ sent: number, failed: Array<{ email: string, error: string }> }>}
 */
export async function sendAnnouncement(announcement, recipients, options = {}) {
  const delayMs = options.delayMs ?? (Number(process.env.ANNOUNCEMENT_DELAY_MS) || DEFAULT_DELAY_MS)
  const send = options.send || sendAnnouncementEmail
  const failed = []
  let sent = 0

  for (const [index, user] of recipients.entries()) {
    try {
      await send(user, announcement, unsubscribeUrl(user.id))
      sent += 1
    } catch (error) {
      failed.push({ email: user.email, error: error.message })
    }
    options.onProgress?.(index + 1, recipients.length)
    if (delayMs > 0 && index < recipients.length - 1) {
      await new Promise((resolve) => setTimeout(resolve, delayMs))
    }
  }
  return { sent, failed }
}
