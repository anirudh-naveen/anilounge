import mongoose from 'mongoose'
import dotenv from 'dotenv'
import Content from '../models/Content.js'
import unifiedContentService from '../services/unifiedContentService.js'
import relationshipService from '../services/relationshipService.js'

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
      console.log('Database connected')
    } catch (error) {
      console.error('Database connection error:', error)
      throw error
    }
  }

  async disconnectDB() {
    try {
      await mongoose.disconnect()
      console.log('Database disconnected')
    } catch (error) {
      console.error('Database disconnection error:', error)
    }
  }

  // Calculate unified score including user ratings
  calculateUnifiedScoreWithUserRatings(
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

  // Legacy method for backward compatibility (only uses TMDB and MAL)
  calculateWeightedScore(tmdbScore, tmdbVotes, malScore, malVotes) {
    return this.calculateUnifiedScoreWithUserRatings(
      tmdbScore,
      tmdbVotes,
      malScore,
      malVotes,
      null,
      0,
    )
  }

  async populateDatabase(options = {}) {
    const {
      tmdbLimit = 50,
      malLimit = 50,
      skipTmdb = false,
      skipMal = false,
      clear = false,
    } = options

    console.log('Starting unified database population...')
    console.log(`Target: ${tmdbLimit} TMDB items, ${malLimit} MAL items`)

    try {
      await this.connectDB()

      // Clear existing content if requested
      if (clear) {
        await Content.deleteMany({})
        console.log('Cleared existing content')
      }

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

      console.log('Database population completed successfully!')
    } catch (error) {
      console.error('Database population failed:', error)
      throw error
    } finally {
      await this.disconnectDB()
    }
  }

  async populateTmdbContent(limit) {
    console.log('Populating TMDB animated content...')

    let processed = 0
    const pages = Math.ceil(limit / 20) // TMDB returns 20 per page

    for (let page = 1; page <= pages && processed < limit; page++) {
      try {
        console.log(`Processing TMDB page ${page}/${pages}`)

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
        console.error(`Error processing TMDB page ${page}:`, error.message)
        this.stats.errors++
      }
    }

    console.log(`TMDB population completed: ${processed} items processed`)
  }

  async populateMalContent(limit) {
    console.log('Populating MAL content (movies + TV shows)...')

    let processed = 0
    const movieLimit = Math.floor(limit / 2) // Half for movies
    const tvLimit = limit - movieLimit // Half for TV shows

    // Fetch MAL movies
    console.log(`Fetching ${movieLimit} MAL movies...`)
    const batches = Math.ceil(movieLimit / this.batchSize)
    for (let batch = 0; batch < batches && processed < movieLimit; batch++) {
      try {
        const offset = batch * this.batchSize
        const batchLimit = Math.min(this.batchSize, movieLimit - processed)

        console.log(`Processing MAL movies batch ${batch + 1}/${batches} (${batchLimit} items)`)

        const movies = await unifiedContentService.getMalTopAnimeMovies(batchLimit, offset)

        for (const movie of movies) {
          if (processed >= movieLimit) break
          await this.saveMalContent(movie)
          processed++
        }

        await this.delay(this.delayBetweenBatches)
      } catch (error) {
        console.error(`Error processing MAL movies batch ${batch + 1}:`, error.message)
        this.stats.errors++
      }
    }

    // Fetch MAL TV shows
    console.log(`Fetching ${tvLimit} MAL TV shows...`)
    const tvBatches = Math.ceil(tvLimit / this.batchSize)
    for (let batch = 0; batch < tvBatches && processed < limit; batch++) {
      try {
        const offset = batch * this.batchSize
        const batchLimit = Math.min(this.batchSize, tvLimit - (processed - movieLimit))

        console.log(`Processing MAL TV batch ${batch + 1}/${tvBatches} (${batchLimit} items)`)

        const tvShows = await unifiedContentService.getMalTopAnime(batchLimit, offset)

        for (const tvShow of tvShows) {
          if (processed >= limit) break
          await this.saveMalContent(tvShow)
          processed++
        }

        await this.delay(this.delayBetweenBatches)
      } catch (error) {
        console.error(`Error processing MAL TV batch ${batch + 1}:`, error.message)
        this.stats.errors++
      }
    }

    console.log(`MAL population completed: ${processed} items processed`)
  }

  async saveTmdbContent(tmdbData, contentType) {
    try {
      this.stats.totalProcessed++

      // Get detailed TMDB information including genres
      const detailedTmdbData = await unifiedContentService.getTmdbContentDetails(
        tmdbData.id,
        contentType,
      )
      if (!detailedTmdbData) {
        console.log(`Could not get detailed info for TMDB ${contentType}: ${tmdbData.title}`)
        this.stats.skipped++
        return
      }

      const contentData = unifiedContentService.convertTmdbToContent(detailedTmdbData, contentType)

      // Skip if convertTmdbToContent returned null (insufficient votes or null data)
      if (!contentData) {
        this.stats.skipped++
        return
      }

      // Use enhanced deduplication (no external ID checking)
      const duplicates = await this.findDuplicateContent(contentData)

      if (duplicates.length > 0) {
        const duplicate = duplicates[0] // Take the first match
        const existingContent = duplicate.content

        if (duplicate.reason === 'title_match') {
          // Merge TMDB data into existing content
          await this.mergeTmdbIntoExisting(existingContent, contentData, detailedTmdbData)
          this.stats.merged++
          console.log(`Merged TMDB data into existing content: ${contentData.title}`)
        }
      } else {
        // Create new content with unified score and relationships
        contentData.unifiedScore = this.calculateUnifiedScoreWithUserRatings(
          contentData.voteAverage,
          contentData.voteCount,
          null,
          null,
          null,
          0,
        )
        // If calculation returns null, fallback to voteAverage
        if (!contentData.unifiedScore && contentData.voteAverage) {
          contentData.unifiedScore = contentData.voteAverage
        }

        // Initialize user rating fields
        contentData.userRatingAverage = null
        contentData.userRatingCount = 0

        // Process relationships for new content
        const relationships = await relationshipService.detectRelationshipsFromExternalData(
          detailedTmdbData,
          'tmdb',
        )
        if (relationships.franchise) {
          contentData.franchise = relationships.franchise.name
          contentData.relationships = {
            sequels: [],
            prequels: [],
            related: [],
            franchise: relationships.franchise.name,
          }
        }

        // Deduplicate genres before saving new content
        if (contentData.genres) {
          contentData.genres = this.deduplicateGenres(contentData.genres)
        }

        const newContent = new Content(contentData)
        await newContent.save()
        this.stats.newAdded++
        console.log(`Added TMDB ${contentType}: ${contentData.title}`)
      }
    } catch (error) {
      console.error(`Error saving TMDB content:`, error.message)
      this.stats.errors++
    }
  }

  // Enhanced deduplication method
  async findDuplicateContent(contentData) {
    const duplicates = []

    // Only use title-based matching for deduplication
    // External IDs are kept for reference but not used for deduplication
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
        // Additional fact checking to ensure it's the same content
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

    // Normalize title (remove special chars, lowercase for comparison)
    const normalized = title.toLowerCase().trim()
    variations.push(normalized)

    // Remove common suffixes/prefixes
    const cleaned = normalized
      .replace(/\s*\(.*?\)\s*/g, '') // Remove parentheses
      .replace(/\s*:.*$/g, '') // Remove colons and everything after
      .replace(/\s*-\s*.*$/g, '') // Remove dashes and everything after
      .replace(/\s*season\s*\d+.*$/gi, '') // Remove season info
      .replace(/\s*movie.*$/gi, '') // Remove "Movie" suffix
      .replace(/\s*the\s+/gi, '') // Remove "The" prefix
      .replace(/[^\w\s]/g, '') // Remove special characters
      .trim()

    if (cleaned !== normalized && cleaned.length > 2) {
      variations.push(cleaned)
    }

    // Also try with original title (in case it's in alternativeTitles)
    const originalCleaned = title
      .replace(/\s*\(.*?\)\s*/g, '')
      .replace(/\s*:.*$/g, '')
      .replace(/\s*-\s*.*$/g, '')
      .trim()

    if (originalCleaned !== title && originalCleaned.length > 2) {
      variations.push(originalCleaned.toLowerCase())
    }

    return [...new Set(variations)].filter((v) => v && v.length > 2)
  }

  // Fact checking to determine if content is likely the same
  // Made more lenient to catch TMDB/MAL duplicates
  isLikelySameContent(newContent, existingContent) {
    // If either content is missing release date, skip year check (more lenient)
    if (newContent.releaseDate && existingContent.releaseDate) {
      const newYear = new Date(newContent.releaseDate).getFullYear()
      const existingYear = new Date(existingContent.releaseDate).getFullYear()
      const yearDiff = Math.abs(newYear - existingYear)

      // More lenient: Movies within 2 years, TV shows within 3 years
      const maxYearDiff = newContent.contentType === 'movie' ? 2 : 3
      if (yearDiff > maxYearDiff) {
        console.log(
          `Year mismatch: ${newContent.title} (${newYear}) vs ${existingContent.title} (${existingYear})`,
        )
        return false
      }
    }
    // If one is missing release date, continue (don't reject match)

    // Check content type
    if (newContent.contentType !== existingContent.contentType) {
      console.log(
        `Content type mismatch: ${newContent.title} (${newContent.contentType}) vs ${existingContent.title} (${existingContent.contentType})`,
      )
      return false
    }

    // More lenient genre checking - if genres exist, check overlap, but don't require strict match
    const newGenres = (newContent.genres || []).map((g) => g.name?.toLowerCase() || g.toLowerCase())
    const existingGenres = (existingContent.genres || []).map(
      (g) => g.name?.toLowerCase() || g.toLowerCase(),
    )
    
    // If both have genres, check for overlap (more lenient)
    if (newGenres.length > 0 && existingGenres.length > 0) {
      const commonGenres = newGenres.filter((g) => existingGenres.includes(g))
      // Require at least 1 common genre (more lenient than before)
      if (commonGenres.length === 0) {
        console.log(
          `No common genres: ${newContent.title} vs ${existingContent.title}`,
        )
        console.log(`   New genres: ${newGenres.join(', ')}`)
        console.log(`   Existing genres: ${existingGenres.join(', ')}`)
        return false
      }
    }
    // If one has no genres, continue (don't reject match)

    // More lenient episode count check for TV shows (within 10 episodes instead of 5)
    if (newContent.contentType === 'tv') {
      const newEpisodes = newContent.episodeCount || newContent.malEpisodes
      const existingEpisodes = existingContent.episodeCount || existingContent.malEpisodes
      if (newEpisodes && existingEpisodes && Math.abs(newEpisodes - existingEpisodes) > 10) {
        console.log(
          `Episode count mismatch: ${newContent.title} (${newEpisodes}) vs ${existingContent.title} (${existingEpisodes})`,
        )
        return false
      }
    }
    // If one is missing episode count, continue (don't reject match)

    // More lenient runtime check for movies (within 45 minutes instead of 30)
    if (newContent.contentType === 'movie') {
      const newRuntime = newContent.runtime
      const existingRuntime = existingContent.runtime
      if (newRuntime && existingRuntime && Math.abs(newRuntime - existingRuntime) > 45) {
        console.log(
          `Runtime mismatch: ${newContent.title} (${newRuntime}min) vs ${existingContent.title} (${existingRuntime}min)`,
        )
        return false
      }
    }
    // If one is missing runtime, continue (don't reject match)

    console.log(`Content match confirmed: ${newContent.title} ≈ ${existingContent.title}`)
    return true
  }

  async saveMalContent(malData) {
    try {
      this.stats.totalProcessed++

      const contentData = unifiedContentService.convertMalToContent(malData)
      const malId = malData.node?.id || malData.id

      // Check if content already exists by malId
      const existingContent = await Content.findOne({ malId: malId })

      if (existingContent) {
        // Update existing content
        Object.assign(existingContent, contentData)
        // Deduplicate genres when updating
        if (existingContent.genres) {
          existingContent.genres = this.deduplicateGenres(existingContent.genres)
        }
        existingContent.lastUpdated = new Date()
        await existingContent.save()
        this.stats.updated++
        console.log(`Updated MAL content: ${contentData.title}`)
      } else {
        // Use enhanced deduplication
        const duplicates = await this.findDuplicateContent(contentData)

        if (duplicates.length > 0) {
          const duplicate = duplicates[0] // Take the first match
          const existingContent = duplicate.content

          if (duplicate.reason === 'title_match') {
            // Only merge MAL data into existing content if it's a title match
            // MAL content should never match by tmdb_id since it doesn't have TMDB IDs
            await this.mergeMalIntoExisting(existingContent, contentData)
            this.stats.merged++
            console.log(`Merged MAL data into existing content: ${contentData.title}`)
          }
        } else {
          // Create new content with MAL priority for anime and relationships
          const relationships = await relationshipService.detectRelationshipsFromExternalData(
            malData,
            'mal',
          )

          const contentWithRelationships = {
            ...contentData,
            unifiedScore:
              this.calculateUnifiedScoreWithUserRatings(
                null,
                null,
                contentData.malScore,
                contentData.malScoredBy,
                null,
                0,
              ) ||
              contentData.malScore ||
              0,
            userRatingAverage: null,
            userRatingCount: 0,
            dataSources: {
              mal: { hasData: true, lastUpdated: new Date() },
              tmdb: { hasData: false },
            },
            lastUpdated: new Date(),
          }

          if (relationships.franchise) {
            contentWithRelationships.franchise = relationships.franchise.name
            contentWithRelationships.relationships = {
              sequels: [],
              prequels: [],
              related: [],
              franchise: relationships.franchise.name,
            }
          }

          // Deduplicate genres before saving new content
          if (contentWithRelationships.genres) {
            contentWithRelationships.genres = this.deduplicateGenres(
              contentWithRelationships.genres,
            )
          }

          const newContent = new Content(contentWithRelationships)
          await newContent.save()
          this.stats.newAdded++
          console.log(`Added MAL ${contentData.contentType}: ${contentData.title}`)
        }
      }
    } catch (error) {
      console.error(`Error saving MAL content:`, error.message)
      this.stats.errors++
    }
  }

  // Enhanced merge method for TMDB data
  // Helper function to deduplicate genres by id or name
  deduplicateGenres(genres) {
    if (!genres || !Array.isArray(genres)) return []

    const genreMap = new Map()

    genres.forEach((genre) => {
      if (!genre) return

      // Handle both object format {id, name} and string format
      const genreId = typeof genre === 'object' ? genre.id : null
      const genreName = typeof genre === 'object' ? genre.name : genre

      if (!genreName) return

      // Use id as primary key if available, otherwise use name
      const key = genreId ? `id:${genreId}` : `name:${genreName.toLowerCase()}`

      if (!genreMap.has(key)) {
        genreMap.set(key, typeof genre === 'object' ? genre : { name: genre })
      }
    })

    return Array.from(genreMap.values())
  }

  async mergeTmdbIntoExisting(existingContent, tmdbData, detailedTmdbData) {
    // Merge TMDB-specific fields
    existingContent.tmdbId = tmdbData.tmdbId
    existingContent.voteAverage = tmdbData.voteAverage
    existingContent.voteCount = tmdbData.voteCount
    existingContent.popularity = tmdbData.popularity

    // Merge arrays
    existingContent.studios = [
      ...new Set([...(existingContent.studios || []), ...(tmdbData.studios || [])]),
    ]
    existingContent.alternativeTitles = [
      ...new Set([
        ...(existingContent.alternativeTitles || []),
        ...(tmdbData.alternativeTitles || []),
      ]),
    ]
    // Properly deduplicate genres by id or name
    existingContent.genres = this.deduplicateGenres([
      ...(existingContent.genres || []),
      ...(tmdbData.genres || []),
    ])

    // Calculate unified score with weighted calculation (including user ratings)
    if (existingContent.malScore && tmdbData.voteAverage) {
      existingContent.unifiedScore = this.calculateUnifiedScoreWithUserRatings(
        tmdbData.voteAverage,
        tmdbData.voteCount,
        existingContent.malScore,
        existingContent.malScoredBy,
        existingContent.userRatingAverage,
        existingContent.userRatingCount,
      )
    } else {
      existingContent.unifiedScore = tmdbData.voteAverage || existingContent.malScore || 0
    }

    // Process relationships during merge
    await relationshipService.processRelationshipsDuringMerge(
      existingContent,
      detailedTmdbData,
      'tmdb',
    )

    // Update data sources
    existingContent.dataSources.tmdb = {
      hasData: true,
      lastUpdated: new Date(),
    }

    existingContent.lastUpdated = new Date()
    await existingContent.save()
  }

  // Enhanced merge method that prioritizes MAL for anime
  async mergeMalIntoExisting(existingContent, malData) {
    // For anime content, prioritize MAL data but be conservative about overwriting
    const isAnime = this.isAnimeContent(malData)

    if (isAnime) {
      // Only overwrite title if MAL title is significantly different and more complete
      // Don't overwrite English titles with Japanese titles unless the English title is missing
      if (!existingContent.title || existingContent.title.length < malData.title.length) {
        existingContent.title = malData.title
      }

      // Only overwrite overview if existing one is empty or much shorter
      if (!existingContent.overview || existingContent.overview.length < malData.overview.length) {
        existingContent.overview = malData.overview
      }

      // Only overwrite poster if existing one is missing
      if (!existingContent.posterPath) {
        existingContent.posterPath = malData.posterPath
      }

      // Only overwrite release date if existing one is missing
      if (!existingContent.releaseDate) {
        existingContent.releaseDate = malData.releaseDate
      }
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
    // Properly deduplicate genres by id or name
    existingContent.genres = this.deduplicateGenres([
      ...(existingContent.genres || []),
      ...(malData.genres || []),
    ])

    // Calculate unified score with MAL priority (including user ratings)
    if (existingContent.voteAverage && malData.malScore) {
      existingContent.unifiedScore = this.calculateUnifiedScoreWithUserRatings(
        existingContent.voteAverage,
        existingContent.voteCount,
        malData.malScore,
        malData.malScoredBy,
        existingContent.userRatingAverage,
        existingContent.userRatingCount,
      )
    } else {
      existingContent.unifiedScore = malData.malScore || existingContent.voteAverage || 0
    }

    // Process relationships during merge
    await relationshipService.processRelationshipsDuringMerge(existingContent, malData, 'mal')

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
    console.log('\nPopulation Statistics:')
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

    console.log('\nDatabase Statistics:')
    console.log(`   Total content: ${totalContent}`)
    console.log(`   TMDB-only content: ${tmdbOnlyContent}`)
    console.log(`   MAL-only content: ${malOnlyContent}`)
    console.log(`   Merged content: ${mergedContent}`)

    // Content type breakdown
    const movies = await Content.countDocuments({ contentType: 'movie' })
    const tvShows = await Content.countDocuments({ contentType: 'tv' })

    console.log('\nContent Type Breakdown:')
    console.log(`   Movies: ${movies}`)
    console.log(`   TV Shows: ${tvShows}`)
  }
}

// Parse command line arguments
const parseArgs = () => {
  const args = process.argv.slice(2)
  const options = { tmdbLimit: 100, malLimit: 100, clear: false }

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--tmdbLimit' && args[i + 1]) {
      options.tmdbLimit = parseInt(args[i + 1])
      i++
    } else if (args[i] === '--malLimit' && args[i + 1]) {
      options.malLimit = parseInt(args[i + 1])
      i++
    } else if (args[i] === '--clear') {
      options.clear = true
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
    console.error('Population failed:', error)
    process.exit(1)
  } finally {
    process.exit(0)
  }
}

// Handle graceful shutdown
process.on('SIGINT', async () => {
  console.log('\nReceived SIGINT, shutting down gracefully...')
  process.exit(0)
})

process.on('SIGTERM', async () => {
  console.log('\nReceived SIGTERM, shutting down gracefully...')
  process.exit(0)
})

// Run the population
runPopulation()

// Export the class for use in other scripts
export default DatabasePopulator
