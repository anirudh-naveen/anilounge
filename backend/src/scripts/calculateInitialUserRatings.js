import mongoose from 'mongoose'
import dotenv from 'dotenv'
import User from '../models/User.js'
import Content from '../models/Content.js'

dotenv.config()

// Calculate unified score including user ratings (same function as in controller)
function calculateUnifiedScoreWithUserRatings(
  tmdbScore,
  tmdbVotes,
  malScore,
  malVotes,
  userRatingAverage,
  userRatingCount,
) {
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

async function calculateInitialUserRatings() {
  try {
    await mongoose.connect(process.env.MONGODB_URI)
    console.log('Database connected')

    // Get all users with ratings
    const users = await User.find({ 'ratings.0': { $exists: true } })

    console.log(`Processing ${users.length} users with ratings...`)

    // Aggregate ratings by content
    const contentRatings = {}

    for (const user of users) {
      for (const rating of user.ratings) {
        const contentId = rating.content.toString()
        if (!contentRatings[contentId]) {
          contentRatings[contentId] = []
        }
        contentRatings[contentId].push(rating.rating)
      }
    }

    console.log(`Found ratings for ${Object.keys(contentRatings).length} content items`)

    // Update each content with aggregated ratings
    let updated = 0
    for (const [contentId, ratings] of Object.entries(contentRatings)) {
      try {
        const average = ratings.reduce((sum, r) => sum + r, 0) / ratings.length
        const count = ratings.length

        const content = await Content.findById(contentId)
        if (!content) {
          console.log(`Content ${contentId} not found, skipping...`)
          continue
        }

        // Update user rating fields
        content.userRatingAverage = average
        content.userRatingCount = count

        // Recalculate unifiedScore to include user ratings
        content.unifiedScore = calculateUnifiedScoreWithUserRatings(
          content.voteAverage,
          content.voteCount,
          content.malScore,
          content.malScoredBy,
          content.userRatingAverage,
          content.userRatingCount,
        )

        await content.save()
        updated++

        if (updated % 10 === 0) {
          console.log(`Updated ${updated} content items...`)
        }
      } catch (error) {
        console.error(`Error updating content ${contentId}:`, error.message)
      }
    }

    console.log(`\nCompleted! Updated ${updated} content items with user ratings`)
    console.log(
      `Average ratings per content: ${(Object.values(contentRatings).reduce((sum, ratings) => sum + ratings.length, 0) / Object.keys(contentRatings).length).toFixed(2)}`,
    )

    await mongoose.disconnect()
    console.log('Database disconnected')
  } catch (error) {
    console.error('Error:', error)
    process.exit(1)
  }
}

calculateInitialUserRatings()
