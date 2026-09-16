/**
 * One-off maintenance script: delete expired refresh tokens and revoked tokens older than 30 days.
 * Run periodically (or after a token-store leak) to keep the RefreshToken collection small.
 * Mutates RefreshToken by deleting matching documents. Complements the TTL index on expiresAt.
 */
import RefreshToken from '../models/RefreshToken.js'
import dotenv from 'dotenv'
import connectDB from '../../config/database.js'

dotenv.config()

/**
 * Delete expired tokens and revoked tokens created more than 30 days ago.
 * @returns {Promise<void>}
 */
const cleanupTokens = async () => {
  try {
    await connectDB()

    const result = await RefreshToken.deleteMany({
      $or: [
        { expiresAt: { $lt: new Date() } },
        {
          isRevoked: true,
          createdAt: { $lt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) },
        },
      ],
    })

    console.log(`Cleaned up ${result.deletedCount} expired/revoked tokens`)
    process.exit(0)
  } catch (error) {
    console.error('Error cleaning up tokens:', error)
    process.exit(1)
  }
}

cleanupTokens()
