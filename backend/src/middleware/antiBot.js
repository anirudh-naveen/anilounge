/**
 * Request-level bot, brute-force, NoSQL-injection, and referer guards.
 *
 * Layer: middleware. Localhost and `NODE_ENV=development` skip bot/API checks
 * so the SPA and tooling can call the API without a production User-Agent.
 */

import slowDown from 'express-slow-down'
import { banIPForBot, banIPForSuspiciousActivity } from './ipBan.js'
import { isAllowedReferer } from '../utils/allowedFrontends.js'

/**
 * Block suspicious/minimal User-Agents and more than 10 requests per second per IP+UA.
 * Skipped for localhost and development.
 *
 * @param {import('express').Request} req - Uses `req.ip`, hostname, and User-Agent.
 * @param {import('express').Response} res - 429 on rapid fire, 403 on bot UA.
 * @param {import('express').NextFunction} next - Continues when the request looks human.
 * @returns {void}
 */
export const antiBotProtection = (req, res, next) => {
  const userAgent = req.get('User-Agent') || ''
  const ip = req.ip

  // Skip anti-bot protection for localhost/development
  if (
    ip === '::1' ||
    ip === '127.0.0.1' ||
    ip === 'localhost' ||
    process.env.NODE_ENV === 'development' ||
    req.hostname === 'localhost' ||
    req.hostname?.includes('localhost')
  ) {
    return next()
  }

  const suspiciousPatterns = [
    /bot/i,
    /crawler/i,
    /spider/i,
    /scraper/i,
    /headless/i,
    /phantom/i,
    /selenium/i,
    /puppeteer/i,
  ]

  const isSuspiciousUA = suspiciousPatterns.some((pattern) => pattern.test(userAgent))

  const isMinimalUA = userAgent.length < 5

  const now = Date.now()
  if (!global.requestTimestamps) global.requestTimestamps = new Map()

  const key = `${ip}-${userAgent}`
  const timestamps = global.requestTimestamps.get(key) || []
  const recentRequests = timestamps.filter((t) => now - t < 1000) // Last 1 second

  if (recentRequests.length > 10) {
    banIPForSuspiciousActivity(ip, userAgent, 'rapid_requests').catch(console.error)

    return res.status(429).json({
      success: false,
      message: 'Too many requests detected. Please slow down.',
    })
  }

  recentRequests.push(now)
  global.requestTimestamps.set(key, recentRequests.slice(-20)) // Keep last 20

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
})

export const bruteForceProtection = {
  /**
   * Count auth attempts per IP in a 15-minute window; 5th+ attempt is 429.
   * Entirely skipped when `NODE_ENV` is not `production`.
   *
   * @param {import('express').Request} req - Uses `req.ip` as the attempt key.
   * @param {import('express').Response} res - 429 when the production cap is exceeded.
   * @param {import('express').NextFunction} next - Continues when under the cap (or not production).
   * @returns {void}
   */
  prevent: (req, res, next) => {
    const ip = req.ip
    const key = `brute-force-${ip}`

    if (!global.bruteForceStore) {
      global.bruteForceStore = new Map()
    }

    const now = Date.now()
    const attempts = global.bruteForceStore.get(key) || {
      count: 0,
      resetTime: now + 15 * 60 * 1000,
    }

    if (now > attempts.resetTime) {
      attempts.count = 0
      attempts.resetTime = now + 15 * 60 * 1000
    }

    // Skip rate limiting entirely for development/beta
    if (process.env.NODE_ENV !== 'production') {
      return next()
    }

    const maxAttempts = 5

    if (attempts.count >= maxAttempts) {
      return res.status(429).json({
        success: false,
        message: 'Too many authentication attempts. Please try again later.',
      })
    }

    attempts.count++
    global.bruteForceStore.set(key, attempts)

    next()
  },
}

/**
 * Recursively scan body/query/params strings for Mongo operator / eval patterns.
 * On a hit, bans the IP and returns 400 without throwing to Express.
 *
 * @param {import('express').Request} req - Inspects `body`, `query`, and `params`.
 * @param {import('express').Response} res - 400 `{ message: 'Invalid request format detected.' }` on injection.
 * @param {import('express').NextFunction} next - Continues when no pattern matches.
 * @returns {void}
 */
export const databaseProtection = (req, res, next) => {
  const dangerousPatterns = [
    /\$where/i,
    /\$ne/i,
    /\$gt/i,
    /\$lt/i,
    /\$regex/i,
    /\$exists/i,
    /\$in/i,
    /\$nin/i,
    /\$or/i,
    /\$and/i,
    /javascript:/i,
    /this\./i,
    /function/i,
    /eval/i,
  ]

  /**
   * Walk a JSON-like value and throw if a string matches a dangerous pattern.
   *
   * @param {unknown} obj - Current node (string, object, or other).
   * @param {string} [path=''] - Dotted path used in the thrown message.
   * @returns {void}
   */
  const checkForInjection = (obj, path = '') => {
    if (typeof obj === 'string') {
      for (const pattern of dangerousPatterns) {
        if (pattern.test(obj)) {
          throw new Error(`Potential NoSQL injection detected in ${path}`)
        }
      }
    } else if (typeof obj === 'object' && obj !== null) {
      for (const [key, value] of Object.entries(obj)) {
        checkForInjection(value, `${path}.${key}`)
      }
    }
  }

  try {
    if (req.body) checkForInjection(req.body, 'body')
    if (req.query) checkForInjection(req.query, 'query')
    if (req.params) checkForInjection(req.params, 'params')
  } catch {
    banIPForSuspiciousActivity(req.ip, req.get('User-Agent'), 'injection_attempt').catch(
      console.error,
    )

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

  // Skip API protection for localhost origins (development)
  if (
    origin?.includes('localhost') ||
    referer?.includes('localhost') ||
    req.hostname === 'localhost' ||
    req.hostname?.includes('localhost') ||
    req.ip === '::1' ||
    req.ip === '127.0.0.1' ||
    process.env.NODE_ENV === 'development'
  ) {
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

export default {
  antiBotProtection,
  progressiveSlowdown,
  bruteForceProtection,
  databaseProtection,
  apiProtection,
}
