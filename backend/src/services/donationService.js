/**
 * Donations through Ko-fi, and the Supporter badge they grant.
 *
 * Layer: domain service. Ko-fi POSTs every payment to the webhook (routes/webhooks.js)
 * with the verification token from Ko-fi → Settings → API, which must match
 * KOFI_VERIFICATION_TOKEN. A payment whose email belongs to a verified account gives it
 * the `supporter` badge; otherwise the email waits in `donations` until an account
 * verifies that address (`claimDonations`, called from markEmailVerified). Admins can
 * also grant the badge by hand for donations made under another email.
 */

import crypto from 'node:crypto'
import { query } from '../../config/postgres.js'
import { logAction } from './adminLog.js'
import { HttpError } from '../utils/httpError.js'

export const SUPPORTER_BADGE = 'supporter'

/** Ko-fi payment types that count as a donation (shop orders and commissions don't). */
const DONATION_TYPES = new Set(['Donation', 'Subscription'])

/**
 * Whether `token` matches KOFI_VERIFICATION_TOKEN (constant time). False when unset.
 * @param {unknown} token
 * @returns {boolean}
 */
export function isValidKofiToken(token, expected = process.env.KOFI_VERIFICATION_TOKEN) {
  if (!expected || typeof token !== 'string') return false
  const a = crypto.createHash('sha256').update(token).digest()
  const b = crypto.createHash('sha256').update(expected).digest()
  return crypto.timingSafeEqual(a, b)
}

/**
 * Parse Ko-fi's webhook body: form-encoded with one `data` field holding JSON.
 * @param {unknown} body - `req.body`.
 * @returns {{ token: unknown, transactionId: string, kind: string, amount: number | null,
 *   currency: string | null, email: string | null, donatedAt: Date } | null}
 *   null when the body isn't a Ko-fi payment.
 */
export function parseKofiPayload(body) {
  const raw = body && typeof body === 'object' ? body.data : null
  let data
  try {
    data = typeof raw === 'string' ? JSON.parse(raw) : raw
  } catch {
    return null
  }
  if (!data || typeof data !== 'object') return null
  const transactionId = String(data.kofi_transaction_id || data.message_id || '').trim()
  if (!transactionId || typeof data.type !== 'string') return null
  const amount = Number.parseFloat(data.amount)
  const email = typeof data.email === 'string' ? data.email.trim().toLowerCase() : ''
  const donatedAt = new Date(data.timestamp)
  return {
    token: data.verification_token,
    transactionId: transactionId.slice(0, 200),
    kind: data.type.slice(0, 40),
    amount: Number.isFinite(amount) ? amount : null,
    currency: typeof data.currency === 'string' ? data.currency.slice(0, 8) : null,
    email: email && email.length <= 320 && email.includes('@') ? email : null,
    donatedAt: Number.isNaN(donatedAt.getTime()) ? new Date() : donatedAt,
  }
}

/**
 * Add the Supporter badge to an account (no-op when it already has it).
 * @param {{ id: string, username: string }} user
 * @returns {Promise<boolean>} Whether the badge was newly added.
 */
async function grantSupporter(user) {
  const { rowCount } = await query(
    `UPDATE users SET cosmetic_roles = array_append(cosmetic_roles, $2)
     WHERE id = $1 AND NOT ($2 = ANY (cosmetic_roles))`,
    [user.id, SUPPORTER_BADGE],
  )
  if (rowCount) {
    await logAction('moderation', null, `Supporter badge for "${user.username}" (Ko-fi donation)`)
  }
  return rowCount > 0
}

/** Verified, active, real accounts with this email. */
async function findDonorAccount(email) {
  const { rows } = await query(
    `SELECT id, username FROM users
     WHERE lower(email) = $1 AND email_verified_at IS NOT NULL
       AND banned_at IS NULL AND NOT is_demo
     LIMIT 1`,
    [email],
  )
  return rows[0] || null
}

/**
 * Record one Ko-fi webhook delivery and grant the badge when the donor has an account.
 * Repeat deliveries of the same payment are ignored.
 * @param {unknown} body - `req.body`.
 * @returns {Promise<{ recorded: boolean, granted: boolean }>}
 * @throws {HttpError} 400 for a malformed body, 401 for a wrong token.
 */
export async function recordKofiWebhook(body) {
  const payment = parseKofiPayload(body)
  if (!payment) throw new HttpError(400, 'Not a Ko-fi payment.')
  if (!isValidKofiToken(payment.token)) throw new HttpError(401, 'Invalid verification token.')
  if (!DONATION_TYPES.has(payment.kind)) return { recorded: false, granted: false }

  const donor = payment.email ? await findDonorAccount(payment.email) : null
  const { rowCount } = await query(
    `INSERT INTO donations (provider, transaction_id, kind, amount, currency, email, user_id, donated_at)
     VALUES ('kofi', $1, $2, $3, $4, $5, $6, $7)
     ON CONFLICT (provider, transaction_id) DO NOTHING`,
    [
      payment.transactionId,
      payment.kind,
      payment.amount,
      payment.currency,
      // The email is only kept while no account has claimed it.
      donor ? null : payment.email,
      donor?.id || null,
      payment.donatedAt,
    ],
  )
  if (!rowCount) return { recorded: false, granted: false }
  return { recorded: true, granted: donor ? await grantSupporter(donor) : false }
}

/**
 * Give a newly verified account the badge for donations made with its email before it
 * existed (or before it was verified). Never throws: verification must still succeed.
 * @param {string} userId
 * @returns {Promise<boolean>} Whether any donation was claimed.
 */
export async function claimDonations(userId) {
  try {
    const { rows } = await query(
      `UPDATE donations d SET user_id = u.id, email = NULL
       FROM users u
       WHERE u.id = $1 AND d.user_id IS NULL AND d.email = lower(u.email)
         AND u.email_verified_at IS NOT NULL AND u.banned_at IS NULL AND NOT u.is_demo
       RETURNING u.id, u.username`,
      [userId],
    )
    if (!rows.length) return false
    await grantSupporter(rows[0])
    return true
  } catch (error) {
    console.error('Claiming donations failed:', error.message)
    return false
  }
}

export default { isValidKofiToken, parseKofiPayload, recordKofiWebhook, claimDonations }
