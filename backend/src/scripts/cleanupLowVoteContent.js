/**
 * Destructive maintenance script: delete TMDB-only Content with a low or missing voteCount.
 * MAL-backed titles, user-rated titles, and watchlisted titles are kept — MAL-only rows have
 * no TMDB voteCount and used to be deleted by the old voteCount-only filter.
 * Mutates Content by deleting matching documents. Prefer a dry review of the printed list first.
 */
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import mongoose from 'mongoose'
import dotenv from 'dotenv'
import Content from '../models/Content.js'
import User from '../models/User.js'

dotenv.config()

export const LOW_VOTE_THRESHOLD = 100

/**
 * Mongo filter for TMDB-only, unrated, low-vote catalog rows.
 * @param {{ excludeIds?: unknown[] }} [options]
 * @returns {object}
 */
export function lowVoteCleanupFilter({ excludeIds = [] } = {}) {
  const filter = {
    $and: [
      { $or: [{ malId: { $exists: false } }, { malId: null }] },
      {
        $or: [
          { voteCount: { $lt: LOW_VOTE_THRESHOLD } },
          { voteCount: { $exists: false } },
          { voteCount: null },
        ],
      },
      {
        $or: [
          { userRatingCount: { $exists: false } },
          { userRatingCount: null },
          { userRatingCount: 0 },
        ],
      },
    ],
  }

  if (excludeIds.length > 0) {
    filter.$and.push({ _id: { $nin: excludeIds } })
  }

  return filter
}

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
 * Print then delete TMDB-only low-vote rows that nobody has rated or watchlisted.
 * @returns {Promise<void>}
 */
const cleanupLowVoteContent = async () => {
  await connectDB()
  console.log('Cleaning up low-vote TMDB-only content...')

  try {
    const watchlistedIds = await User.distinct('watchlist.content')
    const ratedIds = await User.distinct('ratings.content')
    const excludeIds = [...new Set([...watchlistedIds, ...ratedIds].filter(Boolean))]
    const query = lowVoteCleanupFilter({ excludeIds })

    const lowVoteContent = await Content.find(query).select(
      'title voteCount voteAverage contentType malId',
    )

    console.log(`Found ${lowVoteContent.length} TMDB-only items with low vote counts:`)
    lowVoteContent.forEach((item) => {
      console.log(
        `- ${item.title} (${item.contentType}): ${item.voteCount || 0} votes, ${item.voteAverage || 'N/A'} rating`,
      )
    })

    if (lowVoteContent.length > 0) {
      const result = await Content.deleteMany(query)

      console.log(`\nDeleted ${result.deletedCount} low-vote content items`)

      const remainingCounts = await Content.aggregate([
        {
          $group: {
            _id: '$contentType',
            count: { $sum: 1 },
          },
        },
      ])

      console.log('\nRemaining content by type:')
      remainingCounts.forEach((item) => {
        console.log(`- ${item._id}: ${item.count} items`)
      })
    } else {
      console.log('No low-vote content found to clean up')
    }
  } catch (error) {
    console.error('Error cleaning up content:', error)
  } finally {
    await mongoose.disconnect()
    console.log('Database disconnected')
  }
}

const isDirectRun =
  process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
if (isDirectRun) {
  cleanupLowVoteContent()
}
