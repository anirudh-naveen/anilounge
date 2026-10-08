/**
 * TMDB and MyAnimeList adapters that map animation catalog payloads into Content-shaped objects.
 * Domain service: discovery/ranking fetches, TMDB title search, type mapping (OVA/special → special),
 * airing-schedule refresh, and episode data.
 * Does not persist; contentSyncService writes the converted documents.
 *
 * API references: https://developer.themoviedb.org/docs/getting-started
 * https://myanimelist.net/apiconfig/references/api/v2
 */
import axios from 'axios'
import dotenv from 'dotenv'
import {
  mapMalEpisode,
  mapSeriesCast,
  mapTmdbEpisode,
  mapTmdbSeason,
  tmdbSeasonNumbers,
} from '../utils/episodes.js'
import { buildTitleFields } from '../utils/titles.js'
import { MAL_ORIGIN_COUNTRIES, extractOriginCountries } from '../utils/originCountries.js'
import { parseMalDate } from '../utils/malDates.js'

dotenv.config()

const MAL_ANIME_FIELDS =
  'id,title,main_picture,alternative_titles,synopsis,mean,rank,popularity,num_episodes,status,start_season,start_date,end_date,studios,genres,rating,source,num_list_users,num_scoring_users,media_type,broadcast'

const MAL_SPECIAL_TYPES = new Set(['ova', 'special'])

const EPISODE_CACHE_MAX = 500

/** Runtimes (minutes) for well-known films MAL lists without one. */
const KNOWN_MOVIE_RUNTIMES = Object.entries({
  'Gintama: The Final': 104,
  'Gintama: The Very Final': 104,
  'Demon Slayer: Kimetsu no Yaiba - The Movie: Mugen Train': 117,
  'Demon Slayer: Mugen Train': 117,
  'Your Name': 106,
  'Kimi no Na wa': 106,
  'Spirited Away': 125,
  'Sen to Chihiro no Kamikakushi': 125,
  'Princess Mononoke': 134,
  'Mononoke-hime': 134,
  "Howl's Moving Castle": 119,
  'Hauru no Ugoku Shiro': 119,
  'My Neighbor Totoro': 86,
  'Tonari no Totoro': 86,
  "Kiki's Delivery Service": 103,
  'Majo no Takkyuubin': 103,
  'Castle in the Sky': 125,
  'Tenkuu no Shiro Laputa': 125,
  'The Wind Rises': 126,
  'Kaze Tachinu': 126,
  Ponyo: 101,
  'Gake no Ue no Ponyo': 101,
  'The Tale of Princess Kaguya': 137,
  'Kaguya-hime no Monogatari': 137,
  'When Marnie Was There': 103,
  'Omoide no Marnie': 103,
  'The Red Turtle': 80,
  'La Tortue Rouge': 80,
  'A Silent Voice': 130,
  'Koe no Katachi': 130,
  'Weathering with You': 112,
  'Tenki no Ko': 112,
  Suzume: 122,
  'Suzume no Tojimari': 122,
  'Perfect Blue': 81,
  'Millennium Actress': 87,
  'Tokyo Godfathers': 92,
  Paprika: 90,
  'Wolf Children': 117,
  'Ookami Kodomo no Ame to Yuki': 117,
  'The Boy and the Heron': 124,
  'Kimitachi wa Dou Ikiru ka': 124,
  'The Girl Who Leapt Through Time': 98,
  'Toki wo Kakeru Shoujo': 98,
  'Summer Wars': 114,
  'The Secret World of Arrietty': 94,
  'Karigurashi no Arrietty': 94,
  'From Up on Poppy Hill': 91,
  'Kokuriko-zaka Kara': 91,
}).map(([title, runtime]) => ({ title, key: title.toLowerCase(), runtime }))

