/**
 * Persists TMDB and MyAnimeList catalog rows into PostgreSQL Content documents.
 * Domain service used by the populateUnified CLI and the hourly contentSyncScheduler.
 * Dedup is title/type based (external IDs are reference-only, except conflicting ids block a merge). Merges combine MAL + TMDB
 * without clobbering user ratings; unifiedScore is vote-weighted across sources.
 */
import { connectPostgres, closePostgres, query } from '../../config/postgres.js'
import Content, { catalogStats } from '../models/Content.js'
import unifiedContentService from './unifiedContentService.js'
import relationshipService from './relationshipService.js'
import { runCatalogMaintenance } from './catalogMaintenance.js'
import { importSeries } from './catalogImport.js'
import { loadFribbIndex } from './fribbService.js'
import { attachTvEntry, hasSeriesStructure } from './seriesStructure.js'
import { fribbEntryFor, fribbSiblingIds } from '../utils/fribb.js'
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
    const pages = Math.ceil(limit / 40) // a TMDB discover page: 20 movies, then 20 shows

    for (let page = 1; page <= pages && processed < limit; page++) {
      try {
        console.log(`Processing TMDB page ${page}/${pages}`)

        const movies = await unifiedContentService.getTmdbAnimatedMovies(page)
        for (const movie of movies) {
          if (processed >= limit) break
          await this.saveTmdbContent(movie, 'movie')
          processed++
        }

        const tvShows = await unifiedContentService.getTmdbAnimatedTVShows(page)
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
   * @param {{ minVoteCount?: number, importDetails?: boolean }} [options] - `minVoteCount`:
   *   fewest TMDB votes a title needs (default 50); `importDetails: false` leaves a new
   *   show's seasons to the caller (see `placeNewSeries`).
   * @returns {Promise<{ outcome: 'added' | 'merged' | 'updated' | 'skipped' | 'failed', contentId?: string }>}
   */
  async saveTmdbContent(tmdbData, contentType, { minVoteCount, importDetails = true } = {}) {
    try {
      this.stats.totalProcessed++

      const detailedTmdbData = await unifiedContentService.getTmdbContentDetails(
        tmdbData.id,
        contentType,
      )
      if (!detailedTmdbData) {
        console.log(`Could not get detailed info for TMDB ${contentType}: ${tmdbData.title}`)
        this.stats.skipped++
        return { outcome: 'skipped' }
      }

      const contentData = unifiedContentService.convertTmdbToContent(
        detailedTmdbData,
        contentType,
        minVoteCount == null ? {} : { minVoteCount },
      )

      // convertTmdbToContent returns null when votes are under the ingest threshold
      if (!contentData) {
        this.stats.skipped++
        return { outcome: 'skipped' }
      }

      // Prefer stable upsert by tmdbId before fuzzy title matching
      if (contentData.tmdbId) {
        const existingByTmdb = await Content.findOne({ tmdbId: contentData.tmdbId })
        if (existingByTmdb && (await this.hasSeasons(existingByTmdb))) {
          // A show with seasons is imported by source priority (catalogImport.js);
          // the hourly pass only refreshes what TMDB alone says about it.
          await this.refreshTmdbFields(existingByTmdb, contentData)
          this.stats.updated++
          return { outcome: 'updated', contentId: String(existingByTmdb._id) }
        }
        if (existingByTmdb) {
          await this.mergeTmdbIntoExisting(existingByTmdb, contentData)
          this.stats.updated++
          console.log(`Updated TMDB content: ${contentData.title}`)
          return { outcome: 'updated', contentId: String(existingByTmdb._id) }
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
          return { outcome: 'merged', contentId: String(existingContent._id) }
        }
        return { outcome: 'skipped' }
      }

      // AniList knows the MAL entry for an anime TMDB lists under another name.
      const anilistMatch = await this.findAnilistMatchForTmdb(contentData)
      const anilistData = anilistMatch ? convertAnilistToContent(anilistMatch) : null
      const malOwner = anilistData?.malId
        ? await Content.findOne({ malId: anilistData.malId })
        : null
      if (malOwner?.contentType === 'season') {
        // TMDB's show is the season's series.
        await query(
          `UPDATE content SET tmdb_id = $2, updated_at = now() WHERE id = $1 AND tmdb_id IS NULL
             AND NOT EXISTS (SELECT 1 FROM content o WHERE o.kind = 'series' AND o.tmdb_id = $2)`,
          [malOwner.seriesId, contentData.tmdbId],
        )
        this.stats.merged++
        return { outcome: 'merged', contentId: String(malOwner.seriesId) }
      }
      if (malOwner && !malOwner.tmdbId) {
        await this.mergeTmdbIntoExisting(malOwner, contentData, { save: false })
        await this.mergeAnilistIntoExisting(malOwner, anilistData)
        this.stats.merged++
        console.log(`Merged TMDB data into MAL title via AniList: ${contentData.title}`)
        return { outcome: 'merged', contentId: String(malOwner._id) }
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
      await this.placeNewSeries(newContent, { importDetails })
      this.stats.newAdded++
      console.log(`Added TMDB ${contentType}: ${contentData.title}`)
      return { outcome: 'added', contentId: String(newContent._id) }
    } catch (error) {
      console.error(`Error saving TMDB content:`, error.message)
      this.stats.errors++
      return { outcome: 'failed' }
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

    // A TV entry may already be stored as a season of its show.
    const types = contentData.contentType === 'tv' ? ['tv', 'season'] : [contentData.contentType]
    const candidates = await Content.find({
      $or: titleOr,
      contentType: { $in: types },
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
      console.log(`External ID mismatch: ${newContent.title} vs ${existingContent.title}`)
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

    const listedAs = (content) => (content.contentType === 'season' ? 'tv' : content.contentType)
    if (listedAs(newContent) !== listedAs(existingContent)) {
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
          await this.placeNewSeries(newContent)
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
   * Whether a row is a series with stored seasons (after the series migration).
   * @param {object} content
   * @returns {Promise<boolean>}
   */
  async hasSeasons(content) {
    if (content.contentType !== 'tv') return false
    const { rows } = await query('SELECT 1 FROM seasons WHERE series_id = $1 LIMIT 1', [
      content._id,
    ])
    return rows.length > 0
  }

  /**
   * Update what only TMDB says about a show with seasons: its score, votes,
   * popularity, and backdrop.
   * @param {object} existing - Series document
   * @param {object} tmdbData - Converted Content-shaped TMDB object
   * @returns {Promise<void>}
   */
  async refreshTmdbFields(existing, tmdbData) {
    existing.voteAverage = tmdbData.voteAverage
    existing.voteCount = tmdbData.voteCount
    existing.popularity = tmdbData.popularity
    if (tmdbData.backdropPath) existing.backdropPath = tmdbData.backdropPath
    await existing.save()
  }

  /**
   * Put a title this sync just added into the series structure (`placeNewTvEntry`).
   * @param {object} content - The saved document
   * @param {{ importDetails?: boolean }} [options]
   * @returns {Promise<void>}
   */
  async placeNewSeries(content, options) {
    await placeNewTvEntry(content, options)
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
    const hasMalStudios =
      Boolean(existingContent.malId) && (existingContent.studios || []).length > 0
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

    const {
      totalContent,
      tmdbOnlyContent,
      malOnlyContent,
      mergedContent,
      movies,
      tvShows,
      specials,
    } = await catalogStats()

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
 * Put a TV title just added from any source into the series structure: an anime TV
 * entry becomes a season of its show (seriesStructure.js `attachTvEntry`), and every new
 * show is imported with its seasons and episodes. Before the series migration this
 * does nothing. Failures are logged, never thrown.
 * @param {object} content - The saved document
 * @param {{ importDetails?: boolean }} [options] - `false` skips the import (seasons,
 *   episodes), which the six-hourly refresh or `db:reload` then fills.
 * @returns {Promise<void>}
 */
export async function placeNewTvEntry(content, { importDetails = true } = {}) {
  if (content?.contentType !== 'tv') return
  try {
    if (!(await hasSeriesStructure())) return
    const index = await loadFribbIndex()
    const entry = fribbEntryFor(index, content)
    const siblings = fribbSiblingIds(index, entry)
    const seriesId =
      (await attachTvEntry(String(content._id), { entry, siblings })) || String(content._id)
    if (importDetails) await importSeries(seriesId)
  } catch (error) {
    console.error(`Placing ${content.title} in its series failed:`, error.message)
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

    const created = await Content.create(contentData)
    if (created.contentType === 'tv') {
      // Its sequel/prequel links first, so a new season finds its show.
      await relationshipService.populateRelationshipsFromMAL(created).catch(() => {})
      await placeNewTvEntry(created, { importDetails: false })
    }
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
