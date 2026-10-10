/**
 * Persists TMDB and MyAnimeList catalog rows into PostgreSQL Content documents.
 * Domain service used by the populateUnified CLI and the hourly contentSyncScheduler.
 * Dedup is title/type based (external IDs are reference-only, except conflicting ids block a merge). Merges combine MAL + TMDB
 * without clobbering user ratings; unifiedScore is vote-weighted across sources.
 */
import { connectPostgres, closePostgres } from '../../config/postgres.js'
import Content, { catalogStats } from '../models/Content.js'
import unifiedContentService from './unifiedContentService.js'
import relationshipService from './relationshipService.js'
import { runCatalogMaintenance } from './catalogMaintenance.js'
import {
  ANILIST_ORIGIN_COUNTRIES,
  convertAnilistToContent,
  findAnilistMatch,
} from './anilistService.js'
import { calculateUnifiedScore } from '../utils/ratings.js'
import { studioNamesEqual } from '../utils/entities.js'
import {
  applyTitleFields,
  collectContentTitles,
  contentExactTitlesMatchOr,
  contentTitlesOverlap,
  externalIdsConflict,
  seasonsConflict,
} from '../utils/titles.js'

/**
 * AniList search input for a Content-shaped title.
 * @param {object} content
 * @returns {{ titles: string[], contentType: string, year: number | null }}
 */
export function anilistSearchInput(content) {
  const year = content.releaseDate ? new Date(content.releaseDate).getFullYear() : null
  return {
    titles: collectContentTitles(content),
    contentType: content.contentType,
    year: Number.isFinite(year) ? year : null,
  }
}

/**
 * Whether a TMDB-only title may exist on AniList (East Asian animation).
 * @param {object} content
 * @returns {boolean}
 */
