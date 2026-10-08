/**
 * IP ban enforcement, duration policy, and admin ban helpers.
 *
 * Layer: middleware. `checkIPBan` runs early in the HTTP chain; the ban helpers are
 * called from the anti-bot middleware, the auth controller, and the admin router.
 */

import IPBan from '../models/IPBan.js'

// Ban windows by reason (milliseconds)
const BAN_DURATIONS = {
  bot_detection: 24 * 60 * 60 * 1000, // 24 hours
  brute_force: 7 * 24 * 60 * 60 * 1000, // 7 days
  suspicious_activity: 2 * 60 * 60 * 1000, // 2 hours
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

    // The emailed unlock code proves account ownership, so a locked-out user can
    // always reach the unlock endpoint even from the IP their failed attempts banned.
    if (req.method === 'POST' && req.originalUrl.split('?')[0] === '/api/auth/unlock') {
      return next()
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
 * Store a ban and log it; failures are logged and rethrown.
 *
 * @param {string} ip - Client address to ban.
 * @param {string} reason - Stored on the ban row.
 * @param {number} duration - Ban length in milliseconds.
 * @param {string | null} userAgent - Stored on the ban row for later review.
 * @param {string} [note=reason] - What triggered the ban, for the log line.
 * @returns {Promise<object>} Saved ban row.
 */
async function recordBan(ip, reason, duration, userAgent, note = reason) {
  try {
    const ban = await IPBan.banIP(ip, reason, duration, userAgent)
    console.log(`IP ${ip} banned for ${note}. Expires: ${ban.expiresAt}`)
    return ban
  } catch (error) {
    console.error(`Error banning IP for ${note}:`, error)
    throw error
  }
}

/**
 * Bot-detection ban, `BAN_DURATIONS[reason]` long.
 * @param {string} ip
 * @param {string} userAgent
 * @param {string} [reason='bot_detection'] - Key into `BAN_DURATIONS`.
 * @returns {Promise<object>}
 */
export const banIPForBot = (ip, userAgent, reason = 'bot_detection') =>
  recordBan(ip, reason, BAN_DURATIONS[reason], userAgent)

/**
 * 7-day brute-force ban.
 * @param {string} ip
 * @param {string} userAgent
 * @returns {Promise<object>}
 */
export const banIPForBruteForce = (ip, userAgent) =>
  recordBan(ip, 'brute_force', BAN_DURATIONS.brute_force, userAgent, 'brute force')

/**
 * 2-hour suspicious-activity ban; `activity` is only logged, not stored as the reason.
 * @param {string} ip
 * @param {string} userAgent
 * @param {string} activity - Human-readable trigger (e.g. `rapid_requests`).
 * @returns {Promise<object>}
 */
export const banIPForSuspiciousActivity = (ip, userAgent, activity) =>
  recordBan(
    ip,
    'suspicious_activity',
    BAN_DURATIONS.suspicious_activity,
    userAgent,
    `suspicious activity: ${activity}`,
  )

/**
 * Admin-initiated ban, 30 days unless `duration` is given.
 * @param {string} ip
 * @param {string} [reason='manual'] - Reason stored on the row.
 * @param {number} [duration=BAN_DURATIONS.manual] - Ban length in milliseconds.
 * @returns {Promise<object>}
 */
export const manuallyBanIP = (ip, reason = 'manual', duration = BAN_DURATIONS.manual) =>
  recordBan(ip, reason, duration, null, `${reason} (manual)`)

/**
 * Clear an IP ban.
 * @param {string} ip
 * @returns {Promise<{ modifiedCount: number }>}
 */
export const unbanIP = async (ip) => {
  const result = await IPBan.unbanIP(ip)
  console.log(`IP ${ip} unbanned`)
  return result
}

/**
 * Lift an active brute-force ban for `ip` (used after an emailed account unlock).
 * Bans for other reasons are left in place.
 *
 * @param {string} ip - Client address as seen on the request.
 * @returns {Promise<boolean>} True when a ban was lifted.
 */
export const liftBruteForceBan = async (ip) => {
  const raw = String(ip || '')
  if (!raw) return false
  // Bans are written with the raw `req.ip` but checked normalized; clear both forms.
  let lifted = false
  for (const address of new Set([raw, raw.replace(/^::ffff:/, '')])) {
    const ban = await IPBan.isIPBanned(address)
    if (ban?.reason !== 'brute_force') continue
    await IPBan.unbanIP(address)
    lifted = true
  }
  return lifted
}

/**
 * Active-ban counts and attempts per reason.
 * @returns {Promise<object[]>}
 */
export const getBanStats = () => IPBan.getBanStats()

/**
 * Active bans that have not expired, newest first.
 * @returns {Promise<object[]>}
 */
export const getActiveBans = () => IPBan.find({ isActive: true, expiresAt: { $gt: new Date() } })
