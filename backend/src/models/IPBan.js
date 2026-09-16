/**
 * Mongoose schema for temporary IP bans used by auth/rate-limit middleware.
 * Models layer: ban reason, attempt counts, and TTL expiry via MongoDB expireAfterSeconds.
 */
import mongoose from 'mongoose'

const ipBanSchema = new mongoose.Schema({
  ip: {
    type: String,
    required: true,
    unique: true,
    index: true,
  },
  reason: {
    type: String,
    required: true,
    enum: ['bot_detection', 'brute_force', 'suspicious_activity', 'rate_limit_exceeded', 'manual'],
  },
  bannedAt: {
    type: Date,
    default: Date.now,
  },
  expiresAt: {
    type: Date,
    required: true,
  },
  attempts: {
    type: Number,
    default: 1,
  },
  userAgent: {
    type: String,
  },
  lastSeen: {
    type: Date,
    default: Date.now,
  },
  isActive: {
    type: Boolean,
    default: true,
  },
})

// MongoDB TTL index: documents drop when expiresAt is in the past
ipBanSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 })

/**
 * Create or extend an active ban for an IP.
 * Repeat hits increment attempts and refresh expiry rather than inserting a second row.
 * @param {string} ip
 * @param {string} reason - One of the schema enum values
 * @param {number} [duration=86400000] - Ban length in milliseconds (default 24h)
 * @param {string | null} [userAgent=null]
 * @returns {Promise<import('mongoose').Document>}
 */
ipBanSchema.statics.banIP = async function (
  ip,
  reason,
  duration = 24 * 60 * 60 * 1000,
  userAgent = null,
) {
  const expiresAt = new Date(Date.now() + duration)

  try {
    const existingBan = await this.findOne({ ip, isActive: true })

    if (existingBan) {
      existingBan.attempts += 1
      existingBan.lastSeen = new Date()
      existingBan.expiresAt = expiresAt
      existingBan.userAgent = userAgent || existingBan.userAgent
      await existingBan.save()
      return existingBan
    } else {
      const ban = new this({
        ip,
        reason,
        expiresAt,
        userAgent,
      })
      await ban.save()
      return ban
    }
  } catch (error) {
    console.error('Error banning IP:', error)
    throw error
  }
}

/**
 * Active, unexpired ban document for this IP, or null.
 * @param {string} ip
 * @returns {Promise<import('mongoose').Document | null>}
 */
ipBanSchema.statics.isIPBanned = async function (ip) {
  const ban = await this.findOne({
    ip,
    isActive: true,
    expiresAt: { $gt: new Date() },
  })

  return ban
}

/**
 * Soft-unban by clearing isActive (TTL still removes expired rows).
 * @param {string} ip
 * @returns {Promise<import('mongoose').UpdateWriteOpResult>}
 */
ipBanSchema.statics.unbanIP = async function (ip) {
  return this.updateMany({ ip }, { isActive: false })
}

/**
 * Counts of currently active bans grouped by reason.
 * @returns {Promise<Array<{ _id: string, count: number, totalAttempts: number }>>}
 */
ipBanSchema.statics.getBanStats = async function () {
  const stats = await this.aggregate([
    {
      $match: { isActive: true, expiresAt: { $gt: new Date() } },
    },
    {
      $group: {
        _id: '$reason',
        count: { $sum: 1 },
        totalAttempts: { $sum: '$attempts' },
      },
    },
  ])

  return stats
}

export default mongoose.model('IPBan', ipBanSchema)
