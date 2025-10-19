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
      merged: 0,
      errors: 0,
      skipped: 0,
    }
    this.batchSize = 10
    this.delayBetweenBatches = 1000
  }

  async delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms))
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

  // Calculate weighted unified score based on user votes
  calculateWeightedScore(tmdbScore, tmdbVotes, malScore, malVotes) {
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

  async populateDatabase(options = {}) {
    const { tmdbLimit = 50, malLimit = 50, skipTmdb = false, skipMal = false } = options

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

        // Update unified score using weighted calculation
        if (contentData.voteAverage && existingContent.malScore) {
          existingContent.unifiedScore = this.calculateWeightedScore(
            contentData.voteAverage,
            contentData.voteCount,
            existingContent.malScore,
            existingContent.malScoredBy,
          )
        } else {
          existingContent.unifiedScore = contentData.voteAverage || existingContent.malScore
        }

        existingContent.lastUpdated = new Date()
        await existingContent.save()
        this.stats.updated++
        console.log(`🔄 Updated TMDB ${contentType}: ${contentData.title}`)
      } else {
        // Create new content with unified score
        if (contentData.voteAverage) {
          contentData.unifiedScore = contentData.voteAverage
        }
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

      // Check if content already exists by malId
      const existingContent = await Content.findOne({ malId: malData.id })

      if (existingContent) {
        // Update existing content
        Object.assign(existingContent, contentData)
        existingContent.lastUpdated = new Date()
        await existingContent.save()
        this.stats.updated++
        console.log(`🔄 Updated MAL content: ${contentData.title}`)
      } else {
        // Check if same content exists in TMDB by title matching
        const existingTmdbContent = await Content.findOne({
          title: {
            $regex: new RegExp(contentData.title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'),
          },
          tmdbId: { $exists: true },
        })

        if (existingTmdbContent) {
          // Merge MAL data into existing TMDB content
          existingTmdbContent.malId = contentData.malId
          existingTmdbContent.malScore = contentData.malScore
          existingTmdbContent.malScoredBy = contentData.malScoredBy
          existingTmdbContent.malRank = contentData.malRank
          existingTmdbContent.malStatus = contentData.malStatus
          existingTmdbContent.malEpisodes = contentData.malEpisodes
          existingTmdbContent.malSource = contentData.malSource
          existingTmdbContent.malRating = contentData.malRating
          existingTmdbContent.studios = [
            ...new Set([...(existingTmdbContent.studios || []), ...(contentData.studios || [])]),
          ]
          existingTmdbContent.alternativeTitles = [
            ...new Set([
              ...(existingTmdbContent.alternativeTitles || []),
              ...(contentData.alternativeTitles || []),
            ]),
          ]

          // Create unified score using weighted calculation
          if (existingTmdbContent.voteAverage && contentData.malScore) {
            existingTmdbContent.unifiedScore = this.calculateWeightedScore(
              existingTmdbContent.voteAverage,
              existingTmdbContent.voteCount,
              contentData.malScore,
              contentData.malScoredBy,
            )
          } else {
            existingTmdbContent.unifiedScore =
              existingTmdbContent.voteAverage || contentData.malScore
          }

          existingTmdbContent.dataSources.mal = {
            hasData: true,
            lastUpdated: new Date(),
          }
          existingTmdbContent.lastUpdated = new Date()
          await existingTmdbContent.save()
          this.stats.merged++
          console.log(`🔗 Merged MAL data into TMDB content: ${contentData.title}`)
        } else {
          // Create new content with unified score
          if (contentData.malScore) {
            contentData.unifiedScore = contentData.malScore
          }
          const newContent = new Content(contentData)
          await newContent.save()
          this.stats.newAdded++
          console.log(`➕ Added MAL content: ${contentData.title}`)
        }
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
    console.log(`   Content merged: ${this.stats.merged}`)
    console.log(`   Errors: ${this.stats.errors}`)
    console.log(`   Skipped: ${this.stats.skipped}`)

    // Database statistics
    const totalContent = await Content.countDocuments()
    const tmdbOnlyContent = await Content.countDocuments({
      tmdbId: { $exists: true },
      malId: { $exists: false },
    })
    const malOnlyContent = await Content.countDocuments({
      malId: { $exists: true },
      tmdbId: { $exists: false },
    })
    const mergedContent = await Content.countDocuments({
      tmdbId: { $exists: true },
      malId: { $exists: true },
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

// Parse command line arguments
const parseArgs = () => {
  const args = process.argv.slice(2)
  const options = { tmdbLimit: 2000, malLimit: 2000 }

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--tmdbLimit' && args[i + 1]) {
      options.tmdbLimit = parseInt(args[i + 1])
      i++
    } else if (args[i] === '--malLimit' && args[i + 1]) {
      options.malLimit = parseInt(args[i + 1])
      i++
    }
  }

  return options
}

// Main execution
const runPopulation = async () => {
  const options = parseArgs()
  const populator = new DatabasePopulator()

  try {
    await populator.populateDatabase(options)
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
