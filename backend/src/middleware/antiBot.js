/**
 * Request-level bot, brute-force, NoSQL-injection, and referer guards.
 *
 * Layer: middleware. Localhost and `NODE_ENV=development` skip bot/API checks
 * so the SPA and tooling can call the API without a production User-Agent.
 */

import rateLimit from 'express-rate-limit'
import slowDown from 'express-slow-down'
import { rateLimitStore } from './pgRateLimitStore.js'
import { rateLimitKey } from './rateLimitKey.js'
import { banIPForBot, banIPForSuspiciousActivity } from './ipBan.js'
import { isAllowedReferer } from '../utils/allowedFrontends.js'
import { isDemoEmail } from '../models/User.js'

/**
 * Recent request times per IP + User-Agent for the burst check. Only the last second
 * matters, so a sweep drops idle keys; without it the map grew with every visitor.
 * @type {Map<string, number[]>}
 */
const requestTimestamps = new Map()

const LOCAL_IPS = new Set(['::1', '127.0.0.1', 'localhost'])
const SUSPICIOUS_USER_AGENT = /bot|crawler|spider|scraper|headless|phantom|selenium|puppeteer/i
/** Mongo operators and script URLs, rejected in every field. */
const OPERATOR_PATTERN = /\$(?:where|ne|gt|lt|regex|exists|in|nin|or|and)|javascript:/i
/** Code-ish words, rejected outside prose fields (see FREE_TEXT_FIELDS). */
const CODE_WORD_PATTERN = /this\.|function|eval/i

/**
 * Local and development requests skip the bot and referer checks.
 * @param {import('express').Request} req
 * @returns {boolean}
 */
function isLocalRequest(req) {
  return (
    process.env.NODE_ENV === 'development' ||
    LOCAL_IPS.has(req.ip) ||
    Boolean(req.hostname?.includes('localhost'))
  )
}
const sweepTimer = setInterval(() => {
  const cutoff = Date.now() - 1000
  for (const [key, times] of requestTimestamps) {
    if (!times.length || times[times.length - 1] < cutoff) requestTimestamps.delete(key)
  }
}, 10_000)
sweepTimer.unref?.()

/**
 * Block suspicious/minimal User-Agents (and ban the IP) and refuse more than 10 requests
 * per second per IP+UA. Skipped for localhost and development.
 *
 * @param {import('express').Request} req - Uses `req.ip`, hostname, and User-Agent.
 * @param {import('express').Response} res - 429 on rapid fire, 403 on bot UA.
 * @param {import('express').NextFunction} next - Continues when the request looks human.
 * @returns {void}
 */
export const antiBotProtection = (req, res, next) => {
  if (isLocalRequest(req)) return next()

  const userAgent = req.get('User-Agent') || ''
  const ip = req.ip
  const isSuspiciousUA = SUSPICIOUS_USER_AGENT.test(userAgent)
  const isMinimalUA = userAgent.length < 5

  const now = Date.now()
  const key = `${ip}-${userAgent}`
  const timestamps = requestTimestamps.get(key) || []
  const recentRequests = timestamps.filter((t) => now - t < 1000) // Last 1 second

  // Refused but not banned: one page can load many avatars at once, and people behind
  // a shared address can burst together. Sustained abuse hits the rate limiters.
  if (recentRequests.length > 10) {
    return res.status(429).json({
      success: false,
      message: 'Too many requests detected. Please slow down.',
    })
  }

  recentRequests.push(now)
  requestTimestamps.set(key, recentRequests.slice(-20)) // Keep last 20

  if (isSuspiciousUA || isMinimalUA) {
    banIPForBot(ip, userAgent, 'bot_detection').catch(console.error)

    return res.status(403).json({
      success: false,
      message: 'Access denied. Automated requests not allowed.',
    })
  }

  next()
}

/**
 * Delay responses after 50 requests in 15 minutes (500ms steps, cap 20s).
 * Successful responses are not counted; failed ones are.
 */
export const progressiveSlowdown = slowDown({
  windowMs: 15 * 60 * 1000, // 15 minutes
  delayAfter: 50, // Allow 50 requests per windowMs
  delayMs: () => 500, // Fixed delay function
  maxDelayMs: 20000, // Maximum delay of 20 seconds
  skipSuccessfulRequests: true,
  skipFailedRequests: false,
  // Per account when signed in (like the general limiter), so people behind one IP
  // don't slow each other down.
  keyGenerator: rateLimitKey,
})

const AUTH_WINDOW_MS = 15 * 60 * 1000
const AUTH_MAX_ATTEMPTS = 5
const authAttemptMessage = {
  success: false,
  message: 'Too many authentication attempts. Please try again later.',
}

/**
 * Sign-ups count every attempt (slows account spam from one IP). Sign-ins count only
 * failures: successful sign-ins from a shared IP (campus, office, carrier NAT) must not
 * lock out the next person, and per-account lockout already covers guessing.
 * Production only; demo-account logins are exempt.
 */
