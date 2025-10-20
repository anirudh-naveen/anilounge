import mongoose from 'mongoose'
import dotenv from 'dotenv'
import Content from '../models/Content.js'
import unifiedContentService from '../services/unifiedContentService.js'

// Load environment variables
dotenv.config()

async function updateRuntimes() {
  try {
    // Connect to database
    await mongoose.connect(process.env.MONGODB_URI)
    console.log('📡 Database connected')

    // Get all MAL content that are movies
    const malMovies = await Content.find({
      malId: { $exists: true },
      contentType: 'movie',
      $or: [
        { runtime: null },
        { runtime: { $lt: 60 } }, // Update movies with runtime less than 60 minutes
      ],
    })

    console.log(`📊 Found ${malMovies.length} MAL movies to update`)

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
          `✅ Updated ${movie.title}: ${movie.runtime || 'null'} → ${estimatedRuntime} minutes`,
        )
        updated++
      }
    }

    console.log(`🎉 Updated ${updated} movies with correct runtime information`)
  } catch (error) {
    console.error('❌ Error updating runtimes:', error)
  } finally {
    await mongoose.disconnect()
    console.log('🔌 Database disconnected')
  }
}

// Run the update
updateRuntimes()
