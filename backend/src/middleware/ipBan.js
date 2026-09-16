/**
 * IP ban enforcement, duration policy, and admin ban helpers.
 *
 * Layer: middleware. `checkIPBan` runs early in the HTTP chain; other exports
 * are called from auth/anti-bot controllers and the admin router.
 */

import IPBan from '../models/IPBan.js'

// Ban windows by reason (milliseconds)
const BAN_DURATIONS = {
  bot_detection: 24 * 60 * 60 * 1000, // 24 hours
  brute_force: 7 * 24 * 60 * 60 * 1000, // 7 days
  suspicious_activity: 2 * 60 * 60 * 1000, // 2 hours
  rate_limit_exceeded: 60 * 60 * 1000, // 1 hour
  manual: 30 * 24 * 60 * 60 * 1000, // 30 days
}

/**
 * Reject banned client IPs with 403. Skips localhost, RFC1918, and development.
 * On lookup failure the request still continues (fail-open) so DB outages do not lock out users.
 *
 * @param {import('express').Request} req - IP from `req.ip`, socket, or `X-Forwarded-For` / `X-Real-IP`.
 * @param {import('express').Response} res - 403 JSON with `banReason` and `expiresAt` when banned.
 * @param {import('express').NextFunction} next - Continues when not banned or when the check is skipped.
 * @returns {Promise<void>}
 */
export const checkIPBan = async (req, res, next) => {
  try {
    let ip = req.ip || 
             req.connection?.remoteAddress || 
             req.socket?.remoteAddress ||
             (req.headers['x-forwarded-for'] && req.headers['x-forwarded-for'].split(',')[0].trim()) ||
             req.headers['x-real-ip'] ||
             'unknown'

    if (ip.startsWith('::ffff:')) {
      ip = ip.replace('::ffff:', '')
    }

    // Skip IP ban check for localhost/development
    if (
      ip === '::1' ||
      ip === '127.0.0.1' ||
      ip === 'localhost' ||
      ip === 'unknown' ||
      ip.startsWith('127.') ||
      ip.startsWith('192.168.') ||
      ip.startsWith('10.') ||
      req.hostname === 'localhost' ||
      req.hostname?.includes('localhost') ||
      process.env.NODE_ENV === 'development'
    ) {
      return next()
    }

    if (ip && ip !== 'unknown') {
      const ban = await IPBan.isIPBanned(ip)

      if (ban) {
        ban.lastSeen = new Date()
        await ban.save()

        return res.status(403).json({
          success: false,
          message: 'Your IP address has been banned due to suspicious activity.',
          banReason: ban.reason,
          expiresAt: ban.expiresAt,
          attempts: ban.attempts,
        })
      }
    }

    next()
  } catch (error) {
    console.error('Error checking IP ban:', error)
    // In development, allow requests through even if check fails
    if (process.env.NODE_ENV === 'development') {
      return next()
    }
    // Production still fail-opens so a ban-collection outage cannot block legitimate users.
    console.error('IP ban check failed in production:', error.message)
    return next()
  }
}

/**
 * Persist a bot-detection ban using `BAN_DURATIONS[reason]` (default 24h).
 *
 * @param {string} ip - Client address to ban.
 * @param {string} userAgent - Stored on the ban row for later review.
 * @param {string} [reason='bot_detection'] - Key into `BAN_DURATIONS`.
 * @returns {Promise<object>} Saved ban document.
 */
export const banIPForBot = async (ip, userAgent, reason = 'bot_detection') => {
  try {
    const ban = await IPBan.banIP(ip, reason, BAN_DURATIONS[reason], userAgent)

    console.log(`IP ${ip} banned for ${reason}. Expires: ${ban.expiresAt}`)
    return ban
  } catch (error) {
    console.error('Error banning IP for bot:', error)
    throw error
  }
}

/**
 * Persist a 7-day brute-force ban.
 *
 * @param {string} ip - Client address to ban.
 * @param {string} userAgent - Stored on the ban row.
 * @returns {Promise<object>} Saved ban document.
 */
export const banIPForBruteForce = async (ip, userAgent) => {
  try {
    const ban = await IPBan.banIP(ip, 'brute_force', BAN_DURATIONS.brute_force, userAgent)

    console.log(`IP ${ip} banned for brute force. Expires: ${ban.expiresAt}`)
    return ban
  } catch (error) {
    console.error('Error banning IP for brute force:', error)
    throw error
  }
}

/**
 * Persist a 2-hour suspicious-activity ban; `activity` is only logged, not stored as the reason key.
 *
 * @param {string} ip - Client address to ban.
 * @param {string} userAgent - Stored on the ban row.
 * @param {string} activity - Human-readable trigger (e.g. `rapid_requests`).
 * @returns {Promise<object>} Saved ban document.
 */
