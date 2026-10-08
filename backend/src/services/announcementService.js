/**
 * Site-wide announcement emails and the announcement unsubscribe flow.
 *
 * Layer: service. Announcements go out as notify@anilounge.net (via emailService) to
 * every verified, non-demo account that has not opted out. Each email carries a signed
 * one-click unsubscribe link (services/emailPreferenceService.js), so opting out needs
 * no sign-in. Security and account emails are unaffected by the opt-out.
 *
 * Env: JWT_SECRET (signs unsubscribe links), ANNOUNCEMENT_DELAY_MS (pause between
 * sends, default 600 to stay under Resend's 2 requests/second limit).
 */

import { query } from '../../config/postgres.js'
import { sendAnnouncementEmail } from './emailService.js'
import { unsubscribeUrl } from './emailPreferenceService.js'

const DEFAULT_DELAY_MS = 600

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
