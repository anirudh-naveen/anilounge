/**
 * One-off maintenance script: recompute Content.unifiedScore from stored source ratings.
 * Run after changing calculateUnifiedScore or when TMDB/MAL/user vote fields were backfilled.
 * Mutates only unifiedScore; does not refetch APIs.
 */
import mongoose from 'mongoose'
import dotenv from 'dotenv'
import Content from '../models/Content.js'
import { calculateUnifiedScore } from '../utils/ratings.js'

dotenv.config()

/**
 * Connect using MONGODB_URI.
 * @returns {Promise<void>}
 */
const connectDB = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI)
    console.log('Database connected')
  } catch (error) {
    console.error('Database connection failed:', error.message)
    process.exit(1)
  }
}

/**
 * Persist a new unifiedScore when the vote-weighted value differs from the stored one.
 * @returns {Promise<void>}
 */
const updateWeightedScores = async () => {
  try {
    console.log('Updating weighted scores for existing content...')
    const contentItems = await Content.find({})
    let updatedCount = 0

    for (const item of contentItems) {
      const newUnifiedScore = calculateUnifiedScore(
        item.voteAverage,
        item.voteCount,
        item.malScore,
        item.malScoredBy,
        item.userRatingAverage,
        item.userRatingCount,
      )

      if (item.unifiedScore !== newUnifiedScore) {
        item.unifiedScore = newUnifiedScore
        await item.save()
        updatedCount++
        console.log(
          `Updated ${item.title}: ${newUnifiedScore?.toFixed(2)} (TMDB: ${item.voteAverage}, MAL: ${item.malScore})`,
        )
      }
    }
    console.log(`Updated ${updatedCount} content items with weighted scores`)
  } catch (error) {
    console.error('Error updating weighted scores:', error.message)
  }
}

/**
 * Connect, recompute scores, disconnect.
 * @returns {Promise<void>}
 */
const main = async () => {
  try {
    await connectDB()
    await updateWeightedScores()
  } catch (error) {
    console.error('Script failed:', error.message)
  } finally {
    await mongoose.disconnect()
    console.log('Database disconnected')
  }
}

main()
