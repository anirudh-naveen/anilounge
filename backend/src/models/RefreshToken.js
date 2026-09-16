/**
 * Mongoose schema for JWT refresh tokens.
 * Models layer: opaque token strings tied to a User, with revoke flag and TTL expiry.
 */
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
    default: () => new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
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

// MongoDB TTL index: expired tokens are deleted automatically
refreshTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 })

/**
 * Persist a new 64-byte hex refresh token for the user (7-day default expiry).
 * @param {import('mongoose').Types.ObjectId | string} userId
 * @returns {Promise<import('mongoose').Document>}
 */
refreshTokenSchema.statics.createToken = async function (userId) {
  const token = crypto.randomBytes(64).toString('hex')
  const refreshToken = new this({
    token,
    userId,
  })
  await refreshToken.save()
  return refreshToken
}

/**
 * Mark every refresh token for a user as revoked (logout-all).
 * @param {import('mongoose').Types.ObjectId | string} userId
 * @returns {Promise<import('mongoose').UpdateWriteOpResult>}
 */
refreshTokenSchema.statics.revokeAllForUser = async function (userId) {
  return this.updateMany({ userId }, { isRevoked: true })
}

export default mongoose.model('RefreshToken', refreshTokenSchema)
