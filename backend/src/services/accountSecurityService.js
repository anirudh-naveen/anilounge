/**
 * Email verification, lockout unlock codes, and authenticator-app 2FA.
 *
 * Layer: service. Owns the `email_codes` and `two_factor_backup_codes` tables and
 * the verification/2FA columns on `users` (these are written here directly, not
 * through `User.save`). Codes and backup codes are stored as SHA-256 hashes.
 */

import crypto from 'crypto'
import QRCode from 'qrcode'
import { query } from '../../config/postgres.js'
import { generateTotpSecret, otpauthUrl, verifyTotp } from '../utils/totp.js'

export const CODE_TTL_MS = {
  verify_email: 24 * 60 * 60 * 1000,
  unlock_account: 60 * 60 * 1000,
}
export const MAX_CODE_ATTEMPTS = 5
export const RESEND_COOLDOWN_MS = 60 * 1000
const BACKUP_CODE_COUNT = 8

/**
 * @param {string} userId
 * @param {string} code
 * @returns {string}
 */
function hashCode(userId, code) {
  return crypto.createHash('sha256').update(`${userId}:${code}`).digest('hex')
}

/**
 * Uniform random six-digit code.
 * @returns {string}
 */
export function generateSixDigitCode() {
  return String(crypto.randomInt(0, 1_000_000)).padStart(6, '0')
}

/**
 * Seconds until another code of this purpose may be sent (0 when allowed).
 * @param {string} userId
 * @param {'verify_email'|'unlock_account'} purpose
 * @returns {Promise<number>}
 */
export async function resendWaitSeconds(userId, purpose) {
  const { rows } = await query(
    `SELECT created_at FROM email_codes
     WHERE user_id = $1 AND purpose = $2
     ORDER BY created_at DESC LIMIT 1`,
    [userId, purpose],
  )
  if (!rows[0]) return 0
  const elapsed = Date.now() - new Date(rows[0].created_at).getTime()
  return Math.max(0, Math.ceil((RESEND_COOLDOWN_MS - elapsed) / 1000))
}

/**
 * Create a fresh code for `purpose`, invalidating earlier unused ones.
 * @param {string} userId
 * @param {'verify_email'|'unlock_account'} purpose
 * @returns {Promise<string>} The plaintext code to email.
 */
export async function issueEmailCode(userId, purpose) {
  const code = generateSixDigitCode()
  await query(
    `UPDATE email_codes SET consumed_at = now()
     WHERE user_id = $1 AND purpose = $2 AND consumed_at IS NULL`,
    [userId, purpose],
  )
  await query(
    `INSERT INTO email_codes (user_id, purpose, code_hash, expires_at)
     VALUES ($1, $2, $3, $4)`,
    [userId, purpose, hashCode(userId, code), new Date(Date.now() + CODE_TTL_MS[purpose])],
  )
  return code
}

/**
 * Check and consume the latest code for `purpose`. Wrong guesses count against
 * the code; after `MAX_CODE_ATTEMPTS` it stops working and a new one is needed.
 *
 * @param {string} userId
 * @param {'verify_email'|'unlock_account'} purpose
 * @param {unknown} code - User input.
 * @returns {Promise<'ok'|'invalid'|'expired'|'too_many_attempts'|'missing'>}
 */
export async function consumeEmailCode(userId, purpose, code) {
  const { rows } = await query(
    `SELECT id, code_hash, expires_at, attempts FROM email_codes
     WHERE user_id = $1 AND purpose = $2 AND consumed_at IS NULL
     ORDER BY created_at DESC LIMIT 1`,
    [userId, purpose],
  )
  const row = rows[0]
  if (!row) return 'missing'
  if (new Date(row.expires_at).getTime() < Date.now()) return 'expired'
  if (row.attempts >= MAX_CODE_ATTEMPTS) return 'too_many_attempts'

  const input = String(code ?? '').replace(/\s/g, '')
  const matches =
    /^\d{6}$/.test(input) &&
    crypto.timingSafeEqual(Buffer.from(row.code_hash), Buffer.from(hashCode(userId, input)))
  if (!matches) {
    await query('UPDATE email_codes SET attempts = attempts + 1 WHERE id = $1', [row.id])
    return 'invalid'
  }
  await query('UPDATE email_codes SET consumed_at = now() WHERE id = $1', [row.id])
  return 'ok'
}

/**
 * @param {string} userId
 * @returns {Promise<void>}
 */
