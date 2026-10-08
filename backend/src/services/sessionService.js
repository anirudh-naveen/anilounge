/**
 * Browser sessions: short-lived access JWTs plus a rotating refresh token cookie.
 *
 * Layer: service. The refresh token lives only in an httpOnly, SameSite=Lax cookie
 * scoped to `/api/auth`, so page scripts can never read it; the database keeps only
 * its SHA-256 hash. Each refresh rotates the token. Presenting an already-rotated
 * token is treated as theft and revokes every session for that user.
 */

import crypto from 'crypto'
import jwt from 'jsonwebtoken'
import { parse as parseCookies } from 'cookie'
import cron from 'node-cron'
import { query } from '../../config/postgres.js'
import { withJobLock } from '../utils/jobLock.js'

export const REFRESH_COOKIE = 'al_refresh'
export const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000
const ACCESS_TOKEN_TTL = '15m'

/**
 * @param {string} token
 * @returns {string}
 */
function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex')
}

/**
 * Cookie attributes shared by set and clear (they must match to clear).
 * @returns {import('express').CookieOptions}
 */
function cookieOptions() {
  return {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/api/auth',
  }
}

/**
 * Sign a 15-minute access JWT (HS256).
 * @param {string} userId
 * @returns {string}
 */
export function signAccessToken(userId) {
  return jwt.sign({ userId }, process.env.JWT_SECRET, {
    expiresIn: ACCESS_TOKEN_TTL,
    algorithm: 'HS256',
  })
}

/**
 * Refresh token from the request cookie, if any.
 * @param {import('express').Request} req
 * @returns {string | null}
 */
function readRefreshCookie(req) {
  const cookies = parseCookies(req.headers.cookie || '')
  return cookies[REFRESH_COOKIE] || null
}

/**
 * Store a new refresh token and set it as the session cookie.
 * @param {import('express').Response} res
 * @param {string} userId
 * @returns {Promise<void>}
 */
async function setRefreshCookie(res, userId) {
  const token = crypto.randomBytes(48).toString('base64url')
  await query(
    `INSERT INTO refresh_tokens (token, user_id, expires_at)
     VALUES ($1, $2, $3)`,
    [hashToken(token), userId, new Date(Date.now() + SESSION_TTL_MS)],
  )
  res.cookie(REFRESH_COOKIE, token, { ...cookieOptions(), maxAge: SESSION_TTL_MS })
}

/**
 * Start a session: set the refresh cookie and return an access token.
 * @param {import('express').Response} res
 * @param {string} userId
 * @returns {Promise<string>} Access JWT for the response body.
 */
export async function startSession(res, userId) {
  await setRefreshCookie(res, userId)
  return signAccessToken(userId)
}

/** A rotated token seen again within this window is a multi-tab race, not theft. */
const ROTATION_GRACE_MS = 60 * 1000

/**
 * Rotate the refresh cookie and mint a new access token.
 *
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @returns {Promise<{ userId: string, accessToken: string } | { retry: true } | null>}
 *   `retry` when another tab rotated this token moments ago (the browser already holds
 *   the new cookie). Null when there is no valid session; the cookie is cleared, and a
 *   reused token older than the grace window revokes all of that user's sessions.
 */
export async function rotateSession(req, res) {
  const token = readRefreshCookie(req)
  if (!token) return null

  const { rows } = await query(
    `WITH current AS (
       SELECT id, user_id, expires_at, is_revoked, revoked_at
       FROM refresh_tokens WHERE token = $1
       FOR UPDATE
     ), revoke AS (
       UPDATE refresh_tokens r SET is_revoked = true, revoked_at = COALESCE(r.revoked_at, now())
       FROM current WHERE r.id = current.id
     )
     SELECT current.*,
       -- A live token issued at/after this one's revocation means it was rotated
       -- (possibly by another tab), not signed out.
       EXISTS (
         SELECT 1 FROM refresh_tokens n
         WHERE n.user_id = current.user_id AND n.is_revoked = false
           AND n.created_at >= current.revoked_at
       ) AS was_rotated
     FROM current`,
    [hashToken(token)],
  )
  const row = rows[0]

  if (row?.is_revoked) {
    const revokedAgo = row.revoked_at ? Date.now() - new Date(row.revoked_at).getTime() : Infinity
    if (row.was_rotated && revokedAgo < ROTATION_GRACE_MS) return { retry: true }
    // A rotated token came back: someone else holds a copy. End every session.
    await revokeAllSessions(row.user_id)
  }
  if (!row || row.is_revoked || new Date(row.expires_at) < new Date()) {
    res.clearCookie(REFRESH_COOKIE, cookieOptions())
    return null
  }

  await setRefreshCookie(res, row.user_id)
  return { userId: String(row.user_id), accessToken: signAccessToken(row.user_id) }
}

/**
 * End the current browser session (logout).
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @returns {Promise<void>}
 */
export async function endSession(req, res) {
  const token = readRefreshCookie(req)
  if (token) {
    await query(
      `UPDATE refresh_tokens SET is_revoked = true, revoked_at = COALESCE(revoked_at, now())
       WHERE token = $1`,
      [hashToken(token)],
    )
  }
  res.clearCookie(REFRESH_COOKIE, cookieOptions())
}

/**
 * Revoke every refresh token for a user (sign out everywhere, password change).
 * Access tokens already issued stay valid until they expire (15 minutes at most).
 * @param {string} userId
 * @returns {Promise<number>} Sessions revoked.
 */
export async function revokeAllSessions(userId) {
  const result = await query(
    `UPDATE refresh_tokens SET is_revoked = true, revoked_at = now()
     WHERE user_id = $1 AND is_revoked = false`,
    [userId],
  )
  return result.rowCount || 0
}

/**
 * Delete refresh tokens past their expiry. Every refresh rotates the token, so an active
 * user adds a row each 15 minutes; revoked rows are kept until they expire because a
 * rotated token showing up again is how a stolen copy is detected.
 * @returns {Promise<number>} Rows deleted.
 */
export async function deleteExpiredSessions() {
  const { rowCount } = await query(
    `DELETE FROM refresh_tokens WHERE expires_at < now() - interval '1 day'`,
  )
  return rowCount || 0
}

/**
 * Run `deleteExpiredSessions` daily (SESSION_CLEANUP_CRON, default 03:20 UTC) on one
 * instance.
 * @returns {import('node-cron').ScheduledTask | null}
 */
export function startSessionCleanupScheduler() {
  const schedule = process.env.SESSION_CLEANUP_CRON || '20 3 * * *'
  if (!cron.validate(schedule)) {
    console.error(`Invalid SESSION_CLEANUP_CRON "${schedule}"; session cleanup not scheduled`)
    return null
  }
  return cron.schedule(
    schedule,
    () => {
      withJobLock('session-cleanup', deleteExpiredSessions, { minIntervalMs: 60 * 60_000 })
        .then((deleted) => {
          if (typeof deleted === 'number' && deleted) {
            console.log(`Session cleanup: deleted ${deleted} expired refresh token(s)`)
          }
        })
        .catch((error) => console.error('Session cleanup failed:', error.message))
    },
    { timezone: 'UTC' },
  )
}
