/**
 * Rate limiting for `/api/auth` writes.
 *
 * Layer: middleware. Ten failed auth writes per IP per 15 minutes slow credential
 * stuffing. `resetAuthRateLimits` clears an IP's counters once it proves account
 * ownership (emailed unlock code), so a user is not blocked right after unlocking.
 */

import rateLimit from 'express-rate-limit'
import { isCrawlerExempt } from './searchCrawler.js'
import { isDemoEmail } from '../models/User.js'
import { bruteForceProtection } from './antiBot.js'
import { rateLimitStore } from './pgRateLimitStore.js'

/** Session-cookie endpoints: the cookie holds an unguessable token, so there is nothing to brute-force. */
const COOKIE_SESSION_PATHS = new Set(['/refresh', '/revoke'])
/**
 * Not credential guesses: sign-up has its own limiter (antiBot.js), so a rejected form
 * is not held against the IP; the unlock code only lifts a lockout (it never signs in);
 * forgot-password always answers 200. Reset codes do count: a guessed one takes over
 * the account.
 */
const UNCOUNTED_PATHS = new Set(['/register', '/unlock', '/forgot-password'])

/**
 * Failed auth writes: 10 per IP per 15 minutes. Successful requests are not counted.
 * GETs, session refresh/logout, sign-ups, unlocks, reset-code requests, and demo logins
 * are exempt.
 */
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // 10 failed auth requests per IP per window
  // Only failures (4xx/5xx) count, so signing up or in successfully never uses the budget.
  skipSuccessfulRequests: true,
  // Profile reads are not credential attempts; the page refreshes its session on every
  // load; demo logins must always work; see UNCOUNTED_PATHS for the rest.
  skip: (req) =>
    isCrawlerExempt(req) ||
    req.method === 'GET' ||
    (req.method === 'POST' && COOKIE_SESSION_PATHS.has(req.path)) ||
    (req.method === 'POST' && UNCOUNTED_PATHS.has(req.path)) ||
    (req.method === 'POST' && req.path === '/login' && isDemoEmail(req.body?.email)),
  message: {
    success: false,
    message: 'Too many authentication attempts, please try again later.',
  },
  standardHeaders: true,
  legacyHeaders: false,
  ...rateLimitStore('auth'),
})

/**
 * Forget `ip`'s auth attempts in this limiter and the production brute-force counter.
 *
 * @param {string} ip - `req.ip` of the request that proved ownership.
 * @returns {Promise<void>}
 */
export async function resetAuthRateLimits(ip) {
  await Promise.all([bruteForceProtection.reset(ip), authLimiter.resetKey(ip)])
}