class UnifiedContentService {
  constructor() {
    this.tmdbApiKey = process.env.TMDB_API_KEY
    this.malClientId = process.env.MAL_CLIENT_ID
    this.malClientSecret = process.env.MAL_CLIENT_SECRET

    this.tmdbBaseURL = 'https://api.themoviedb.org/3'
    this.malBaseURL = 'https://api.myanimelist.net/v2'

    this.tmdbDelay = parseInt(process.env.TMDB_DELAY_MS) || 200
    this.malDelay = parseInt(process.env.MAL_DELAY_MS) || 300

    this.tmdbClient = axios.create({
      baseURL: this.tmdbBaseURL,
      timeout: 30000,
    })

    this.malClient = axios.create({
      baseURL: this.malBaseURL,
      headers: {
        'X-MAL-CLIENT-ID': this.malClientId,
      },
      timeout: 30000,
    })

    this.hasTmdbKey = !!this.tmdbApiKey
    this.hasMalKey = !!this.malClientId
    this.episodeCache = new Map()
    /** Earliest time the next call to each provider may start (see `throttle`). */
    this.nextSlot = { tmdb: 0, mal: 0 }
  }

  /**
   * Wait for this provider's next free slot. Slots are spaced TMDB_DELAY_MS / MAL_DELAY_MS
   * apart across every caller in the process, so concurrent searches and syncs together
   * stay under the provider's rate limit (a per-call sleep only spaced one caller's calls).
   * @param {'tmdb' | 'mal'} provider
   * @returns {Promise<void>}
   */
  async throttle(provider) {
    const interval = provider === 'tmdb' ? this.tmdbDelay : this.malDelay
    const now = Date.now()
    const at = Math.max(now, this.nextSlot[provider])
    this.nextSlot[provider] = at + interval
    if (at > now) await this.delay(at - now)
  }

  /**
   * Opaque catalog key. Uniqueness comes from timestamp + random suffix; not used for dedup.
   * @param {{ englishTitle?: string, title?: string, nativeTitle?: string, originalTitle?: string, contentType?: string, tmdbId?: number, malId?: number }} contentData
   * @returns {string}
   */
  generateInternalId(contentData) {
    const titleSlug = (
      contentData.englishTitle ||
      contentData.title ||
      contentData.nativeTitle ||
      contentData.originalTitle ||
      'unknown'
    )
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '-')
      .substring(0, 50)
    const contentType = contentData.contentType || 'unknown'
    const tmdbPart = contentData.tmdbId ? `tmdb-${contentData.tmdbId}` : ''
    const malPart = contentData.malId ? `mal-${contentData.malId}` : ''
    const externalPart = [tmdbPart, malPart].filter(Boolean).join('-')

    const timestamp = Date.now()
    const random = Math.random().toString(36).substring(2, 8)

