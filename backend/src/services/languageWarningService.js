/**
 * Language warnings: strikes for sending text with blocked language.
 *
 * Layer: service. Surfaces that deliver text masked instead of rejecting it (direct
 * messages, forum posts, and comments) run it through `screenText`, which masks it
 * and calls `recordWarning` once per offending send. The sender gets an
 * inbox notification naming what they sent (masked) and how many warnings remain.
 * The first WARNING_LIMIT offenses are warnings; every later one alerts admins in
 * the admin log. Each offense is a 'curse' or a 'slur' (`termCategory`), and alerts
 * are labeled with it plus per-category counts. The first alert in each category also
 * emails SUPPORT_EMAIL, so a slur is emailed even after curses already were. Warnings
 * never expire; admins find these users under Admin → Users → Flagged.
 */

import { query } from '../../config/postgres.js'
import { HttpError } from '../utils/httpError.js'
import { censorText, findBlockedTerm, termCategory } from '../utils/moderation.js'
import { logAction, quoteValue } from './adminLog.js'
import { sendLanguageAlertEmail } from './emailService.js'
import { notify } from './notificationService.js'

export const WARNING_LIMIT = 3
export const EXCERPT_MAX = 300
/** Shown as the actor on admin log lines this service writes. */
const AUTOMOD = { username: 'automod' }

const SURFACE_LABELS = { message: 'direct message', post: 'forum post', comment: 'comment' }
export const CATEGORY_LABELS = { curse: 'Curse', slur: 'Slur' }

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
 * @param {'curse' | 'slur'} [category]
 * @returns {string}
 */
export function warningMessage(
  count,
  surfaceLabel = 'message',
  delivered = true,
  category = 'curse',
) {
  const outcome = delivered ? 'it was sent with those words hidden' : "it wasn't sent"
  const what =
    category === 'slur'
      ? 'a slur, which is never allowed on AniLounge'
      : "language that isn't allowed on AniLounge"
  const lead = `Your ${surfaceLabel} had ${what}, so ${outcome}.`
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
 * `3 curses, 1 slur`.
 * @param {number} curses
 * @param {number} slurs
 * @returns {string}
 */
export function breakdown(curses, slurs) {
  const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`
  return `${plural(curses, 'curse')}, ${plural(slurs, 'slur')}`
}

/**
 * Record one offense, notify the sender, and alert admins once past the limit.
 * Never throws: a failed warning must not block the (already masked) send.
 *
 * @param {{ _id: string, username: string }} user - The sender.
 * @param {{ surface: keyof typeof SURFACE_LABELS, term: string, maskedText: string, delivered?: boolean }} offense
 *   `delivered` is false when the text was refused instead of sent masked.
 * @returns {Promise<{ count: number, limit: number, alerted: boolean, category: 'curse' | 'slur', message: string } | null>}
 */
export async function recordWarning(user, { surface, term, maskedText, delivered = true }) {
  const label = SURFACE_LABELS[surface] || surface
  const category = termCategory(term)
  const shown = excerpt(maskedText)
  try {
    await query(
      `INSERT INTO language_warnings (user_id, surface, term, category, excerpt)
       VALUES ($1, $2, $3, $4, $5)`,
      [user._id, surface, term, category, shown],
    )
    // Totals, per-category counts, and how many alert-level (past the limit)
    // offenses are in this category, in send order.
    const { rows } = await query(
      `SELECT count(*)::int AS count,
              count(*) FILTER (WHERE category = 'curse')::int AS curses,
              count(*) FILTER (WHERE category = 'slur')::int AS slurs,
              count(*) FILTER (WHERE n > $2 AND category = $3)::int AS alerts_in_category
       FROM (
         SELECT category, row_number() OVER (ORDER BY created_at, id) AS n
         FROM language_warnings WHERE user_id = $1
       ) ordered`,
      [user._id, WARNING_LIMIT, category],
    )
    const {
      count = 1,
      curses = 0,
      slurs = 0,
      alerts_in_category: alertsInCategory = 0,
    } = rows[0] || {}
    const alerted = count > WARNING_LIMIT
    const message = warningMessage(count, label, delivered, category)

    await notify(user._id, 'language_warning', {
      detail: {
        surface,
        excerpt: shown,
        term: maskTerm(term),
        category,
        count,
        limit: WARNING_LIMIT,
        message,
      },
    })

    if (alerted) {
      await logAction(
        'moderation',
        AUTOMOD,
        `[${CATEGORY_LABELS[category]}] ${quoteValue(user.username)} has ${count} language warnings (${breakdown(curses, slurs)}; limit ${WARNING_LIMIT}); latest ${label}: ${quoteValue(shown)}. Review for a mute or ban.`,
      )
      if (alertsInCategory === 1) {
        sendLanguageAlertEmail(
          { id: String(user._id), username: user.username },
          {
            count,
            curses,
            slurs,
            category,
            limit: WARNING_LIMIT,
            surface: label,
            term,
            excerpt: shown,
          },
        ).catch((error) => console.error('Language alert email failed:', error.message))
      }
    }
    return { count, limit: WARNING_LIMIT, alerted, category, message }
  } catch (error) {
    console.error('Language warning failed:', error.message)
    return null
  }
}

/**
 * Mask blocked language in one piece of text.
 * @param {string} body - Cleaned text.
 * @param {{ allowCurses?: boolean }} [options] - Leave curses alone and mask only slurs.
 * @returns {{ body: string, term: string | null, clean: boolean }} `term` is the most
 *   serious blocked term (a slur over a curse; null when the text was fine); `clean`
 *   is false when blocked language survives masking.
 */
export function maskLanguage(body, options = {}) {
  const term = findBlockedTerm(body, options)
  if (!term) return { body, term: null, clean: true }
  const masked = censorText(body, options)
  return { body: masked, term, clean: !findBlockedTerm(masked, options) }
}

/**
 * Mask every field of one submission and record a single warning if any had blocked
 * language (the most serious term across fields: a slur over a curse).
 *
 * @template {Record<string, string>} T
 * @param {{ _id: string, username: string }} user - The author.
 * @param {keyof typeof SURFACE_LABELS} surface
 * @param {T} fields - Cleaned text by field name, e.g. `{ title, body }`.
 * @param {{ allowCurses?: boolean }} [options]
 * @returns {Promise<{ fields: T, warning: object | null }>} Masked fields.
 * @throws {HttpError} 400 `BLOCKED_LANGUAGE` when masking can't clean a field (still
 *   counts as a warning).
 */
export async function screenText(user, surface, fields, options = {}) {
  const masked = {}
  let term = null
  let clean = true
  for (const [key, value] of Object.entries(fields)) {
    const result = maskLanguage(value, options)
    masked[key] = result.body
    clean &&= result.clean
    const upgrade = term && termCategory(term) === 'curse' && result.term
    if (result.term && (!term || (upgrade && termCategory(result.term) === 'slur'))) {
      term = result.term
    }
  }
  if (!term) return { fields: masked, warning: null }
  const warning = await recordWarning(user, {
    surface,
    term,
    maskedText: Object.values(masked).join(' — '),
    delivered: clean,
  })
  if (!clean) {
    throw new HttpError(
      400,
      warning?.message || "That has language that isn't allowed on AniLounge.",
      'BLOCKED_LANGUAGE',
    )
  }
  return { fields: masked, warning }
}
