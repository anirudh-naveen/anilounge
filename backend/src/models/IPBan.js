import mongoose from 'mongoose'

// IP Ban schema for MongoDB
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

// Index for automatic cleanup of expired bans
ipBanSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 })

// Static method to ban an IP
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
      // Update existing ban
      existingBan.attempts += 1
      existingBan.lastSeen = new Date()
      existingBan.expiresAt = expiresAt
      existingBan.userAgent = userAgent || existingBan.userAgent
      await existingBan.save()
      return existingBan
    } else {
      // Create new ban
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

// Static method to check if IP is banned
ipBanSchema.statics.isIPBanned = async function (ip) {
  const ban = await this.findOne({
    ip,
    isActive: true,
    expiresAt: { $gt: new Date() },
  })

  return ban
}

// Static method to unban an IP
ipBanSchema.statics.unbanIP = async function (ip) {
  return this.updateMany({ ip }, { isActive: false })
}

// Static method to get ban statistics
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