export function isAnilistCandidate(content) {
  return (content.originCountries || []).some((code) =>
    ANILIST_ORIGIN_COUNTRIES.has(String(code).toUpperCase()),
  )
}

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

  /**
   * Pause between upstream batches.
   * @param {number} ms
   * @returns {Promise<void>}
   */
  async delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms))
  }

  /**
   * Connect using DATABASE_URL. Scheduler passes manageConnection: false and skips this.
   * @returns {Promise<void>}
   */
  async connectDB() {
    try {
      await connectPostgres()
      console.log('Database connected')
    } catch (error) {
      console.error('Database connection error:', error)
      throw error
    }
  }

  /**
   * Close the PostgreSQL pool opened by connectDB.
   * @returns {Promise<void>}
   */
  async disconnectDB() {
    try {
      await closePostgres()
      console.log('Database disconnected')
    } catch (error) {
      console.error('Database disconnection error:', error)
    }
  }

  /**
   * Pull TMDB/MAL pages, upsert/merge into Content, and print stats.
   * `clear` wipes the collection and is CLI-only — the scheduler always passes false.
   * @param {{ tmdbLimit?: number, malLimit?: number, skipTmdb?: boolean, skipMal?: boolean, clear?: boolean, manageConnection?: boolean }} [options={}]
   * @returns {Promise<object>} Copy of this.stats for the run
   */
  async populateDatabase(options = {}) {
    const {
      tmdbLimit = 50,
      malLimit = 50,
      skipTmdb = false,
      skipMal = false,
      clear = false,
      manageConnection = true,
    } = options

    // Reset per-run stats so scheduled syncs don't accumulate
    this.stats = {
      totalProcessed: 0,
      newAdded: 0,
      updated: 0,
      merged: 0,
      errors: 0,
      skipped: 0,
    }

    console.log('Starting unified database population...')
    console.log(`Target: ${tmdbLimit} TMDB items, ${malLimit} MAL items`)

    try {
      if (manageConnection) {
        await this.connectDB()
      }

      if (clear) {
        await Content.deleteMany({})
        console.log('Cleared existing content')
      }

      if (!skipTmdb) {
        await this.populateTmdbContent(tmdbLimit)
      }

      if (!skipMal) {
        await this.populateMalContent(malLimit)
      }

      await this.groupNewTitlesIntoFranchises()

      await this.printFinalStats()

      console.log('Database population completed successfully!')
      return { ...this.stats }
    } catch (error) {
      console.error('Database population failed:', error)
      throw error
    } finally {
      if (manageConnection) {
        await this.disconnectDB()
      }
    }
  }

  /**
   * Group this run's new titles into franchises and merge their duplicate
   * characters (catalogMaintenance.js). It logs its own failures, so it never
   * fails the sync.
   * @returns {Promise<void>}
   */
  async groupNewTitlesIntoFranchises() {
    await runCatalogMaintenance('content sync')
  }

  /**
   * Page through TMDB animation movies and TV until `limit` items are processed.
   * @param {number} limit
   * @returns {Promise<void>}
   */
  async populateTmdbContent(limit) {
    console.log('Populating TMDB animated content...')

    let processed = 0
    const pages = Math.ceil(limit / 20) // TMDB discover returns 20 per page

    for (let page = 1; page <= pages && processed < limit; page++) {
      try {
        console.log(`Processing TMDB page ${page}/${pages}`)

        const movies = await unifiedContentService.getTmdbAnimatedMovies(page, 10)
        for (const movie of movies) {
          if (processed >= limit) break
          await this.saveTmdbContent(movie, 'movie')
          processed++
        }

        const tvShows = await unifiedContentService.getTmdbAnimatedTVShows(page, 10)
        for (const tvShow of tvShows) {
          if (processed >= limit) break
          await this.saveTmdbContent(tvShow, 'tv')
          processed++
        }

        await this.delay(500)
      } catch (error) {
        console.error(`Error processing TMDB page ${page}:`, error.message)
        this.stats.errors++
      }
    }

    console.log(`TMDB population completed: ${processed} items processed`)
  }

  /**
   * Fetch MAL movies then TV ranking batches (split of `limit` roughly in half).
   * @param {number} limit
   * @returns {Promise<void>}
   */
  async populateMalContent(limit) {
    console.log('Populating MAL content (movies + TV shows)...')

    let processed = 0
    const movieLimit = Math.floor(limit / 2)
    const tvLimit = limit - movieLimit

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

  /**
   * Upsert a TMDB title: stable tmdbId match first, else fuzzy title merge, else insert.
   * @param {object} tmdbData - Discover list item (id used to fetch details)
   * @param {'movie' | 'tv'} contentType
   * @returns {Promise<void>}
   */
  async saveTmdbContent(tmdbData, contentType) {
    try {
      this.stats.totalProcessed++

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

      // convertTmdbToContent returns null when votes are under the ingest threshold
      if (!contentData) {
        this.stats.skipped++
        return
      }

      // Prefer stable upsert by tmdbId before fuzzy title matching
      if (contentData.tmdbId) {
        const existingByTmdb = await Content.findOne({ tmdbId: contentData.tmdbId })
        if (existingByTmdb) {
          await this.mergeTmdbIntoExisting(existingByTmdb, contentData)
          this.stats.updated++
          console.log(`Updated TMDB content: ${contentData.title}`)
          return
        }
      }

      const duplicates = await this.findDuplicateContent(contentData)

      if (duplicates.length > 0) {
        const duplicate = duplicates[0]
        const existingContent = duplicate.content

        if (duplicate.reason === 'title_match') {
          await this.mergeTmdbIntoExisting(existingContent, contentData)
          this.stats.merged++
          console.log(`Merged TMDB data into existing content: ${contentData.title}`)
        }
        return
      }

      // AniList knows the MAL entry for an anime TMDB lists under another name.
      const anilistMatch = await this.findAnilistMatchForTmdb(contentData)
      const anilistData = anilistMatch ? convertAnilistToContent(anilistMatch) : null
      const malOwner = anilistData?.malId
        ? await Content.findOne({ malId: anilistData.malId })
        : null
      if (malOwner && !malOwner.tmdbId) {
        await this.mergeTmdbIntoExisting(malOwner, contentData, { save: false })
        await this.mergeAnilistIntoExisting(malOwner, anilistData)
        this.stats.merged++
        console.log(`Merged TMDB data into MAL title via AniList: ${contentData.title}`)
        return
      }

      contentData.unifiedScore = calculateUnifiedScore(
        contentData.voteAverage,
        contentData.voteCount,
        null,
        null,
        null,
        0,
      )
      if (!contentData.unifiedScore && contentData.voteAverage) {
        contentData.unifiedScore = contentData.voteAverage
      }

      contentData.userRatingAverage = null
      contentData.userRatingCount = 0
      contentData.userRatingSum = 0

      if (contentData.genres) {
        contentData.genres = this.deduplicateGenres(contentData.genres)
      }

      const newContent = new Content(contentData)
      if (anilistData) {
        await this.mergeAnilistIntoExisting(newContent, anilistData, { save: false })
        if (anilistData.malId && !malOwner) newContent.malId = anilistData.malId
      }
      await newContent.save()
      if (newContent.malId && unifiedContentService.hasMalKey) {
        const anime = await unifiedContentService.getMalAnimeDetails(newContent.malId)
        const malData = anime ? unifiedContentService.convertMalToContent(anime) : null
        if (malData) await this.mergeMalIntoExisting(newContent, malData)
      }
      this.stats.newAdded++
      console.log(`Added TMDB ${contentType}: ${contentData.title}`)
    } catch (error) {
      console.error(`Error saving TMDB content:`, error.message)
      this.stats.errors++
    }
  }

  /**
   * Exact name lookup plus isLikelySameContent fact checks.
   * Searches every English/native/original/alternative name. Conflicting TMDB/MAL ids never merge.
   * @param {object} contentData
   * @returns {Promise<Array<{ content: object, reason: 'title_match' }>>}
   */
  async findDuplicateContent(contentData) {
    const duplicates = []
    const titleOr = contentExactTitlesMatchOr(contentData)
    if (titleOr.length === 0) return duplicates

    const candidates = await Content.find({
      $or: titleOr,
      contentType: contentData.contentType,
    })

    for (const candidate of candidates) {
      if (this.isLikelySameContent(contentData, candidate)) {
        duplicates.push({ content: candidate, reason: 'title_match' })
      }
    }

    return duplicates
  }

  /**
   * Lenient same-title check used when merging TMDB and MAL rows:
   * names must overlap (ignoring case and spacing), main names must not name
   * different seasons/parts, and external ids must not conflict;
   * movies within 2 years, TV within 3; at least one shared genre when both have genres;
   * TV episode counts within 10; movie runtimes within 45 minutes.
   * Missing year/genre/episode/runtime does not reject the match.
   * @param {object} newContent
   * @param {object} existingContent
   * @returns {boolean}
   */
  isLikelySameContent(newContent, existingContent) {
    if (externalIdsConflict(newContent, existingContent)) {
      console.log(
        `External ID mismatch: ${newContent.title} vs ${existingContent.title}`,
      )
      return false
    }

    if (!contentTitlesOverlap(newContent, existingContent)) {
      return false
    }

    if (seasonsConflict(newContent, existingContent)) {
      console.log(`Season mismatch: ${newContent.title} vs ${existingContent.title}`)
      return false
    }

    if (newContent.releaseDate && existingContent.releaseDate) {
      const newYear = new Date(newContent.releaseDate).getFullYear()
      const existingYear = new Date(existingContent.releaseDate).getFullYear()
      const yearDiff = Math.abs(newYear - existingYear)

      const maxYearDiff = newContent.contentType === 'movie' ? 2 : 3
      if (yearDiff > maxYearDiff) {
        console.log(
          `Year mismatch: ${newContent.title} (${newYear}) vs ${existingContent.title} (${existingYear})`,
        )
        return false
      }
    }

    if (newContent.contentType !== existingContent.contentType) {
      console.log(
        `Content type mismatch: ${newContent.title} (${newContent.contentType}) vs ${existingContent.title} (${existingContent.contentType})`,
      )
      return false
    }

    const newGenres = (newContent.genres || []).map((g) => g.name?.toLowerCase() || g.toLowerCase())
    const existingGenres = (existingContent.genres || []).map(
      (g) => g.name?.toLowerCase() || g.toLowerCase(),
    )

    if (newGenres.length > 0 && existingGenres.length > 0) {
      const commonGenres = newGenres.filter((g) => existingGenres.includes(g))
      if (commonGenres.length === 0) {
        console.log(`No common genres: ${newContent.title} vs ${existingContent.title}`)
        console.log(`   New genres: ${newGenres.join(', ')}`)
        console.log(`   Existing genres: ${existingGenres.join(', ')}`)
        return false
      }
    }

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

    console.log(`Content match confirmed: ${newContent.title} ≈ ${existingContent.title}`)
    return true
  }

  /**
   * Upsert a MAL title: malId match first, else fuzzy title merge, else insert.
   * @param {object} malData
   * @returns {Promise<void>}
   */
  async saveMalContent(malData) {
    try {
      this.stats.totalProcessed++

      const contentData = unifiedContentService.convertMalToContent(malData)
      if (!contentData) {
        this.stats.skipped++
        return
      }

      const malId = contentData.malId || malData.node?.id || malData.id

      const existingContent = malId != null ? await Content.findOne({ malId }) : null

      if (existingContent) {
        // Field-level merge: Object.assign would overwrite TMDB/user ratings
        await this.mergeMalIntoExisting(existingContent, contentData)
        this.stats.updated++
        console.log(`Updated MAL content: ${contentData.title}`)
      } else {
        const duplicates = await this.findDuplicateContent(contentData)

        if (duplicates.length > 0) {
          const duplicate = duplicates[0]
          const existingMatch = duplicate.content

          if (duplicate.reason === 'title_match') {
            await this.mergeMalIntoExisting(existingMatch, contentData)
            this.stats.merged++
            console.log(`Merged MAL data into existing content: ${contentData.title}`)
          }
        } else {
          const contentWithRelationships = {
            ...contentData,
            unifiedScore:
              calculateUnifiedScore(
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
            userRatingSum: 0,
            dataSources: {
              mal: { hasData: true, lastUpdated: new Date() },
              tmdb: { hasData: false },
            },
            lastUpdated: new Date(),
          }

          if (contentWithRelationships.genres) {
            contentWithRelationships.genres = this.deduplicateGenres(
              contentWithRelationships.genres,
            )
          }

          const newContent = new Content(contentWithRelationships)
          await newContent.save()
          await relationshipService.populateRelationshipsFromMAL(newContent)
          this.stats.newAdded++
          console.log(`Added MAL ${contentData.contentType}: ${contentData.title}`)
        }
      }
    } catch (error) {
      console.error(`Error saving MAL content:`, error.message)
      this.stats.errors++
    }
  }

  /**
   * Collapse genre arrays by numeric id when present, otherwise lowercase name.
   * @param {Array<{ id?: number, name?: string } | string>} genres
   * @returns {Array<{ id?: number, name: string }>}
   */
  deduplicateGenres(genres) {
    if (!genres || !Array.isArray(genres)) return []

    const genreMap = new Map()

    genres.forEach((genre) => {
      if (!genre) return

      const genreId = typeof genre === 'object' ? genre.id : null
      const genreName = typeof genre === 'object' ? genre.name : genre

      if (!genreName) return

      const key = genreId ? `id:${genreId}` : `name:${genreName.toLowerCase()}`

      if (!genreMap.has(key)) {
        genreMap.set(key, typeof genre === 'object' ? genre : { name: genre })
      }
    })

    return Array.from(genreMap.values())
  }

  /**
   * Copy merged title fields onto an existing catalog document.
   * @param {object} existingContent
   * @param {object} titleFields
   * @returns {void}
   */
  assignTitleFields(existingContent, titleFields) {
    existingContent.title = titleFields.title
    if (titleFields.englishTitle) existingContent.englishTitle = titleFields.englishTitle
    if (titleFields.nativeTitle) existingContent.nativeTitle = titleFields.nativeTitle
    if (titleFields.originalTitle) existingContent.originalTitle = titleFields.originalTitle
    existingContent.alternativeTitles = titleFields.alternativeTitles
  }

  /**
   * Overlay TMDB metadata onto an existing row without touching user ratings or MAL scores.
   * Recalculates unifiedScore from all three sources when present.
   * @param {object} existingContent
   * @param {object} tmdbData - Converted Content-shaped TMDB object
   * @param {{ save?: boolean }} [options] - `save: false` leaves persisting to the caller
   * @returns {Promise<void>}
   */
  async mergeTmdbIntoExisting(existingContent, tmdbData, { save = true } = {}) {
    this.assignTitleFields(
      existingContent,
      applyTitleFields(existingContent, tmdbData, { preferIncomingEnglish: true }),
    )
    if (tmdbData.overview) existingContent.overview = tmdbData.overview
    if (tmdbData.posterPath) existingContent.posterPath = tmdbData.posterPath
    if (tmdbData.backdropPath) existingContent.backdropPath = tmdbData.backdropPath
    if (tmdbData.releaseDate) existingContent.releaseDate = tmdbData.releaseDate
    if (tmdbData.runtime != null) existingContent.runtime = tmdbData.runtime
    // MAL/AniList count an anime row's own season; TMDB's totals can span the whole
    // show, so they only fill counts the row lacks.
    const ownCounts = Boolean(existingContent.malId || existingContent.anilistId)
    if (tmdbData.episodeCount != null && !(ownCounts && existingContent.episodeCount)) {
      existingContent.episodeCount = tmdbData.episodeCount
    }
    if (tmdbData.seasonCount != null && !(ownCounts && existingContent.seasonCount)) {
      existingContent.seasonCount = tmdbData.seasonCount
    }
    if (tmdbData.contentType === 'tv') {
      existingContent.nextEpisodeAirDate = tmdbData.nextEpisodeAirDate || null
      existingContent.nextEpisodeNumber = tmdbData.nextEpisodeNumber ?? null
      existingContent.nextEpisodeSeason = tmdbData.nextEpisodeSeason ?? null
      if (tmdbData.lastAirDate) {
        const existing = existingContent.lastAirDate
          ? new Date(existingContent.lastAirDate).getTime()
          : 0
        const incoming = new Date(tmdbData.lastAirDate).getTime()
        if (!existing || incoming > existing) existingContent.lastAirDate = tmdbData.lastAirDate
      }
    }

    existingContent.tmdbId = tmdbData.tmdbId
    existingContent.voteAverage = tmdbData.voteAverage
    existingContent.voteCount = tmdbData.voteCount
    existingContent.popularity = tmdbData.popularity

    // MAL lists the animation studio; TMDB companies are publishers/distributors for anime.
    const hasMalStudios = Boolean(existingContent.malId) && (existingContent.studios || []).length > 0
    if (!hasMalStudios) {
      existingContent.studios = [
        ...new Set([...(existingContent.studios || []), ...(tmdbData.studios || [])]),
      ]
      existingContent.studioRefs = [
        ...(existingContent.studioRefs || []),
        ...(tmdbData.studioRefs || []),
      ]
    }
    existingContent.originCountries = [
      ...new Set([...(existingContent.originCountries || []), ...(tmdbData.originCountries || [])]),
    ]
    existingContent.genres = this.deduplicateGenres([
      ...(existingContent.genres || []),
      ...(tmdbData.genres || []),
    ])

    existingContent.unifiedScore =
      calculateUnifiedScore(
        tmdbData.voteAverage,
        tmdbData.voteCount,
        existingContent.malScore,
        existingContent.malScoredBy,
        existingContent.userRatingAverage,
        existingContent.userRatingCount,
      ) ||
      tmdbData.voteAverage ||
      existingContent.malScore ||
      0

    if (!existingContent.dataSources) {
      existingContent.dataSources = {}
    }
    existingContent.dataSources.tmdb = {
      hasData: true,
      lastUpdated: new Date(),
    }

    existingContent.lastUpdated = new Date()
    if (save) await existingContent.save()
  }

  /**
   * Overlay MAL fields onto an existing row. For anime-like titles, overview/poster/date
   * only fill gaps (or replace a much shorter overview). Always writes MAL score fields
   * and may promote contentType to `special`.
   * @param {object} existingContent
   * @param {object} malData - Converted Content-shaped MAL object
   * @param {{ save?: boolean }} [options] - `save: false` skips persisting and MAL relation ingest
   * @returns {Promise<void>}
   */
  async mergeMalIntoExisting(existingContent, malData, { save = true } = {}) {
    const isAnime = this.isAnimeContent(malData)

    this.assignTitleFields(
      existingContent,
      applyTitleFields(existingContent, malData, { preferIncomingNative: true }),
    )

    if (isAnime) {
      if (!existingContent.overview || existingContent.overview.length < malData.overview.length) {
        existingContent.overview = malData.overview
      }

      if (!existingContent.posterPath) {
        existingContent.posterPath = malData.posterPath
      }

      if (!existingContent.releaseDate) {
        existingContent.releaseDate = malData.releaseDate
      }
    }

    existingContent.malId = malData.malId
    existingContent.malScore = malData.malScore
    existingContent.malScoredBy = malData.malScoredBy
    existingContent.malRank = malData.malRank
    existingContent.malStatus = malData.malStatus
    existingContent.malEpisodes = malData.malEpisodes
    existingContent.broadcastDay = malData.broadcastDay || null
    existingContent.broadcastTime = malData.broadcastTime || null
    existingContent.malMediaType = malData.malMediaType || existingContent.malMediaType
    existingContent.malSource = malData.malSource
    existingContent.malRating = malData.malRating
    if (malData.startSeasonYear) existingContent.startSeasonYear = malData.startSeasonYear
    if (malData.startSeason) existingContent.startSeason = malData.startSeason
    if (malData.lastAirDate) {
      const existing = existingContent.lastAirDate
        ? new Date(existingContent.lastAirDate).getTime()
        : 0
      const incoming = new Date(malData.lastAirDate).getTime()
      if (!existing || incoming > existing) existingContent.lastAirDate = malData.lastAirDate
    }

    if (malData.contentType === 'special') {
      existingContent.contentType = 'special'
    }

    if ((malData.studios || []).length) {
      existingContent.studios = [...new Set(malData.studios)]
      existingContent.studioRefs = malData.studioRefs || []
    }
    existingContent.originCountries = [
      ...new Set([...(existingContent.originCountries || []), ...(malData.originCountries || [])]),
    ]
    existingContent.genres = this.deduplicateGenres([
      ...(existingContent.genres || []),
      ...(malData.genres || []),
    ])

    existingContent.unifiedScore =
      calculateUnifiedScore(
        existingContent.voteAverage,
        existingContent.voteCount,
        malData.malScore,
        malData.malScoredBy,
        existingContent.userRatingAverage,
        existingContent.userRatingCount,
      ) ||
      malData.malScore ||
      existingContent.voteAverage ||
      0

    if (!existingContent.dataSources) {
      existingContent.dataSources = {}
    }
    existingContent.dataSources.mal = {
      hasData: true,
      lastUpdated: new Date(),
    }
    existingContent.lastUpdated = new Date()

    if (!save) return
    await existingContent.save()
    await relationshipService.populateRelationshipsFromMAL(existingContent)
  }

  /**
   * Overlay AniList fields onto an existing row: AniList id, extra titles, and
   * overview/poster only where missing. Studios follow MAL first, then AniList
   * animation studios, then TMDB companies; matching studios gain AniList ids.
   * @param {object} existingContent
   * @param {object} anilistData - Output of `convertAnilistToContent`
   * @param {{ save?: boolean }} [options]
   * @returns {Promise<void>}
   */
  async mergeAnilistIntoExisting(existingContent, anilistData, { save = true } = {}) {
    if (!anilistData?.anilistId) return
    existingContent.anilistId = anilistData.anilistId
    this.assignTitleFields(existingContent, applyTitleFields(existingContent, anilistData))
    if (!existingContent.overview && anilistData.overview) {
      existingContent.overview = anilistData.overview
    }
    if (!existingContent.posterPath && anilistData.posterPath) {
      existingContent.posterPath = anilistData.posterPath
    }

    const studios = existingContent.studios || []
    const refs = existingContent.studioRefs || []
    const hasMalStudios =
      Boolean(existingContent.malId) &&
      studios.length > 0 &&
      (!refs.length || refs.some((ref) => ref.malId))
    const namedAs = (ref, names) => {
      const name = names.find((candidate) => studioNamesEqual(candidate, ref.name))
      return name ? { ...ref, name } : null
    }
    if (hasMalStudios) {
      const extra = (anilistData.allStudioRefs || []).map((ref) => namedAs(ref, studios))
      existingContent.studioRefs = [...refs, ...extra.filter(Boolean)]
    } else if ((anilistData.studios || []).length) {
      const names = [...anilistData.studios]
      const tmdbMatches = refs.filter((ref) => ref.tmdbId).map((ref) => namedAs(ref, names))
      existingContent.studios = names
      existingContent.studioRefs = [...anilistData.studioRefs, ...tmdbMatches.filter(Boolean)]
    }

    if (!existingContent.dataSources) existingContent.dataSources = {}
    existingContent.dataSources.anilist = { hasData: true, lastUpdated: new Date() }
    if (save) await existingContent.save()
  }

  /**
   * AniList anime matching a new TMDB title, for East Asian animation only.
   * @param {object} contentData
   * @returns {Promise<object | null>}
   */
  async findAnilistMatchForTmdb(contentData) {
    if (!isAnilistCandidate(contentData)) return null
    try {
      return await findAnilistMatch(anilistSearchInput(contentData))
    } catch (error) {
      console.error(`AniList lookup failed for ${contentData.title}:`, error.message)
      return null
    }
  }

  /**
   * Heuristic: title, overview, or studio string mentions anime/manga/japan.
   * @param {object} contentData
   * @returns {boolean}
   */
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

  /**
   * Log run counters plus collection totals by source mix and contentType.
   * @returns {Promise<void>}
   */
  async printFinalStats() {
    console.log('\nPopulation Statistics:')
    console.log(`   Total processed: ${this.stats.totalProcessed}`)
    console.log(`   New content added: ${this.stats.newAdded}`)
    console.log(`   Content updated: ${this.stats.updated}`)
    console.log(`   Content merged: ${this.stats.merged}`)
    console.log(`   Errors: ${this.stats.errors}`)
    console.log(`   Skipped: ${this.stats.skipped}`)

    const { totalContent, tmdbOnlyContent, malOnlyContent, mergedContent, movies, tvShows, specials } =
      await catalogStats()

    console.log('\nDatabase Statistics:')
    console.log(`   Total content: ${totalContent}`)
    console.log(`   TMDB-only content: ${tmdbOnlyContent}`)
    console.log(`   MAL-only content: ${malOnlyContent}`)
    console.log(`   Merged content: ${mergedContent}`)

    console.log('\nContent Type Breakdown:')
    console.log(`   Movies: ${movies}`)
    console.log(`   TV Shows: ${tvShows}`)
    console.log(`   Specials: ${specials}`)
  }
}

/**
 * Upsert MAL ranking rows so catalog tabs have titles that overall popularity
 * sync does not ingest.
 * @param {string} rankingType - MAL `ranking_type` (`upcoming` or `airing`).
 * @param {number} [limit=50]
 * @param {string[]} [allowedTypes=['tv']] - Content types to keep.
 * @returns {Promise<number>} Newly inserted documents.
 */
export async function ingestMalRankingByTypes(rankingType, limit = 50, allowedTypes = ['tv']) {
  const rows = await unifiedContentService.getMalRanking(rankingType, limit)
  let inserted = 0

  for (const row of rows) {
    const contentData = unifiedContentService.convertMalToContent(row)
    if (!contentData || !allowedTypes.includes(contentData.contentType) || !contentData.malId) {
      continue
    }

    const existing = await Content.findOne({ malId: contentData.malId })
    if (existing) {
      let changed = false
      if (contentData.malStatus && existing.malStatus !== contentData.malStatus) {
        existing.malStatus = contentData.malStatus
        changed = true
      }
      if (contentData.releaseDate && !existing.releaseDate) {
        existing.releaseDate = contentData.releaseDate
        changed = true
      }
      if (changed) await existing.save()
      continue
    }

    contentData.userRatingAverage = null
    contentData.userRatingCount = 0
    contentData.userRatingSum = 0
    if (contentData.malScore) contentData.unifiedScore = contentData.malScore

    await Content.create(contentData)
    inserted++
  }

  return inserted
}

/**
 * Upsert TMDB now-playing animation movies so the theatres tab has titles
 * that overall popularity sync does not ingest.
 * @param {number} [limit=40]
 * @returns {Promise<number>} Newly inserted movie documents.
 */
export async function ingestTmdbNowPlayingMovies(limit = 40) {
  const rows = await unifiedContentService.getTmdbNowPlayingAnimatedMovies(limit)
  let inserted = 0

  for (const row of rows) {
    const details = await unifiedContentService.getTmdbContentDetails(row.id, 'movie')
    if (!details) continue

    const contentData = unifiedContentService.convertTmdbToContent(details, 'movie', {
      minVoteCount: 0,
    })
    if (!contentData?.tmdbId) continue

    const existing = await Content.findOne({ tmdbId: contentData.tmdbId })
    if (existing) {
      let changed = false
      if (contentData.releaseDate && existing.releaseDate !== contentData.releaseDate) {
        existing.releaseDate = contentData.releaseDate
        changed = true
      }
      if (contentData.studios?.length && !(existing.studios || []).length) {
        existing.studios = contentData.studios
        existing.studioRefs = contentData.studioRefs
        changed = true
      }
      if (changed) await existing.save()
      continue
    }

    contentData.userRatingAverage = null
    contentData.userRatingCount = 0
    contentData.userRatingSum = 0
    if (contentData.voteAverage) contentData.unifiedScore = contentData.voteAverage

    await Content.create(contentData)
    inserted++
  }

  return inserted
}

export default DatabasePopulator