    return `${contentType}-${titleSlug}${externalPart ? `-${externalPart}` : ''}-${timestamp}-${random}`
  }

  /**
   * Pause between upstream calls to stay under TMDB/MAL rate limits.
   * @param {number} ms
   * @returns {Promise<void>}
   */
  async delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms))
  }

  /**
   * Discover TMDB animation (genre 16), popularity descending.
   * @param {'movie' | 'tv'} type
   * @param {number} page
   * @param {number} limit
   * @returns {Promise<object[]>}
   */
  async discoverTmdbAnimated(type, page, limit) {
    if (!this.hasTmdbKey) {
      console.log('TMDB API key not configured')
      return []
    }

    try {
      await this.throttle('tmdb')
      const response = await this.tmdbClient.get(`/discover/${type}`, {
        params: {
          api_key: this.tmdbApiKey,
          with_genres: '16', // Animation genre
          sort_by: 'popularity.desc',
          page,
          include_adult: false,
        },
      })

      return response.data.results.slice(0, limit)
    } catch (error) {
      console.error(`TMDB animated ${type} error:`, error.response?.data || error.message)
      return []
    }
  }

  /**
   * Discover TMDB animation movies (genre 16), popularity descending.
   * @param {number} [page=1]
   * @param {number} [limit=20]
   * @returns {Promise<object[]>}
   */
  getTmdbAnimatedMovies(page = 1, limit = 20) {
    return this.discoverTmdbAnimated('movie', page, limit)
  }

  /**
   * TMDB movies currently in theatres, filtered to animation (genre 16).
   * @param {number} [limit=40]
   * @returns {Promise<object[]>}
   */
  async getTmdbNowPlayingAnimatedMovies(limit = 40) {
    if (!this.hasTmdbKey) {
      console.log('TMDB API key not configured')
      return []
    }

    const collected = []
    try {
      for (let page = 1; page <= 5 && collected.length < limit; page++) {
        await this.throttle('tmdb')
        const response = await this.tmdbClient.get('/movie/now_playing', {
          params: {
            api_key: this.tmdbApiKey,
            page,
            include_adult: false,
          },
        })
        const results = response.data.results || []
        for (const movie of results) {
          if ((movie.genre_ids || []).includes(16)) collected.push(movie)
          if (collected.length >= limit) break
        }
        if (page >= (response.data.total_pages || 1)) break
      }
    } catch (error) {
      console.error(
        'TMDB now-playing animated movies error:',
        error.response?.data || error.message,
      )
    }

    return collected.slice(0, limit)
  }

  /**
   * Discover TMDB animation TV (genre 16), popularity descending.
   * @param {number} [page=1]
   * @param {number} [limit=20]
   * @returns {Promise<object[]>}
   */
  getTmdbAnimatedTVShows(page = 1, limit = 20) {
    return this.discoverTmdbAnimated('tv', page, limit)
  }

  /**
   * Full TMDB movie/TV document plus alternative_titles for English/native mapping.
   * @param {number} tmdbId
   * @param {'movie' | 'tv'} contentType
   * @param {{ skipDelay?: boolean }} [options]
   * @returns {Promise<object | null>}
   */
  async getTmdbContentDetails(tmdbId, contentType, { skipDelay = false } = {}) {
    if (!this.hasTmdbKey) return null

    try {
      if (!skipDelay) await this.throttle('tmdb')
      const endpoint = contentType === 'movie' ? '/movie' : '/tv'
      const response = await this.tmdbClient.get(`${endpoint}/${tmdbId}`, {
        params: {
          api_key: this.tmdbApiKey,
          append_to_response: 'alternative_titles',
        },
      })

      return response.data
    } catch (error) {
      console.error(`TMDB ${contentType} details error:`, error.response?.data || error.message)
      return null
    }
  }

  /**
   * MAL ranking page over-fetched then filtered to movies/OVA/specials by episode count and title keywords.
   * @param {number} [limit=50]
   * @param {number} [offset=0]
   * @returns {Promise<object[]>}
   */
  async getMalTopAnimeMovies(limit = 50, offset = 0) {
    if (!this.hasMalKey) {
      console.log('MAL API key not configured')
      return []
    }

    try {
      await this.throttle('mal')
      const response = await this.malClient.get('/anime/ranking', {
        params: {
          ranking_type: 'all',
          limit: Math.min(limit * 3, 300),
          offset,
          fields: MAL_ANIME_FIELDS,
        },
      })

      const allAnime = response.data.data || []
      const movies = allAnime
        .filter((anime) => {
          const episodes = anime.num_episodes || 0
          const title = anime.title?.toLowerCase() || ''

          // MAL ranking is mixed; treat 1-episode, movie/film/ova/special titles, or finished 0-ep as movie-like
          return (
            episodes === 1 ||
            title.includes('movie') ||
            title.includes('film') ||
            title.includes('ova') ||
            title.includes('special') ||
            (episodes === 0 && anime.status === 'finished_airing')
          )
        })
        .slice(0, limit)

      return movies
    } catch (error) {
      console.error('MAL top anime movies error:', error.response?.data || error.message)
      return []
    }
  }

  /**
   * MAL overall ranking page (unfiltered by media type).
   * @param {number} [limit=50]
   * @param {number} [offset=0]
   * @returns {Promise<object[]>}
   */
  async getMalTopAnime(limit = 50, offset = 0) {
    return this.getMalRanking('all', limit, offset)
  }

  /**
   * MAL anime ranking page (`all`, `airing`, `upcoming`, `tv`, …).
   * @param {string} [rankingType='all']
   * @param {number} [limit=50]
   * @param {number} [offset=0]
   * @returns {Promise<object[]>}
   */
  async getMalRanking(rankingType = 'all', limit = 50, offset = 0) {
    if (!this.hasMalKey) {
      console.log('MAL API key not configured')
      return []
    }

    try {
      await this.throttle('mal')
      const response = await this.malClient.get('/anime/ranking', {
        params: {
          ranking_type: rankingType,
          limit: Math.min(limit, 100),
          offset,
          fields: MAL_ANIME_FIELDS,
        },
      })

      return response.data.data || []
    } catch (error) {
      console.error(`MAL ${rankingType} ranking error:`, error.response?.data || error.message)
      return []
    }
  }

  /**
   * Single MAL anime document for the configured field set.
   * @param {number} malId
   * @param {{ skipDelay?: boolean, extraFields?: string[] }} [options]
   * @returns {Promise<object | null>}
   */
  async getMalAnimeDetails(malId, { skipDelay = false, extraFields = [] } = {}) {
    if (!this.hasMalKey) return null

    try {
      if (!skipDelay) await this.throttle('mal')
      const response = await this.malClient.get(`/anime/${malId}`, {
        params: {
          fields: [MAL_ANIME_FIELDS, ...extraFields].join(','),
        },
      })

      return response.data
    } catch (error) {
      console.error('MAL anime details error:', error.response?.data || error.message)
      return null
    }
  }

  /**
   * Flatten TMDB alternative_titles.titles or .results into strings.
   * @param {object} tmdbData
   * @returns {string[]}
   */
  collectTmdbAlternativeTitles(tmdbData) {
    const block = tmdbData.alternative_titles
    if (!block) return []
    const list = block.titles || block.results || []
    return list.map((entry) => entry?.title).filter(Boolean)
  }

  /**
   * Map a TMDB movie/TV payload onto a Content-shaped object.
   * Drops titles with fewer than `minVoteCount` votes or a missing vote average.
   * @param {object} tmdbData
   * @param {'movie' | 'tv'} contentType
   * @param {{ minVoteCount?: number }} [options]
   * @returns {object | null}
   */
  convertTmdbToContent(tmdbData, contentType, { minVoteCount = 50 } = {}) {
    if (
      minVoteCount > 0 &&
      (!tmdbData.vote_count || tmdbData.vote_count < minVoteCount || !tmdbData.vote_average)
    ) {
      return null
    }

    const titleFields = buildTitleFields({
      englishTitle: tmdbData.title || tmdbData.name,
      nativeTitle: tmdbData.original_title || tmdbData.original_name,
      fallbackTitle: tmdbData.title || tmdbData.name,
      alternativeTitles: this.collectTmdbAlternativeTitles(tmdbData),
    })

    const content = {
      ...titleFields,
      overview: tmdbData.overview,
      contentType,
      posterPath: tmdbData.poster_path,
      backdropPath: tmdbData.backdrop_path,
      releaseDate: tmdbData.release_date || tmdbData.first_air_date,
      voteAverage: tmdbData.vote_average,
      voteCount: tmdbData.vote_count,
      popularity: tmdbData.popularity,
      tmdbId: tmdbData.id,
      genres: tmdbData.genres || [],
      productionCompanies: tmdbData.production_companies?.map((company) => company.name) || [],
      studios: tmdbData.production_companies?.map((company) => company.name) || [],
      studioRefs:
        tmdbData.production_companies?.map((company) => ({
          name: company.name,
          tmdbId: company.id,
          imagePath: company.logo_path || undefined,
        })) || [],
      originCountries: extractOriginCountries(tmdbData),
      dataSources: {
        tmdb: {
          hasData: true,
          lastUpdated: new Date(),
        },
      },
    }

    if (contentType === 'movie') {
      content.runtime = tmdbData.runtime
    } else {
      content.episodeCount = tmdbData.number_of_episodes
      content.seasonCount = tmdbData.number_of_seasons
      content.lastAirDate = tmdbData.last_air_date || null
      const nextEpisode = tmdbData.next_episode_to_air
      content.nextEpisodeAirDate = nextEpisode?.air_date || null
      content.nextEpisodeNumber = nextEpisode?.episode_number ?? null
      content.nextEpisodeSeason = nextEpisode?.season_number ?? null
    }

    content.internalId = this.generateInternalId(content)

    return content
  }

  /**
   * MAL OVA and special media_type values collapse to contentType `special`.
   * @param {string} mediaType
   * @returns {boolean}
   */
  isMalSpecialType(mediaType) {
    return MAL_SPECIAL_TYPES.has(String(mediaType || '').toLowerCase())
  }

  /**
   * Map MAL media_type / episode count onto movie, tv, or special.
   * Unknown types with 1 finished episode are treated as movies; otherwise TV.
   * @param {object} anime
   * @returns {'movie' | 'tv' | 'special'}
   */
  resolveMalContentType(anime) {
    const mediaType = String(anime.media_type || '').toLowerCase()
    if (this.isMalSpecialType(mediaType)) return 'special'
    if (mediaType === 'movie') return 'movie'
    if (mediaType === 'tv') return 'tv'

    const episodes = anime.num_episodes || 0
    const isMovie = episodes === 1 && anime.status === 'finished_airing'
    return isMovie ? 'movie' : 'tv'
  }

  /**
   * Map a MAL ranking/search node onto a Content-shaped object.
   * Drops music videos. English/native come from alternative_titles.en/ja.
   * @param {object} malData - Ranking wrapper `{ node }` or a raw anime document
   * @returns {object | null}
   */
  convertMalToContent(malData) {
    const anime = malData.node || malData

    if (anime.source === 'music' || String(anime.media_type || '').toLowerCase() === 'music') {
      return null
    }

    const episodes = anime.num_episodes || 0
    const finalContentType = this.resolveMalContentType(anime)
    const malMediaType = String(anime.media_type || '').toLowerCase() || undefined

    const alternativeTitles = anime.alternative_titles || {}
    const synonyms = Array.isArray(alternativeTitles.synonyms) ? alternativeTitles.synonyms : []
    const titleFields = buildTitleFields({
      englishTitle: alternativeTitles.en,
      nativeTitle: alternativeTitles.ja,
      fallbackTitle: anime.title,
      alternativeTitles: [anime.title, ...synonyms],
    })

    const content = {
      ...titleFields,
      overview: anime.synopsis || '',
      contentType: finalContentType,
      posterPath: anime.main_picture?.medium || anime.main_picture?.large,
      malId: anime.id,
      malScore: anime.mean,
      malScoredBy: anime.num_scoring_users,
      malRank: anime.rank,
      malStatus: anime.status,
      malEpisodes: anime.num_episodes,
      broadcastDay: anime.broadcast?.day_of_the_week || undefined,
      broadcastTime: anime.broadcast?.start_time || undefined,
      malMediaType: ['unknown', 'tv', 'ova', 'movie', 'special', 'ona', 'music'].includes(
        malMediaType,
      )
        ? malMediaType
        : undefined,
      malSource: anime.source,
      malRating: anime.rating,
      genres: anime.genres?.map((genre) => ({ id: genre.id, name: genre.name })) || [],
      studios: anime.studios?.map((studio) => studio.name) || [],
      studioRefs: anime.studios?.map((studio) => ({ name: studio.name, malId: studio.id })) || [],
      originCountries: [...MAL_ORIGIN_COUNTRIES],
      dataSources: {
        mal: {
          hasData: true,
          lastUpdated: new Date(),
        },
      },
    }

    if (anime.start_season) {
      const year = anime.start_season.year
      const season = String(anime.start_season.season || '').toLowerCase()
      if (year) {
        content.startSeasonYear = year
        if (['winter', 'spring', 'summer', 'fall'].includes(season)) {
          content.startSeason = season
        }
      }
    }

    const malStart = parseMalDate(anime.start_date)
    if (malStart) content.releaseDate = malStart
    const malEnd = parseMalDate(anime.end_date, { bound: 'end' })
    if (malEnd) content.lastAirDate = malEnd

    if (finalContentType === 'movie') {
      content.runtime = this.getEstimatedRuntime(anime.title)
    } else {
      content.episodeCount = episodes
    }

    content.internalId = this.generateInternalId(content)

    return content
  }

  /**
   * Runtime for MAL movies when TMDB minutes are missing: known-title table, then studio-family defaults, else 90.
   * @param {string} title
   * @returns {number} Minutes
   */
  getEstimatedRuntime(title) {
    const titleLower = title.toLowerCase()
    const known =
      KNOWN_MOVIE_RUNTIMES.find((entry) => entry.title === title) ||
      KNOWN_MOVIE_RUNTIMES.find(
        (entry) => titleLower.includes(entry.key) || entry.key.includes(titleLower),
      )
    if (known) return known.runtime

    if (
      titleLower.includes('ghibli') ||
      titleLower.includes('miyazaki') ||
      titleLower.includes('mononoke') ||
      titleLower.includes('spirited away') ||
      titleLower.includes('howl') ||
      titleLower.includes('totoro') ||
      titleLower.includes('kiki') ||
      titleLower.includes('castle in the sky') ||
      titleLower.includes('ponyo') ||
      titleLower.includes('arrietty') ||
      titleLower.includes('poppy hill') ||
      titleLower.includes('marnie') ||
      titleLower.includes('kaguya') ||
      titleLower.includes('red turtle')
    ) {
      return 110
    }

    if (
      titleLower.includes('your name') ||
      titleLower.includes('weathering') ||
      titleLower.includes('suzume') ||
      titleLower.includes('shinkai')
    ) {
      return 110
    }

    if (
      titleLower.includes('perfect blue') ||
      titleLower.includes('millennium actress') ||
      titleLower.includes('tokyo godfathers') ||
      titleLower.includes('paprika') ||
      titleLower.includes('kon')
    ) {
      return 90
    }

    if (
      titleLower.includes('wolf children') ||
      titleLower.includes('summer wars') ||
      titleLower.includes('girl who leapt') ||
      titleLower.includes('boy and the heron') ||
      titleLower.includes('hosoda')
    ) {
      return 110
    }

    if (
      titleLower.includes('demon slayer') ||
      titleLower.includes('kimetsu no yaiba') ||
      titleLower.includes('mugen train')
    ) {
      return 117
    }

    if (
      titleLower.includes('gintama') &&
      (titleLower.includes('final') || titleLower.includes('movie'))
    ) {
      return 104
    }

    return 90
  }

  /**
   * TMDB movie/TV search limited to animation (genre id 16).
   * @param {string} query
   * @param {string} contentType
   * @param {number} limit
   * @returns {Promise<object[]>}
   */
  async searchTmdb(query, contentType, limit) {
    if (!this.hasTmdbKey) return []

    const results = []
    const searchLimit = Math.ceil(limit / 2)
    const types = ['movie', 'tv'].filter((type) => contentType === 'all' || contentType === type)

    try {
      for (const type of types) {
        await this.throttle('tmdb')
        const response = await this.tmdbClient.get(`/search/${type}`, {
          params: {
            api_key: this.tmdbApiKey,
            query,
            include_adult: false,
          },
        })
        results.push(
          ...response.data.results
            .filter((item) => this.isAnimatedContent(item))
            .map((item) => this.convertTmdbToContent(item, type))
            .filter((item) => item !== null)
            .slice(0, searchLimit),
        )
      }

      return results
    } catch (error) {
      console.error('TMDB search error:', error.response?.data || error.message)
      return []
    }
  }

  /**
   * TMDB list/search items include genre_ids; 16 is Animation.
   * @param {{ genre_ids?: number[] }} content
   * @returns {boolean}
   */
  isAnimatedContent(content) {
    if (!content.genre_ids) return false

    return content.genre_ids.includes(16)
  }

  /**
   * Whether a TV title needs a live MAL/TMDB airing-schedule refresh.
   * Currently airing/upcoming shows refresh when the next air time is missing or stale.
   * @param {object} content
   * @returns {boolean}
   */
  needsAiringRefresh(content) {
    if (!content || content.contentType !== 'tv') return false
    if (content.malStatus === 'finished_airing') return false

    const now = Date.now()
    const updatedAt = content.airingUpdatedAt ? new Date(content.airingUpdatedAt).getTime() : 0
    const fresh = updatedAt > 0 && now - updatedAt < 6 * 60 * 60 * 1000
    const nextTs = content.nextEpisodeAirDate ? new Date(content.nextEpisodeAirDate).getTime() : 0
    const hasFutureEpisode = nextTs > now
    const hasWeekly =
      Boolean(content.broadcastDay) && String(content.broadcastDay).toLowerCase() !== 'other'

    if (fresh && (hasFutureEpisode || hasWeekly)) return false
    return true
  }

  /**
   * Overlay MAL broadcast + TMDB next-episode fields onto a Content document.
   * Caller persists. Returns true when any airing field changed.
   * @param {object} content - Mongoose Content document
   * @returns {Promise<boolean>}
   */
  async refreshAiringSchedule(content) {
    if (!this.needsAiringRefresh(content)) return false

    let updated = false
    // Independent lookups; the page view is waiting on them.
    const [mal, tmdb] = await Promise.all([
      content.malId ? this.getMalAnimeDetails(content.malId, { skipDelay: true }) : null,
      content.tmdbId ? this.getTmdbContentDetails(content.tmdbId, 'tv', { skipDelay: true }) : null,
    ])

    if (mal) {
      if (mal.status) content.malStatus = mal.status
      if (mal.num_episodes != null) content.malEpisodes = mal.num_episodes
      content.broadcastDay = mal.broadcast?.day_of_the_week || null
      content.broadcastTime = mal.broadcast?.start_time || null
      updated = true
    }

    if (tmdb) {
      const next = tmdb.next_episode_to_air
      content.nextEpisodeAirDate = next?.air_date || null
      content.nextEpisodeNumber = next?.episode_number ?? null
      content.nextEpisodeSeason = next?.season_number ?? null
      if (tmdb.number_of_episodes != null) content.episodeCount = tmdb.number_of_episodes
      if (tmdb.number_of_seasons != null) content.seasonCount = tmdb.number_of_seasons
      updated = true
    }

    if (updated) {
      content.airingUpdatedAt = new Date()
    }

    return updated
  }

  /**
   * Run async work over items with a fixed parallel batch size.
   * @template T, R
   * @param {T[]} items
   * @param {number} concurrency
   * @param {(item: T) => Promise<R>} mapper
   * @returns {Promise<R[]>}
   */
  async mapWithConcurrency(items, concurrency, mapper) {
    const results = []
    const size = Math.max(1, concurrency)
    for (let index = 0; index < items.length; index += size) {
      const batch = items.slice(index, index + size)
      results.push(...(await Promise.all(batch.map(mapper))))
    }
    return results
  }

  /**
   * Cached episodes + season summaries for a catalog id, or null when missing/expired.
   * @param {string} contentId
   * @returns {{ episodes: object[], seasons: object[] } | null}
   */
  getCachedEpisodes(contentId) {
    const entry = this.episodeCache.get(String(contentId))
    if (!entry) return null
    if (Date.now() > entry.expiresAt) {
      this.episodeCache.delete(String(contentId))
      return null
    }
    return entry.data
  }

  /**
   * Store episodes + season summaries until `ttlMs` elapses.
   * @param {string} contentId
   * @param {{ episodes: object[], seasons: object[] }} data
   * @param {number} ttlMs
   */
  setCachedEpisodes(contentId, data, ttlMs) {
    const key = String(contentId)
    this.episodeCache.delete(key)
    this.episodeCache.set(key, { data, expiresAt: Date.now() + ttlMs })
    // Oldest first: drop one so every title viewed doesn't stay in memory for good.
    if (this.episodeCache.size > EPISODE_CACHE_MAX) {
      this.episodeCache.delete(this.episodeCache.keys().next().value)
    }
  }

  /**
   * TMDB season document (episodes, stills, guest stars).
   * @param {number} tmdbId
   * @param {number} seasonNumber
   * @returns {Promise<object | null>}
   */
  async getTmdbSeasonDetails(tmdbId, seasonNumber) {
    if (!this.hasTmdbKey) return null

    try {
      const response = await this.tmdbClient.get(`/tv/${tmdbId}/season/${seasonNumber}`, {
        params: { api_key: this.tmdbApiKey },
      })
      return response.data
    } catch (error) {
      console.error(`TMDB season ${seasonNumber} error:`, error.response?.data || error.message)
      return null
    }
  }

  /**
   * TMDB aggregate TV credits (series regulars / voice cast).
   * @param {number} tmdbId
   * @returns {Promise<object | null>}
   */
  async getTmdbAggregateCredits(tmdbId) {
    if (!this.hasTmdbKey) return null

    try {
      const response = await this.tmdbClient.get(`/tv/${tmdbId}/aggregate_credits`, {
        params: { api_key: this.tmdbApiKey },
      })
      return response.data
    } catch (error) {
      console.error('TMDB aggregate credits error:', error.response?.data || error.message)
      return null
    }
  }

  /**
   * Paginated MAL episode list for an anime id.
   * @param {number} malId
   * @returns {Promise<object[]>}
   */
  async getMalAnimeEpisodes(malId) {
    if (!this.hasMalKey) return []

    const episodes = []
    const limit = 100
    let offset = 0

    try {
      while (offset < 2000) {
        const response = await this.malClient.get(`/anime/${malId}/episodes`, {
          params: { offset, limit },
        })
        const batch = response.data?.data || []
        if (!batch.length) break
        episodes.push(...batch)
        if (batch.length < limit) break
        offset += limit
      }
    } catch (error) {
      console.error('MAL episodes error:', error.response?.data || error.message)
    }

    return episodes
  }

  /**
   * TMDB episodes across seasons, with series cast as a fallback when guests are missing,
   * plus each season's summary (name, overview, poster, air date, score).
   * @param {number} tmdbId
   * @param {number} [seasonCount]
   * @returns {Promise<{ episodes: object[], seasons: object[] }>}
   */
  async fetchTmdbSeasonData(tmdbId, seasonCount) {
    const [tvDetails, credits] = await Promise.all([
      this.getTmdbContentDetails(tmdbId, 'tv', { skipDelay: true }),
      this.getTmdbAggregateCredits(tmdbId),
    ])
    const seriesCast = mapSeriesCast(credits)
    const seasonNumbers = tmdbSeasonNumbers(tvDetails, seasonCount)
    const seasonDocs = await this.mapWithConcurrency(seasonNumbers, 4, (seasonNumber) =>
      this.getTmdbSeasonDetails(tmdbId, seasonNumber),
    )

    const episodes = []
    for (const season of seasonDocs) {
      if (!Array.isArray(season?.episodes)) continue
      for (const episode of season.episodes) {
        const mapped = mapTmdbEpisode(episode, seriesCast)
        if (mapped) episodes.push(mapped)
      }
    }

    const seasons = (Array.isArray(tvDetails?.seasons) ? tvDetails.seasons : [])
      .map(mapTmdbSeason)
      .filter(Boolean)
      .sort((left, right) => left.seasonNumber - right.seasonNumber)

    return { episodes, seasons }
  }

  /**
   * MAL episode titles for shows without usable TMDB season data.
   * @param {number} malId
   * @returns {Promise<object[]>}
   */
  async fetchMalEpisodes(malId) {
    const raw = await this.getMalAnimeEpisodes(malId)
    return raw.map((episode, index) => mapMalEpisode(episode, index)).filter(Boolean)
  }

  /**
   * Episode cards and TMDB season summaries for a TV catalog document: TMDB
   * first, MAL episodes (no season summaries) if TMDB is empty.
   * Results are cached in-process (6h while airing, 7d otherwise).
   * @param {object} content - Content document or plain catalog row.
   * @returns {Promise<{ episodes: object[], seasons: object[] }>}
   */
  async getTvShowSeasonData(content) {
    if (!content || content.contentType !== 'tv') return { episodes: [], seasons: [] }

    const cacheKey = String(content._id)
    const cached = this.getCachedEpisodes(cacheKey)
    if (cached) return cached

    let data = { episodes: [], seasons: [] }
    if (content.tmdbId) {
      data = await this.fetchTmdbSeasonData(content.tmdbId, content.seasonCount)
    }
    if (!data.episodes.length && content.malId) {
      data = { episodes: await this.fetchMalEpisodes(content.malId), seasons: [] }
    }

    const airing = content.malStatus === 'currently_airing'
    const ttlMs = airing ? 6 * 60 * 60 * 1000 : 7 * 24 * 60 * 60 * 1000
    this.setCachedEpisodes(cacheKey, data, ttlMs)
    return data
  }
}

export default new UnifiedContentService()
