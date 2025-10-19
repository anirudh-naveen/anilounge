import mongoose from 'mongoose'
import dotenv from 'dotenv'
import Content from '../models/Content.js'
import unifiedContentService from '../services/unifiedContentService.js'

dotenv.config()

class DatabasePopulator {
  constructor() {
    this.stats = {
      totalProcessed: 0,
      newAdded: 0,
      updated: 0,
      errors: 0,
      skipped: 0
    }
    this.batchSize = 10
    this.delayBetweenBatches = 1000
  }

  async connectDB() {
    try {
      await mongoose.connect(process.env.MONGODB_URI)
      console.log('📡 Database connected')
    } catch (error) {
      console.error('❌ Database connection error:', error)
      throw error
    }
  }

  async disconnectDB() {
    try {
      await mongoose.disconnect()
      console.log('🔌 Database disconnected')
    } catch (error) {
      console.error('❌ Database disconnection error:', error)
    }
  }

  async delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms))
  }

  async populateDatabase(options = {}) {
    const {
      tmdbLimit = 50,
      malLimit = 50,
      skipTmdb = false,
      skipMal = false
    } = options

    console.log('🚀 Starting unified database population...')
    console.log(`📊 Target: ${tmdbLimit} TMDB items, ${malLimit} MAL items`)

    try {
      await this.connectDB()

      // Clear existing content
      await Content.deleteMany({})
      console.log('🗑️ Cleared existing content')

      // Populate TMDB content
      if (!skipTmdb) {
        await this.populateTmdbContent(tmdbLimit)
      }

      // Populate MAL content
      if (!skipMal) {
        await this.populateMalContent(malLimit)
      }

      // Get final statistics
      await this.printFinalStats()

      console.log('🎉 Database population completed successfully!')

    } catch (error) {
      console.error('❌ Database population failed:', error)
      throw error
    } finally {
      await this.disconnectDB()
    }
  }

  async populateTmdbContent(limit) {
    console.log('🎬 Populating TMDB animated content...')

    let processed = 0
    const pages = Math.ceil(limit / 20) // TMDB returns 20 per page

    for (let page = 1; page <= pages && processed < limit; page++) {
      try {
        console.log(`📄 Processing TMDB page ${page}/${pages}`)

        // Get movies
        const movies = await unifiedContentService.getTmdbAnimatedMovies(page, 10)
        for (const movie of movies) {
          if (processed >= limit) break
          await this.saveTmdbContent(movie, 'movie')
          processed++
        }

        // Get TV shows
        const tvShows = await unifiedContentService.getTmdbAnimatedTVShows(page, 10)
        for (const tvShow of tvShows) {
          if (processed >= limit) break
          await this.saveTmdbContent(tvShow, 'tv')
          processed++
        }

        await this.delay(500) // Rate limiting

      } catch (error) {
        console.error(`❌ Error processing TMDB page ${page}:`, error.message)
        this.stats.errors++
      }
    }

    console.log(`✅ TMDB population completed: ${processed} items processed`)
  }

  async populateMalContent(limit) {
    console.log('🎌 Populating MAL content (movies + TV shows)...')

    let processed = 0
    const movieLimit = Math.floor(limit / 2) // Half for movies
    const tvLimit = limit - movieLimit // Half for TV shows

    // Fetch MAL movies
    console.log(`🎬 Fetching ${movieLimit} MAL movies...`)
    const batches = Math.ceil(movieLimit / this.batchSize)
    for (let batch = 0; batch < batches && processed < movieLimit; batch++) {
      try {
        const offset = batch * this.batchSize
        const batchLimit = Math.min(this.batchSize, movieLimit - processed)

        console.log(`📦 Processing MAL movies batch ${batch + 1}/${batches} (${batchLimit} items)`)

        const movies = await unifiedContentService.getMalTopAnimeMovies(batchLimit, offset)

        for (const movie of movies) {
          if (processed >= movieLimit) break
          await this.saveMalContent(movie)
          processed++
        }

        await this.delay(this.delayBetweenBatches)

      } catch (error) {
        console.error(`❌ Error processing MAL movies batch ${batch + 1}:`, error.message)
        this.stats.errors++
      }
    }

    // Fetch MAL TV shows
    console.log(`📺 Fetching ${tvLimit} MAL TV shows...`)
    const tvBatches = Math.ceil(tvLimit / this.batchSize)
    for (let batch = 0; batch < tvBatches && processed < limit; batch++) {
      try {
        const offset = batch * this.batchSize
        const batchLimit = Math.min(this.batchSize, tvLimit - (processed - movieLimit))

        console.log(`📦 Processing MAL TV batch ${batch + 1}/${tvBatches} (${batchLimit} items)`)

        const tvShows = await unifiedContentService.getMalTopAnime(batchLimit, offset)

        for (const tvShow of tvShows) {
          if (processed >= limit) break
          await this.saveMalContent(tvShow)
          processed++
        }

        await this.delay(this.delayBetweenBatches)

      } catch (error) {
        console.error(`❌ Error processing MAL TV batch ${batch + 1}:`, error.message)
        this.stats.errors++
      }
    }

    console.log(`✅ MAL population completed: ${processed} items processed`)
  }

  async saveTmdbContent(tmdbData, contentType) {
    try {
      this.stats.totalProcessed++

      const contentData = unifiedContentService.convertTmdbToContent(tmdbData, contentType)

      // Check if content already exists
      const existingContent = await Content.findOne({ tmdbId: tmdbData.id })

      if (existingContent) {
        // Update existing content
        Object.assign(existingContent, contentData)
        existingContent.lastUpdated = new Date()
        await existingContent.save()
        this.stats.updated++
        console.log(`🔄 Updated TMDB ${contentType}: ${contentData.title}`)
      } else {
        // Create new content
        const newContent = new Content(contentData)
        await newContent.save()
        this.stats.newAdded++
        console.log(`➕ Added TMDB ${contentType}: ${contentData.title}`)
      }

    } catch (error) {
      console.error(`❌ Error saving TMDB content:`, error.message)
      this.stats.errors++
    }
  }

  async saveMalContent(malData) {
    try {
      this.stats.totalProcessed++

      const contentData = unifiedContentService.convertMalToContent(malData)

      // Check if content already exists
      const existingContent = await Content.findOne({ malId: malData.id })

      if (existingContent) {
        // Update existing content
        Object.assign(existingContent, contentData)
        existingContent.lastUpdated = new Date()
        await existingContent.save()
        this.stats.updated++
        console.log(`🔄 Updated MAL ${contentType}: ${contentData.title}`)
      } else {
        // Create new content
        const newContent = new Content(contentData)
        await newContent.save()
        this.stats.newAdded++
        console.log(`➕ Added MAL ${contentType}: ${contentData.title}`)
      }

    } catch (error) {
      console.error(`❌ Error saving MAL content:`, error.message)
      this.stats.errors++
    }
  }

  async printFinalStats() {
    console.log('\n📊 Population Statistics:')
    console.log(`   Total processed: ${this.stats.totalProcessed}`)
    console.log(`   New content added: ${this.stats.newAdded}`)
    console.log(`   Content updated: ${this.stats.updated}`)
    console.log(`   Errors: ${this.stats.errors}`)
    console.log(`   Skipped: ${this.stats.skipped}`)

    // Database statistics
    const totalContent = await Content.countDocuments()
    const tmdbOnlyContent = await Content.countDocuments({
      tmdbId: { $exists: true },
      malId: { $exists: false }
    })
    const malOnlyContent = await Content.countDocuments({
      malId: { $exists: true },
      tmdbId: { $exists: false }
    })
    const mergedContent = await Content.countDocuments({
      tmdbId: { $exists: true },
      malId: { $exists: true }
    })

    console.log('\n📈 Database Statistics:')
    console.log(`   Total content: ${totalContent}`)
    console.log(`   TMDB-only content: ${tmdbOnlyContent}`)
    console.log(`   MAL-only content: ${malOnlyContent}`)
    console.log(`   Merged content: ${mergedContent}`)

    // Content type breakdown
    const movies = await Content.countDocuments({ contentType: 'movie' })
    const tvShows = await Content.countDocuments({ contentType: 'tv' })

    console.log('\n🎭 Content Type Breakdown:')
    console.log(`   Movies: ${movies}`)
    console.log(`   TV Shows: ${tvShows}`)
  }
}

// Main execution
const runPopulation = async () => {
  const populator = new DatabasePopulator()

  try {
    await populator.populateDatabase({
      tmdbLimit: 500,
      malLimit: 500
    })
  } catch (error) {
    console.error('❌ Population failed:', error)
    process.exit(1)
  } finally {
    process.exit(0)
  }
}

// Handle graceful shutdown
process.on('SIGINT', async () => {
  console.log('\n🛑 Received SIGINT, shutting down gracefully...')
  process.exit(0)
})

process.on('SIGTERM', async () => {
  console.log('\n🛑 Received SIGTERM, shutting down gracefully...')
  process.exit(0)
})

// Run the population
runPopulation()
