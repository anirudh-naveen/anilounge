import mongoose from 'mongoose'
import crypto from 'crypto'

const refreshTokenSchema = new mongoose.Schema({
  token: {
    type: String,
    required: true,
    unique: true,
  },
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  expiresAt: {
    type: Date,
    required: true,
    default: () => new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
  isRevoked: {
    type: Boolean,
    default: false,
  },
})

// Index for automatic cleanup of expired tokens
refreshTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 })

// Static method to create a new refresh token
refreshTokenSchema.statics.createToken = async function (userId) {
  const token = crypto.randomBytes(64).toString('hex')
  const refreshToken = new this({
    token,
    userId,
  })
  await refreshToken.save()
  return refreshToken
}

// Static method to revoke all tokens for a user
refreshTokenSchema.statics.revokeAllForUser = async function (userId) {
  return this.updateMany({ userId }, { isRevoked: true })
}

export default mongoose.model('RefreshToken', refreshTokenSchema)
