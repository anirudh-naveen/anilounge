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

// Calculate weighted unified score based on user votes
const calculateWeightedScore = (tmdbScore, tmdbVotes, malScore, malVotes) => {
  if (!tmdbScore && !malScore) return null
  if (!tmdbScore) return malScore
  if (!malScore) return tmdbScore

  // Ensure we have valid numbers
  const tmdb = Number(tmdbScore) || 0
  const mal = Number(malScore) || 0
  const tmdbVotesNum = Number(tmdbVotes) || 0
  const malVotesNum = Number(malVotes) || 0

  if (tmdb === 0 && mal === 0) return null

  // Weight scores by the number of votes (logarithmic scaling to prevent extreme weighting)
  const tmdbWeight = Math.log10(Math.max(tmdbVotesNum, 1))
  const malWeight = Math.log10(Math.max(malVotesNum, 1))
  const totalWeight = tmdbWeight + malWeight

  if (totalWeight === 0) return (tmdb + mal) / 2

  const weightedScore = (tmdb * tmdbWeight + mal * malWeight) / totalWeight

  // Ensure we return a valid number
  return isNaN(weightedScore) ? null : weightedScore
}

const updateWeightedScores = async () => {
  try {
    console.log('Updating weighted scores for existing content...')
    const contentItems = await Content.find({})
    let updatedCount = 0

    for (const item of contentItems) {
      const newUnifiedScore = calculateWeightedScore(
        item.voteAverage,
        item.voteCount,
        item.malScore,
        item.malScoredBy,
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
