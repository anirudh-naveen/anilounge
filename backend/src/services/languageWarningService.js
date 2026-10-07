/**
 * Language warnings: strikes for sending text with blocked language.
 *
 * Layer: service. Surfaces that deliver text masked instead of rejecting it (direct
 * messages today) call `recordWarning` once per offending send. The sender gets an
 * inbox notification naming what they sent (masked) and how many warnings remain.
 * The first WARNING_LIMIT offenses are warnings; every later one alerts admins in
 * the admin log, and the first of those also emails SUPPORT_EMAIL. Warnings never
 * expire; admins find these users under Admin → Users → Flagged.
 */

import { query } from '../../config/postgres.js'
import { logAction, quoteValue } from './adminLog.js'
import { sendLanguageAlertEmail } from './emailService.js'
import { notify } from './notificationService.js'

export const WARNING_LIMIT = 3
export const EXCERPT_MAX = 300
/** Shown as the actor on admin log lines this service writes. */
const AUTOMOD = { username: 'automod' }

const SURFACE_LABELS = { message: 'direct message' }

/**
 * A blocked term with all but its first letter starred (`fuck` → `f***`).
 * @param {string} term
 * @returns {string}
 */
export function maskTerm(term) {
  const text = String(term || '')
  return text ? `${text[0]}${'*'.repeat(text.length - 1)}` : ''
}

/**
 * Masked text shortened for storage and notifications.
 * @param {string} text
 * @returns {string}
 */
export function excerpt(text) {
  const flat = String(text || '').trim()
  return flat.length > EXCERPT_MAX ? `${flat.slice(0, EXCERPT_MAX - 1)}…` : flat
}

/**
 * What to tell the sender after their `count`-th warning.
 * @param {number} count - Warnings including this one.
 * @param {string} surfaceLabel - e.g. 'direct message'.
 * @param {boolean} [delivered] - Whether the masked text went out (false when refused).
 * @returns {string}
 */
export function warningMessage(count, surfaceLabel = 'message', delivered = true) {
  const outcome = delivered ? 'it was sent with those words hidden' : "it wasn't sent"
  const lead = `Your ${surfaceLabel} had language that isn't allowed on AniLounge, so ${outcome}.`
  if (count > WARNING_LIMIT) {
    return `${lead} You're past ${WARNING_LIMIT} warnings, so admins have been notified and may mute or ban your account.`
  }
  const tail =
    count === WARNING_LIMIT
      ? 'This is your final warning: next time, admins will be notified and may mute or ban your account.'
      : `Admins are notified after ${WARNING_LIMIT} warnings.`
  return `${lead} Warning ${count} of ${WARNING_LIMIT}. ${tail}`
}

/**
 * Record one offense, notify the sender, and alert admins once past the limit.
 * Never throws: a failed warning must not block the (already masked) send.
 *
 * @param {{ _id: string, username: string }} user - The sender.
 * @param {{ surface: keyof typeof SURFACE_LABELS, term: string, maskedText: string, delivered?: boolean }} offense
 *   `delivered` is false when the text was refused instead of sent masked.
 * @returns {Promise<{ count: number, limit: number, alerted: boolean, message: string } | null>}
 */
export async function recordWarning(user, { surface, term, maskedText, delivered = true }) {
  const label = SURFACE_LABELS[surface] || surface
  const shown = excerpt(maskedText)
  try {
    await query(
      `INSERT INTO language_warnings (user_id, surface, term, excerpt) VALUES ($1, $2, $3, $4)`,
      [user._id, surface, term, shown],
    )
    const { rows } = await query(
      'SELECT count(*)::int AS count FROM language_warnings WHERE user_id = $1',
      [user._id],
    )
    const count = rows[0]?.count || 1
    const alerted = count > WARNING_LIMIT
    const message = warningMessage(count, label, delivered)

    await notify(user._id, 'language_warning', {
      detail: {
        surface,
        excerpt: shown,
        term: maskTerm(term),
        count,
        limit: WARNING_LIMIT,
        message,
      },
    })

    if (alerted) {
      await logAction(
        'moderation',
        AUTOMOD,
        `${quoteValue(user.username)} has ${count} language warnings (limit ${WARNING_LIMIT}); latest ${label}: ${quoteValue(shown)}. Review for a mute or ban.`,
      )
      if (count === WARNING_LIMIT + 1) {
        sendLanguageAlertEmail(
          { id: String(user._id), username: user.username },
          { count, limit: WARNING_LIMIT, surface: label, term, excerpt: shown },
        ).catch((error) => console.error('Language alert email failed:', error.message))
      }
    }
    return { count, limit: WARNING_LIMIT, alerted, message }
  } catch (error) {
    console.error('Language warning failed:', error.message)
    return null
  }
}

export default { recordWarning, warningMessage, maskTerm, excerpt, WARNING_LIMIT }
