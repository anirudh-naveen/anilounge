import mongoose from 'mongoose'
import dotenv from 'dotenv'
import Content from '../models/Content.js'

dotenv.config()

const connectDB = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI)
    console.log('Database connected')
  } catch (error) {
    console.error('Database connection failed:', error.message)
    process.exit(1)
  }
}

// Calculate unified score including user ratings
const calculateUnifiedScoreWithUserRatings = (
  tmdbScore,
  tmdbVotes,
  malScore,
  malVotes,
  userRatingAverage,
  userRatingCount,
) => {
  const scores = []
  const weights = []

  // Determine if we have multiple sources (for threshold flexibility)
  const hasMultipleSources =
    (tmdbScore && malScore) || (tmdbScore && userRatingAverage) || (malScore && userRatingAverage)

  // Add TMDB score if available
  // For single-source: use any votes. For multi-source: require > 10 votes for quality
  if (tmdbScore && tmdbVotes && (hasMultipleSources ? tmdbVotes > 10 : tmdbVotes > 0)) {
    scores.push(tmdbScore)
    weights.push(Math.log10(Math.max(tmdbVotes, 1)))
  }

  // Add MAL score if available
  // For single-source: use any votes. For multi-source: require > 100 votes for quality
  if (malScore && malVotes && (hasMultipleSources ? malVotes > 100 : malVotes > 0)) {
    scores.push(malScore)
    weights.push(Math.log10(Math.max(malVotes, 1)))
  }

  // Add user rating if available (require at least 5 user ratings)
  if (userRatingAverage && userRatingCount >= 5) {
    scores.push(userRatingAverage)
    // Give user ratings moderate weight (less than external sources initially)
    weights.push(Math.log10(Math.max(userRatingCount, 1)) * 0.8)
  }

  if (scores.length === 0) return null

  // Calculate weighted average
  const totalWeight = weights.reduce((sum, w) => sum + w, 0)
  if (totalWeight === 0) return scores.reduce((sum, s) => sum + s, 0) / scores.length

  const weightedSum = scores.reduce((sum, score, i) => sum + score * weights[i], 0)
  return weightedSum / totalWeight
}

const updateWeightedScores = async () => {
  try {
    console.log('Updating weighted scores for existing content...')
    const contentItems = await Content.find({})
    let updatedCount = 0

    for (const item of contentItems) {
      const newUnifiedScore = calculateUnifiedScoreWithUserRatings(
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
