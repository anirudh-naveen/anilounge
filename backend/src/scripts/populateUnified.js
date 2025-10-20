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

      // Skip if convertTmdbToContent returned null (insufficient votes or null data)
      if (!contentData) {
        this.stats.skipped++
        return
      }

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

  // Enhanced deduplication method
  async findDuplicateContent(contentData, source) {
    const duplicates = []

    // 1. Check by external ID first
    if (source === 'tmdb' && contentData.tmdbId) {
      const byTmdbId = await Content.findOne({ tmdbId: contentData.tmdbId })
      if (byTmdbId) duplicates.push({ content: byTmdbId, reason: 'tmdb_id' })
    }

    if (source === 'mal' && contentData.malId) {
      const byMalId = await Content.findOne({ malId: contentData.malId })
      if (byMalId) duplicates.push({ content: byMalId, reason: 'mal_id' })
    }

    // 2. Check by title similarity (fuzzy matching)
    const titleVariations = this.generateTitleVariations(contentData.title)
    for (const title of titleVariations) {
      const byTitle = await Content.findOne({
        $or: [
          { title: { $regex: new RegExp(title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i') } },
          {
            alternativeTitles: {
              $regex: new RegExp(title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'),
            },
          },
        ],
        contentType: contentData.contentType,
      })

      if (byTitle && !duplicates.some((d) => d.content._id.equals(byTitle._id))) {
        // Additional fact checking
        if (this.isLikelySameContent(contentData, byTitle)) {
          duplicates.push({ content: byTitle, reason: 'title_match' })
        }
      }
    }

    return duplicates
  }

  // Generate title variations for better matching
  generateTitleVariations(title) {
    const variations = [title]

    // Remove common suffixes/prefixes
    const cleaned = title
      .replace(/\s*\(.*?\)\s*/g, '') // Remove parentheses
      .replace(/\s*:.*$/g, '') // Remove colons and everything after
      .replace(/\s*-\s*.*$/g, '') // Remove dashes and everything after
      .replace(/\s*Season\s*\d+.*$/gi, '') // Remove season info
      .replace(/\s*Movie.*$/gi, '') // Remove "Movie" suffix
      .trim()

    if (cleaned !== title) variations.push(cleaned)

    return [...new Set(variations)].filter((v) => v && v.length > 2)
  }

  // Fact checking to determine if content is likely the same
  isLikelySameContent(newContent, existingContent) {
    // Check release year similarity (within 1 year for movies, 2 years for TV shows)
    if (newContent.releaseDate && existingContent.releaseDate) {
      const newYear = new Date(newContent.releaseDate).getFullYear()
      const existingYear = new Date(existingContent.releaseDate).getFullYear()
      const yearDiff = Math.abs(newYear - existingYear)

      // Movies should be within 1 year, TV shows within 2 years
      const maxYearDiff = newContent.contentType === 'movie' ? 1 : 2
      if (yearDiff > maxYearDiff) {
        console.log(
          `❌ Year mismatch: ${newContent.title} (${newYear}) vs ${existingContent.title} (${existingYear})`,
        )
        return false
      }
    }

    // Check content type
    if (newContent.contentType !== existingContent.contentType) {
      console.log(
        `❌ Content type mismatch: ${newContent.title} (${newContent.contentType}) vs ${existingContent.title} (${existingContent.contentType})`,
      )
      return false
    }

    // Check genre overlap (at least 1 common genre)
    const newGenres = (newContent.genres || []).map((g) => g.name?.toLowerCase() || g.toLowerCase())
    const existingGenres = (existingContent.genres || []).map(
      (g) => g.name?.toLowerCase() || g.toLowerCase(),
    )
    const commonGenres = newGenres.filter((g) => existingGenres.includes(g))

    if (commonGenres.length === 0) {
      console.log(`❌ No common genres: ${newContent.title} vs ${existingContent.title}`)
      return false
    }

    // Check episode count similarity for TV shows (within 5 episodes)
    if (newContent.contentType === 'tv') {
      const newEpisodes = newContent.episodeCount || newContent.malEpisodes
      const existingEpisodes = existingContent.episodeCount || existingContent.malEpisodes
      if (newEpisodes && existingEpisodes && Math.abs(newEpisodes - existingEpisodes) > 5) {
        console.log(
          `❌ Episode count mismatch: ${newContent.title} (${newEpisodes}) vs ${existingContent.title} (${existingEpisodes})`,
        )
        return false
      }
    }

    // Check runtime similarity for movies (within 30 minutes)
    if (newContent.contentType === 'movie') {
      const newRuntime = newContent.runtime
      const existingRuntime = existingContent.runtime
      if (newRuntime && existingRuntime && Math.abs(newRuntime - existingRuntime) > 30) {
        console.log(
          `❌ Runtime mismatch: ${newContent.title} (${newRuntime}min) vs ${existingContent.title} (${existingRuntime}min)`,
        )
        return false
      }
    }

    console.log(`✅ Content match confirmed: ${newContent.title} ≈ ${existingContent.title}`)
    return true
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
        // Use enhanced deduplication
        const duplicates = await this.findDuplicateContent(contentData, 'mal')

        if (duplicates.length > 0) {
          const duplicate = duplicates[0] // Take the first match
          const existingContent = duplicate.content

          if (duplicate.reason === 'title_match' || duplicate.reason === 'tmdb_id') {
            // Merge MAL data into existing content (prioritize MAL for anime)
            await this.mergeMalIntoExisting(existingContent, contentData)
            this.stats.merged++
            console.log(`🔗 Merged MAL data into existing content: ${contentData.title}`)
          }
        } else {
          // Create new content with MAL priority for anime
          const newContent = new Content({
            ...contentData,
            unifiedScore: contentData.malScore || 0,
            dataSources: {
              mal: { hasData: true, lastUpdated: new Date() },
              tmdb: { hasData: false },
            },
            lastUpdated: new Date(),
          })

          await newContent.save()
          this.stats.added++
          console.log(`➕ Added MAL ${contentData.contentType}: ${contentData.title}`)
        }
      }
    } catch (error) {
      console.error(`❌ Error saving MAL content:`, error.message)
      this.stats.errors++
    }
  }

  // Enhanced merge method that prioritizes MAL for anime
  async mergeMalIntoExisting(existingContent, malData) {
    // For anime content, prioritize MAL data
    const isAnime = this.isAnimeContent(malData)

    if (isAnime) {
      // MAL priority: Use MAL data as primary, merge TMDB data
      existingContent.title = malData.title || existingContent.title
      existingContent.overview = malData.overview || existingContent.overview
      existingContent.posterPath = malData.posterPath || existingContent.posterPath
      existingContent.releaseDate = malData.releaseDate || existingContent.releaseDate
    }

    // Always merge MAL-specific fields
    existingContent.malId = malData.malId
    existingContent.malScore = malData.malScore
    existingContent.malScoredBy = malData.malScoredBy
    existingContent.malRank = malData.malRank
    existingContent.malStatus = malData.malStatus
    existingContent.malEpisodes = malData.malEpisodes
    existingContent.malSource = malData.malSource
    existingContent.malRating = malData.malRating

    // Merge arrays
    existingContent.studios = [
      ...new Set([...(existingContent.studios || []), ...(malData.studios || [])]),
    ]
    existingContent.alternativeTitles = [
      ...new Set([
        ...(existingContent.alternativeTitles || []),
        ...(malData.alternativeTitles || []),
      ]),
    ]
    existingContent.genres = [
      ...new Set([...(existingContent.genres || []), ...(malData.genres || [])]),
    ]

    // Calculate unified score with MAL priority
    if (existingContent.voteAverage && malData.malScore) {
      existingContent.unifiedScore = this.calculateWeightedScore(
        existingContent.voteAverage,
        existingContent.voteCount,
        malData.malScore,
        malData.malScoredBy,
      )
    } else {
      existingContent.unifiedScore = malData.malScore || existingContent.voteAverage || 0
    }

    // Preserve existing dataSources and add MAL data
    if (!existingContent.dataSources) {
      existingContent.dataSources = {}
    }
    existingContent.dataSources.mal = {
      hasData: true,
      lastUpdated: new Date(),
    }
    existingContent.lastUpdated = new Date()

    await existingContent.save()
  }

  // Check if content is anime (Japanese animation)
  isAnimeContent(contentData) {
    const animeKeywords = ['anime', 'manga', 'japanese', 'japan']
    const title = (contentData.title || '').toLowerCase()
    const overview = (contentData.overview || '').toLowerCase()
    const studios = (contentData.studios || []).map((s) => s.toLowerCase())

    return animeKeywords.some(
      (keyword) =>
        title.includes(keyword) ||
        overview.includes(keyword) ||
        studios.some((studio) => studio.includes(keyword)),
    )
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
  const options = { tmdbLimit: 100, malLimit: 100 }

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
