/**
 * Email opt-outs: per-category preferences and signed one-click unsubscribe links.
 *
 * Layer: service. Optional emails (announcements, friend requests) each have a
 * boolean `users` column. Every optional email carries a link signed for its user
 * and category, so unsubscribing needs no sign-in. Account and security emails
 * (verification codes, unlock links, email-change and deletion notices) cannot be
 * turned off, since they protect the account; their footer links to Settings instead.
 *
 * Env: JWT_SECRET (signs unsubscribe links).
 */

import crypto from 'crypto'
import { query } from '../../config/postgres.js'
import { isUuid } from '../db/ids.js'
import { appUrl } from './emailService.js'

/** Optional email categories: API key → `users` column and user-facing label. */
export const EMAIL_CATEGORIES = Object.freeze({
  announcements: { column: 'announcement_emails', label: 'announcement emails' },
  friend_requests: { column: 'friend_request_emails', label: 'friend request emails' },
})

/**
 * @param {unknown} category
 * @returns {category is keyof typeof EMAIL_CATEGORIES}
 */
export function isEmailCategory(category) {
  return typeof category === 'string' && Object.hasOwn(EMAIL_CATEGORIES, category)
}

function unsubscribeSecret() {
  const secret = process.env.JWT_SECRET
  if (!secret) throw new Error('JWT_SECRET is required to sign unsubscribe links')
  return secret
}

/**
 * HMAC over the user id and category, so a link only opts out the account (and the
 * kind of email) it was sent for. The message for `announcements` matches the one
 * used before categories existed, so links in emails already sent keep working.
 * @param {string} userId
 * @param {string} [category='announcements']
 * @returns {string} base64url token
 */
export function unsubscribeToken(userId, category = 'announcements') {
  return crypto
    .createHmac('sha256', unsubscribeSecret())
    .update(`${category}:unsubscribe:${userId}`)
    .digest('base64url')
}

/**
 * @param {string} userId
 * @param {string} token
 * @param {string} [category='announcements']
 * @returns {boolean}
 */
export function verifyUnsubscribeToken(userId, token, category = 'announcements') {
  if (!isUuid(userId) || typeof token !== 'string' || !isEmailCategory(category)) return false
  const expected = Buffer.from(unsubscribeToken(userId, category))
  const given = Buffer.from(token)
  return expected.length === given.length && crypto.timingSafeEqual(expected, given)
}

/**
 * One-click link (GET shows a confirm page; POST unsubscribes). Served through the
 * frontend's `/api` rewrite so it lives on the site's own domain. Announcement links
 * omit `c` to match links sent before categories existed.
 * @param {string} userId
 * @param {string} [category='announcements']
 * @returns {string}
 */
export function unsubscribeUrl(userId, category = 'announcements') {
  const params = new URLSearchParams({ u: userId, t: unsubscribeToken(userId, category) })
  if (category !== 'announcements') params.set('c', category)
  return `${appUrl()}/api/email/unsubscribe?${params}`
}

/**
 * Current opt-ins for every optional category.
 * @param {string} userId
 * @returns {Promise<Record<keyof typeof EMAIL_CATEGORIES, boolean> | null>} null for an unknown user.
 */
export async function getEmailPreferences(userId) {
  const columns = Object.entries(EMAIL_CATEGORIES)
    .map(([key, { column }]) => `${column} AS "${key}"`)
    .join(', ')
  const { rows } = await query(`SELECT ${columns} FROM users WHERE id = $1`, [userId])
  if (!rows[0]) return null
  return Object.fromEntries(Object.keys(EMAIL_CATEGORIES).map((key) => [key, rows[0][key] !== false]))
}

/**
 * Turn categories on or off. Unknown keys and non-boolean values are ignored.
 * @param {string} userId
 * @param {Record<string, unknown>} changes - e.g. `{ friend_requests: false }`.
 * @returns {Promise<Record<keyof typeof EMAIL_CATEGORIES, boolean> | null>}
 */
export async function setEmailPreferences(userId, changes) {
  const updates = Object.entries(changes || {}).filter(
    ([key, value]) => isEmailCategory(key) && typeof value === 'boolean',
  )
  if (updates.length) {
    const assignments = updates.map(([key], index) => `${EMAIL_CATEGORIES[key].column} = $${index + 2}`)
    await query(`UPDATE users SET ${assignments.join(', ')} WHERE id = $1`, [
      userId,
      ...updates.map(([, value]) => value),
    ])
  }
  return getEmailPreferences(userId)
}

/**
 * Opt a user out of one category, or of every optional category.
 * @param {string} userId
 * @param {keyof typeof EMAIL_CATEGORIES | 'all'} scope
 * @returns {Promise<boolean>} Whether an account was updated.
 */
export async function unsubscribe(userId, scope) {
  const keys = scope === 'all' ? Object.keys(EMAIL_CATEGORIES) : [scope]
  const changes = Object.fromEntries(keys.filter(isEmailCategory).map((key) => [key, false]))
  return Boolean(await setEmailPreferences(userId, changes))
}

export default {
  EMAIL_CATEGORIES,
  isEmailCategory,
  unsubscribeToken,
  verifyUnsubscribeToken,
  unsubscribeUrl,
  getEmailPreferences,
  setEmailPreferences,
  unsubscribe,
}
