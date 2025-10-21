import slowDown from 'express-slow-down'
import { banIPForBot, banIPForSuspiciousActivity } from './ipBan.js'

// Anti-bot protection middleware
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

  // Detect suspicious user agents (more lenient for production)
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

  // Detect missing or minimal user agent (more lenient)
  const isMinimalUA = userAgent.length < 5

  // Detect rapid requests (more than 10 per second)
  const now = Date.now()
  if (!global.requestTimestamps) global.requestTimestamps = new Map()

  const key = `${ip}-${userAgent}`
  const timestamps = global.requestTimestamps.get(key) || []
  const recentRequests = timestamps.filter((t) => now - t < 1000) // Last 1 second

  if (recentRequests.length > 10) {
    // Ban IP for rapid requests
    banIPForSuspiciousActivity(ip, userAgent, 'rapid_requests').catch(console.error)

    return res.status(429).json({
      success: false,
      message: 'Too many requests detected. Please slow down.',
    })
  }

  // Update timestamps
  recentRequests.push(now)
  global.requestTimestamps.set(key, recentRequests.slice(-20)) // Keep last 20

  // Block suspicious requests
  if (isSuspiciousUA || isMinimalUA) {
    // Ban the IP for bot detection
    banIPForBot(ip, userAgent, 'bot_detection').catch(console.error)

    return res.status(403).json({
      success: false,
      message: 'Access denied. Automated requests not allowed.',
    })
  }

  next()
}

// Progressive slowdown for repeated requests
export const progressiveSlowdown = slowDown({
  windowMs: 15 * 60 * 1000, // 15 minutes
  delayAfter: 50, // Allow 50 requests per windowMs
  delayMs: () => 500, // Fixed delay function
  maxDelayMs: 20000, // Maximum delay of 20 seconds
  skipSuccessfulRequests: true,
  skipFailedRequests: false,
})

// Brute force protection for auth endpoints (simplified)
export const bruteForceProtection = {
  prevent: (req, res, next) => {
    // Simple brute force protection using our IP ban system
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

// Database query protection
export const databaseProtection = (req, res, next) => {
  // Prevent NoSQL injection attempts
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
    // Ban IP for injection attempts
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

// API endpoint protection
export const apiProtection = (req, res, next) => {
  // Skip API protection for localhost/development
  if (
    req.hostname === 'localhost' ||
    req.hostname?.includes('localhost') ||
    req.ip === '::1' ||
    req.ip === '127.0.0.1' ||
    process.env.NODE_ENV === 'development'
  ) {
    return next()
  }

  // Require proper headers for API requests
  const requiredHeaders = ['user-agent', 'accept']
  const missingHeaders = requiredHeaders.filter((header) => !req.get(header))

  if (missingHeaders.length > 0) {
    return res.status(400).json({
      success: false,
      message: 'Missing required headers.',
    })
  }

  // Block requests with suspicious referers (only in production)
  const referer = req.get('referer') || req.get('referrer')
  if (
    referer &&
    process.env.NODE_ENV === 'production' &&
    !referer.startsWith(process.env.FRONTEND_URL || 'http://localhost:5174') &&
    !referer.includes('vercel.app') &&
    !referer.includes('netlify.app')
  ) {
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
