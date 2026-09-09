import mongoose from 'mongoose'
import dotenv from 'dotenv'
import User from '../models/User.js'
import Content from '../models/Content.js'
import { calculateUnifiedScore, isValidUserRating } from '../utils/ratings.js'

dotenv.config()

function getEffectiveUserRating(user, contentId) {
  const watchlistItem = user.watchlist?.find((item) => item.content?.toString() === contentId)
  if (watchlistItem) {
    return isValidUserRating(watchlistItem.rating) ? watchlistItem.rating : null
  }

  const legacyRating = user.ratings?.find((item) => item.content?.toString() === contentId)
  return isValidUserRating(legacyRating?.rating) ? legacyRating.rating : null
}

async function calculateInitialUserRatings() {
  try {
    await mongoose.connect(process.env.MONGODB_URI)
    console.log('Database connected')

    const users = await User.find({
      $or: [{ 'watchlist.rating': { $exists: true } }, { 'ratings.0': { $exists: true } }],
    })

    console.log(`Processing ${users.length} users with ratings...`)

    const contentRatings = {}

    for (const user of users) {
      const seen = new Set()

      for (const item of user.watchlist || []) {
        const contentId = item.content?.toString()
        if (!contentId || !isValidUserRating(item.rating)) continue
        seen.add(contentId)
        if (!contentRatings[contentId]) contentRatings[contentId] = []
        contentRatings[contentId].push(item.rating)
      }

      for (const rating of user.ratings || []) {
        const contentId = rating.content?.toString()
        if (!contentId || seen.has(contentId) || !isValidUserRating(rating.rating)) continue
        if (!contentRatings[contentId]) contentRatings[contentId] = []
        contentRatings[contentId].push(rating.rating)
      }
    }

    console.log(`Found ratings for ${Object.keys(contentRatings).length} content items`)

    await Content.updateMany({}, { $set: { userRatingAverage: null, userRatingCount: 0, userRatingSum: 0 } })

    let updated = 0
    for (const [contentId, ratings] of Object.entries(contentRatings)) {
      try {
        const sum = ratings.reduce((total, value) => total + value, 0)
        const count = ratings.length
        const average = sum / count

        const content = await Content.findById(contentId)
        if (!content) {
          console.log(`Content ${contentId} not found, skipping...`)
          continue
        }

        content.userRatingAverage = average
        content.userRatingCount = count
        content.userRatingSum = sum
        content.unifiedScore = calculateUnifiedScore(
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
    if (Object.keys(contentRatings).length > 0) {
      const totalRatings = Object.values(contentRatings).reduce(
        (sum, ratings) => sum + ratings.length,
        0,
      )
      console.log(
        `Average ratings per content: ${(totalRatings / Object.keys(contentRatings).length).toFixed(2)}`,
      )
    }

    await mongoose.disconnect()
    console.log('Database disconnected')
  } catch (error) {
    console.error('Error:', error)
    process.exit(1)
  }
}

calculateInitialUserRatings()
