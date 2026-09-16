/**
 * One-off maintenance script: fill MAL movie runtimes from the known-title estimator.
 * Run when MAL-only movies show null or sub-60-minute runtimes. Mutates Content.runtime
 * using unifiedContentService.getEstimatedRuntime (does not call TMDB).
 */
import mongoose from 'mongoose'
import dotenv from 'dotenv'
import Content from '../models/Content.js'
import unifiedContentService from '../services/unifiedContentService.js'

dotenv.config()

/**
 * Rewrite runtime on MAL movies missing a duration or under 60 minutes.
 * @returns {Promise<void>}
 */
async function updateRuntimes() {
  try {
    await mongoose.connect(process.env.MONGODB_URI)
    console.log('Database connected')

    const malMovies = await Content.find({
      malId: { $exists: true },
      contentType: 'movie',
      $or: [
        { runtime: null },
        { runtime: { $lt: 60 } },
      ],
    })

    console.log(`Found ${malMovies.length} MAL movies to update`)

    let updated = 0

    for (const movie of malMovies) {
      const estimatedRuntime = unifiedContentService.getEstimatedRuntime(
        movie.title,
        movie.malEpisodes || 1,
      )

      if (estimatedRuntime && estimatedRuntime !== movie.runtime) {
        await Content.findByIdAndUpdate(movie._id, {
          runtime: estimatedRuntime,
        })
        console.log(
          `Updated ${movie.title}: ${movie.runtime || 'null'} → ${estimatedRuntime} minutes`,
        )
        updated++
      }
    }

    console.log(`Updated ${updated} movies with correct runtime information`)
  } catch (error) {
    console.error('Error updating runtimes:', error)
  } finally {
    await mongoose.disconnect()
    console.log('Database disconnected')
  }
}

updateRuntimes()
