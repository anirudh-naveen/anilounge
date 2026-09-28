/**
 * Rate limiting for `/api/auth` writes.
 *
 * Layer: middleware. Five auth writes per IP per 15 minutes slow credential
 * stuffing. `resetAuthRateLimits` clears an IP's counters once it proves account
 * ownership (emailed unlock code), so a user is not blocked right after unlocking.
 */

import rateLimit from 'express-rate-limit'
import { isDemoEmail } from '../models/User.js'

/** Auth writes: 5 per IP per 15 minutes. GETs, unlocks, and demo logins are exempt. */
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // 5 auth requests per IP per window
  // Profile reads are not credential attempts; demo logins must always work; the
  // unlock code is attempt-limited itself and must work right after a lockout.
  skip: (req) =>
    req.method === 'GET' ||
    (req.method === 'POST' && req.path === '/unlock') ||
    (req.method === 'POST' && req.path === '/login' && isDemoEmail(req.body?.email)),
  message: {
    success: false,
    message: 'Too many authentication attempts, please try again later.',
  },
  standardHeaders: true,
  legacyHeaders: false,
})

/**
 * Forget `ip`'s auth attempts in this limiter and the production brute-force counter.
 *
 * @param {string} ip - `req.ip` of the request that proved ownership.
 * @returns {Promise<void>}
 */
export async function resetAuthRateLimits(ip) {
  global.bruteForceStore?.delete(`brute-force-${ip}`)
  await authLimiter.resetKey(ip)
}
