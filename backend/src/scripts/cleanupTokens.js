import RefreshToken from '../models/RefreshToken.js'
import dotenv from 'dotenv'
import connectDB from '../../config/database.js'

dotenv.config()

// Cleanup expired and old revoked refresh tokens
const cleanupTokens = async () => {
  try {
    await connectDB()

    const result = await RefreshToken.deleteMany({
      $or: [
        { expiresAt: { $lt: new Date() } },
        {
          isRevoked: true,
          createdAt: { $lt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) }, // 30 days old
        },
      ],
    })

    console.log(`✅ Cleaned up ${result.deletedCount} expired/revoked tokens`)
    process.exit(0)
  } catch (error) {
    console.error('❌ Error cleaning up tokens:', error)
    process.exit(1)
  }
}

// Run cleanup
cleanupTokens()

