import IPBan from '../models/IPBan.js'

// IP ban durations (in milliseconds)
const BAN_DURATIONS = {
  bot_detection: 24 * 60 * 60 * 1000, // 24 hours
  brute_force: 7 * 24 * 60 * 60 * 1000, // 7 days
  suspicious_activity: 2 * 60 * 60 * 1000, // 2 hours
  rate_limit_exceeded: 60 * 60 * 1000, // 1 hour
  manual: 30 * 24 * 60 * 60 * 1000, // 30 days
}

// Check if IP is banned
export const checkIPBan = async (req, res, next) => {
  try {
    const ip = req.ip

    // Skip IP ban check for localhost/development
    if (
      ip === '::1' ||
      ip === '127.0.0.1' ||
      ip === 'localhost' ||
      req.hostname === 'localhost' ||
      req.hostname?.includes('localhost') ||
      process.env.NODE_ENV === 'development'
    ) {
      return next()
    }

    const ban = await IPBan.isIPBanned(ip)

    if (ban) {
      // Update last seen
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

    next()
  } catch (error) {
    console.error('Error checking IP ban:', error)
    next() // Continue if there's an error
  }
}

// Ban IP for bot detection
export const banIPForBot = async (ip, userAgent, reason = 'bot_detection') => {
  try {
    const ban = await IPBan.banIP(ip, reason, BAN_DURATIONS[reason], userAgent)

    console.log(`🚫 IP ${ip} banned for ${reason}. Expires: ${ban.expiresAt}`)
    return ban
  } catch (error) {
    console.error('Error banning IP for bot:', error)
    throw error
  }
}

// Ban IP for brute force
export const banIPForBruteForce = async (ip, userAgent) => {
  try {
    const ban = await IPBan.banIP(ip, 'brute_force', BAN_DURATIONS.brute_force, userAgent)

    console.log(`🚫 IP ${ip} banned for brute force. Expires: ${ban.expiresAt}`)
    return ban
  } catch (error) {
    console.error('Error banning IP for brute force:', error)
    throw error
  }
}

// Ban IP for suspicious activity
export const banIPForSuspiciousActivity = async (ip, userAgent, activity) => {
  try {
    const ban = await IPBan.banIP(
      ip,
      'suspicious_activity',
      BAN_DURATIONS.suspicious_activity,
      userAgent,
    )

    console.log(
      `🚫 IP ${ip} banned for suspicious activity: ${activity}. Expires: ${ban.expiresAt}`,
    )
    return ban
  } catch (error) {
    console.error('Error banning IP for suspicious activity:', error)
    throw error
  }
}

// Ban IP for rate limit exceeded
export const banIPForRateLimit = async (ip, userAgent) => {
  try {
    const ban = await IPBan.banIP(
      ip,
      'rate_limit_exceeded',
      BAN_DURATIONS.rate_limit_exceeded,
      userAgent,
    )

    console.log(`🚫 IP ${ip} banned for rate limit exceeded. Expires: ${ban.expiresAt}`)
    return ban
  } catch (error) {
    console.error('Error banning IP for rate limit:', error)
    throw error
  }
}

// Manual IP ban (admin function)
export const manuallyBanIP = async (ip, reason = 'manual', duration = BAN_DURATIONS.manual) => {
  try {
    const ban = await IPBan.banIP(ip, reason, duration)

    console.log(`🚫 IP ${ip} manually banned. Expires: ${ban.expiresAt}`)
    return ban
  } catch (error) {
    console.error('Error manually banning IP:', error)
    throw error
  }
}

// Unban IP (admin function)
export const unbanIP = async (ip) => {
  try {
    const result = await IPBan.unbanIP(ip)

    console.log(`✅ IP ${ip} unbanned`)
    return result
  } catch (error) {
    console.error('Error unbanning IP:', error)
    throw error
  }
}

// Get ban statistics
export const getBanStats = async () => {
  try {
    const stats = await IPBan.getBanStats()
    return stats
  } catch (error) {
    console.error('Error getting ban stats:', error)
    throw error
  }
}

// Get all active bans
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

// Progressive ban system - escalate ban duration based on attempts
export const progressiveBan = async (ip, reason, userAgent) => {
  try {
    const existingBan = await IPBan.findOne({ ip, isActive: true })

    if (existingBan) {
      // Escalate ban duration based on attempts
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
      // First offense - use base duration
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