const registerLimiter = rateLimit({
  windowMs: AUTH_WINDOW_MS,
  max: AUTH_MAX_ATTEMPTS,
  skip: (req) => process.env.NODE_ENV !== 'production' || isDemoEmail(req.body?.email),
  message: authAttemptMessage,
  standardHeaders: true,
  legacyHeaders: false,
  ...rateLimitStore('brute-register'),
})
const loginLimiter = rateLimit({
  windowMs: AUTH_WINDOW_MS,
  max: AUTH_MAX_ATTEMPTS,
  skipSuccessfulRequests: true,
  skip: (req) => process.env.NODE_ENV !== 'production' || isDemoEmail(req.body?.email),
  message: authAttemptMessage,
  standardHeaders: true,
  legacyHeaders: false,
  ...rateLimitStore('brute-login'),
})

export const bruteForceProtection = {
  /**
   * Per-IP auth attempt cap (5 per 15 minutes): all sign-up attempts, failed sign-ins.
   *
   * @param {import('express').Request} req
   * @param {import('express').Response} res - 429 when the cap is exceeded.
   * @param {import('express').NextFunction} next
   * @returns {void}
   */
  prevent: (req, res, next) =>
    (req.path.endsWith('/register') ? registerLimiter : loginLimiter)(req, res, next),
  /**
   * Forget an IP's attempts (after it proves account ownership).
   * @param {string} ip
   * @returns {Promise<void>}
   */
  reset: async (ip) => {
    await Promise.all([registerLimiter.resetKey(ip), loginLimiter.resetKey(ip)])
  },
}

/** Body/query keys holding user prose (posts, messages, bios, searches), always bound as SQL parameters. */
const FREE_TEXT_FIELDS = new Set([
  'body',
  'title',
  'message',
  'bio',
  'headline',
  'notes',
  'review',
  'query',
  'q',
  'text',
])

/**
 * Recursively scan body/query/params strings for Mongo operator / eval patterns and
 * return 400 on a hit. Operator patterns also ban the IP; code-ish words alone do not,
 * since ordinary names and emails can contain them ("medieval", "this.name@...").
 *
 * @param {import('express').Request} req - Inspects `body`, `query`, and `params`.
 * @param {import('express').Response} res - 400 `{ message: 'Invalid request format detected.' }` on injection.
 * @param {import('express').NextFunction} next - Continues when no pattern matches.
 * @returns {void}
 */
export const databaseProtection = (req, res, next) => {
  /**
   * Walk a JSON-like value for dangerous patterns. Prose fields skip the word patterns,
   * so "I loved this." or "evaluate" in a post is not treated as an injection attempt.
   *
   * @param {unknown} obj - Current node (string, object, or other).
   * @param {string} [path=''] - Dotted path; its last segment picks the field rules.
   * @returns {'operator' | 'word' | null} The worst hit (an operator wins over a word).
   */
  const checkForInjection = (obj, path = '') => {
    if (typeof obj === 'string') {
      const field = path.slice(path.lastIndexOf('.') + 1)
      if (OPERATOR_PATTERN.test(obj)) return 'operator'
      return !FREE_TEXT_FIELDS.has(field) && CODE_WORD_PATTERN.test(obj) ? 'word' : null
    }
    if (typeof obj !== 'object' || obj === null) return null
    let worst = null
    for (const [key, value] of Object.entries(obj)) {
      const hit = checkForInjection(value, `${path}.${key}`)
      if (hit === 'operator') return hit
      worst ||= hit
    }
    return worst
  }

  const hit = checkForInjection({ body: req.body, query: req.query, params: req.params })
  if (hit) {
    if (hit === 'operator') {
      banIPForSuspiciousActivity(req.ip, req.get('User-Agent'), 'injection_attempt').catch(
        console.error,
      )
    }
    return res.status(400).json({
      success: false,
      message: 'Invalid request format detected.',
    })
  }

  next()
}

/**
 * Require User-Agent/Accept and, when a Referer is present, restrict it to known hosts.
 * Skipped for localhost and development.
 *
 * @param {import('express').Request} req - Reads Origin, Referer, hostname, and `req.ip`.
 * @param {import('express').Response} res - 400 missing headers, 403 invalid referer.
 * @param {import('express').NextFunction} next - Continues when headers/referer pass (or skipped).
 * @returns {void}
 */
export const apiProtection = (req, res, next) => {
  const origin = req.get('origin')
  const referer = req.get('referer') || req.get('referrer')
  if (isLocalRequest(req) || origin?.includes('localhost') || referer?.includes('localhost')) {
    return next()
  }

  const requiredHeaders = ['user-agent', 'accept']
  const missingHeaders = requiredHeaders.filter((header) => !req.get(header))

  if (missingHeaders.length > 0) {
    return res.status(400).json({
      success: false,
      message: 'Missing required headers.',
    })
  }

  // Known frontends, or no referer (privacy browsers / Vercel `/api` rewrites).
  if (!isAllowedReferer(referer)) {
    return res.status(403).json({
      success: false,
      message: 'Invalid referer detected.',
    })
  }

  next()
}