export const banIPForSuspiciousActivity = async (ip, userAgent, activity) => {
  try {
    const ban = await IPBan.banIP(
      ip,
      'suspicious_activity',
      BAN_DURATIONS.suspicious_activity,
      userAgent,
    )

    console.log(
      `IP ${ip} banned for suspicious activity: ${activity}. Expires: ${ban.expiresAt}`,
    )
    return ban
  } catch (error) {
    console.error('Error banning IP for suspicious activity:', error)
    throw error
  }
}

/**
 * Persist a 1-hour rate-limit ban.
 *
 * @param {string} ip - Client address to ban.
 * @param {string} userAgent - Stored on the ban row.
 * @returns {Promise<object>} Saved ban document.
 */
export const banIPForRateLimit = async (ip, userAgent) => {
  try {
    const ban = await IPBan.banIP(
      ip,
      'rate_limit_exceeded',
      BAN_DURATIONS.rate_limit_exceeded,
      userAgent,
    )

    console.log(`IP ${ip} banned for rate limit exceeded. Expires: ${ban.expiresAt}`)
    return ban
  } catch (error) {
    console.error('Error banning IP for rate limit:', error)
    throw error
  }
}

/**
 * Admin-initiated ban. Default duration is 30 days when `duration` is omitted.
 *
 * @param {string} ip - Client address to ban.
 * @param {string} [reason='manual'] - Reason stored on the row.
 * @param {number} [duration=BAN_DURATIONS.manual] - Ban length in milliseconds.
 * @returns {Promise<object>} Saved ban document.
 */
export const manuallyBanIP = async (ip, reason = 'manual', duration = BAN_DURATIONS.manual) => {
  try {
    const ban = await IPBan.banIP(ip, reason, duration)

    console.log(`IP ${ip} manually banned. Expires: ${ban.expiresAt}`)
    return ban
  } catch (error) {
    console.error('Error manually banning IP:', error)
    throw error
  }
}

/**
 * Clear an IP ban via the IPBan model.
 *
 * @param {string} ip - Address to unban.
 * @returns {Promise<*>} Model `unbanIP` result.
 */
export const unbanIP = async (ip) => {
  try {
    const result = await IPBan.unbanIP(ip)

    console.log(`IP ${ip} unbanned`)
    return result
  } catch (error) {
    console.error('Error unbanning IP:', error)
    throw error
  }
}

/**
 * Aggregate ban counts from the IPBan collection.
 *
 * @returns {Promise<object>} Stats object from `IPBan.getBanStats()`.
 */
export const getBanStats = async () => {
  try {
    const stats = await IPBan.getBanStats()
    return stats
  } catch (error) {
    console.error('Error getting ban stats:', error)
    throw error
  }
}

/**
 * List active bans that have not yet expired, newest first.
 *
 * @returns {Promise<object[]>} Ban documents.
 */
export const getActiveBans = async () => {
  try {
    const bans = await IPBan.find({
      isActive: true,
      expiresAt: { $gt: new Date() },
    }).sort({ bannedAt: -1 })

    return bans
  } catch (error) {
    console.error('Error getting active bans:', error)
    throw error
  }
}

/**
 * Extend an existing active ban (up to 5× base duration) or create a first-offense ban.
 *
 * @param {string} ip - Client address.
 * @param {string} reason - Key into `BAN_DURATIONS`.
 * @param {string} userAgent - Stored on a new ban row.
 * @returns {Promise<object>} Updated or newly created ban document.
 */
export const progressiveBan = async (ip, reason, userAgent) => {
  try {
    const existingBan = await IPBan.findOne({ ip, isActive: true })

    if (existingBan) {
      let multiplier = Math.min(existingBan.attempts, 5) // Max 5x multiplier
      const baseDuration = BAN_DURATIONS[reason]
      const escalatedDuration = baseDuration * multiplier

      existingBan.attempts += 1
      existingBan.expiresAt = new Date(Date.now() + escalatedDuration)
      existingBan.lastSeen = new Date()
      await existingBan.save()

      console.log(
        `🚫 IP ${ip} ban escalated (attempt ${existingBan.attempts}). New duration: ${escalatedDuration}ms`,
      )
      return existingBan
    } else {
      return await IPBan.banIP(ip, reason, BAN_DURATIONS[reason], userAgent)
    }
  } catch (error) {
    console.error('Error in progressive ban:', error)
    throw error
  }
}

export default {
  checkIPBan,
  banIPForBot,
  banIPForBruteForce,
  banIPForSuspiciousActivity,
  banIPForRateLimit,
  manuallyBanIP,
  unbanIP,
  getBanStats,
  getActiveBans,
  progressiveBan,
}
