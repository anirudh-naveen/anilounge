/**
 * Destructive maintenance script: delete Content with TMDB voteCount under 100 or missing.
 * Run to shrink a noisy catalog; this does not consider MAL scored-by counts.
 * Mutates Content by deleting matching documents. Prefer a dry review of the printed list first.
 */
import mongoose from 'mongoose'
import dotenv from 'dotenv'
import Content from '../models/Content.js'

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
 * Print then delete rows with voteCount < 100 or unset, and log remaining counts by contentType.
 * @returns {Promise<void>}
 */
const cleanupLowVoteContent = async () => {
  await connectDB()
  console.log('Cleaning up low-vote content...')

  try {
    const lowVoteContent = await Content.find({
      $or: [{ voteCount: { $lt: 100 } }, { voteCount: { $exists: false } }],
    }).select('title voteCount voteAverage contentType')

    console.log(`Found ${lowVoteContent.length} items with low vote counts:`)
    lowVoteContent.forEach((item) => {
      console.log(
        `- ${item.title} (${item.contentType}): ${item.voteCount || 0} votes, ${item.voteAverage || 'N/A'} rating`,
      )
    })

    if (lowVoteContent.length > 0) {
      const result = await Content.deleteMany({
        $or: [{ voteCount: { $lt: 100 } }, { voteCount: { $exists: false } }],
      })

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

cleanupLowVoteContent()