export async function markEmailVerified(userId) {
  await query(
    'UPDATE users SET email_verified_at = COALESCE(email_verified_at, now()) WHERE id = $1',
    [userId],
  )
}

// ---------------------------------------------------------------------------
// Two-factor authentication
// ---------------------------------------------------------------------------

/**
 * Start 2FA setup: store a pending secret and return what the user scans.
 * @param {{ _id: string, email: string }} user
 * @returns {Promise<{ secret: string, otpauthUrl: string, qrCodeDataUrl: string }>}
 */
export async function beginTwoFactorSetup(user) {
  const secret = generateTotpSecret()
  await query('UPDATE users SET two_factor_pending_secret = $2 WHERE id = $1', [user._id, secret])
  const url = otpauthUrl(secret, user.email)
  const qrCodeDataUrl = await QRCode.toDataURL(url, { margin: 1, width: 220 })
  return { secret, otpauthUrl: url, qrCodeDataUrl }
}

/**
 * Confirm setup with a code from the pending secret; enables 2FA and issues backup codes.
 * @param {string} userId
 * @param {unknown} code
 * @returns {Promise<string[]|null>} Plaintext backup codes, or null when the code is wrong or no setup is pending.
 */
export async function confirmTwoFactorSetup(userId, code) {
  const { rows } = await query('SELECT two_factor_pending_secret FROM users WHERE id = $1', [
    userId,
  ])
  const secret = rows[0]?.two_factor_pending_secret
  if (!secret || !verifyTotp(secret, code)) return null
  await query(
    `UPDATE users SET two_factor_enabled = true, two_factor_secret = $2,
       two_factor_pending_secret = NULL WHERE id = $1`,
    [userId, secret],
  )
  return regenerateBackupCodes(userId)
}

/**
 * Replace a user's backup codes.
 * @param {string} userId
 * @returns {Promise<string[]>} Plaintext codes formatted `xxxx-xxxx`.
 */
export async function regenerateBackupCodes(userId) {
  const codes = Array.from({ length: BACKUP_CODE_COUNT }, () => {
    const raw = crypto.randomBytes(4).toString('hex')
    return `${raw.slice(0, 4)}-${raw.slice(4)}`
  })
  await query('DELETE FROM two_factor_backup_codes WHERE user_id = $1', [userId])
  await query(
    `INSERT INTO two_factor_backup_codes (user_id, code_hash)
     SELECT $1, unnest($2::text[])`,
    [userId, codes.map((code) => hashCode(userId, code))],
  )
  return codes
}

/**
 * Check a login/disable code: a current authenticator code or an unused backup code
 * (which is then spent).
 * @param {string} userId
 * @param {unknown} code
 * @returns {Promise<boolean>}
 */
export async function verifyTwoFactorCode(userId, code) {
  const input = String(code ?? '').trim().toLowerCase()
  const { rows } = await query(
    'SELECT two_factor_enabled, two_factor_secret FROM users WHERE id = $1',
    [userId],
  )
  const row = rows[0]
  if (!row?.two_factor_enabled || !row.two_factor_secret) return false
  if (verifyTotp(row.two_factor_secret, input)) return true

  if (!/^[0-9a-f]{4}-?[0-9a-f]{4}$/.test(input)) return false
  const normalized = input.includes('-') ? input : `${input.slice(0, 4)}-${input.slice(4)}`
  const result = await query(
    `UPDATE two_factor_backup_codes SET used_at = now()
     WHERE user_id = $1 AND code_hash = $2 AND used_at IS NULL`,
    [userId, hashCode(userId, normalized)],
  )
  return result.rowCount > 0
}

/**
 * Number of unused backup codes.
 * @param {string} userId
 * @returns {Promise<number>}
 */
export async function remainingBackupCodes(userId) {
  const { rows } = await query(
    'SELECT count(*)::int AS n FROM two_factor_backup_codes WHERE user_id = $1 AND used_at IS NULL',
    [userId],
  )
  return rows[0]?.n ?? 0
}

/**
 * Turn 2FA off and delete its secret and backup codes.
 * @param {string} userId
 * @returns {Promise<void>}
 */
export async function disableTwoFactor(userId) {
  await query(
    `UPDATE users SET two_factor_enabled = false, two_factor_secret = NULL,
       two_factor_pending_secret = NULL WHERE id = $1`,
    [userId],
  )
  await query('DELETE FROM two_factor_backup_codes WHERE user_id = $1', [userId])
}
