/**
 * TMDB and MyAnimeList adapters that map animation catalog payloads into Content-shaped objects.
 * Domain service: search, popular lists, type mapping (OVA/special → special), and live-search dedup.
 * Does not persist; contentSyncService writes the converted documents.
 *
 * API references: https://developer.themoviedb.org/docs/getting-started
 * https://myanimelist.net/apiconfig/references/api/v2
 */
import axios from 'axios'
import dotenv from 'dotenv'
import { buildTitleFields, uniqueTitles } from '../utils/titles.js'

dotenv.config()

const MAL_ANIME_FIELDS =
  'id,title,main_picture,alternative_titles,synopsis,mean,rank,popularity,num_episodes,status,start_season,studios,genres,rating,source,num_list_users,num_scoring_users,media_type'

const MAL_SPECIAL_TYPES = new Set(['ova', 'special'])

/**
 * Whether a converted item should appear in a typed search/popular request.
 * `movie` includes MAL specials so they surface with movies in the UI.
 * @param {{ contentType: string }} item
 * @param {string} contentType - `all` | `movie` | `tv` | `special`
 * @returns {boolean}
 */
const matchesRequestedType = (item, contentType) => {
  if (!contentType || contentType === 'all') return true
  if (contentType === 'movie') return item.contentType === 'movie' || item.contentType === 'special'
  return item.contentType === contentType
}

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
   * Discover TMDB animation movies (genre 16), popularity descending.
   * @param {number} [page=1]
   * @param {number} [limit=20]
   * @returns {Promise<object[]>}
   */
  async getTmdbAnimatedMovies(page = 1, limit = 20) {
    if (!this.hasTmdbKey) {
      console.log('TMDB API key not configured')
      return []
    }

    try {
      await this.delay(this.tmdbDelay)
      const response = await this.tmdbClient.get('/discover/movie', {
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
      console.error('TMDB animated movies error:', error.response?.data || error.message)
      return []
    }
  }

  /**
   * Discover TMDB animation TV (genre 16), popularity descending.
   * @param {number} [page=1]
   * @param {number} [limit=20]
   * @returns {Promise<object[]>}
   */
  async getTmdbAnimatedTVShows(page = 1, limit = 20) {
    if (!this.hasTmdbKey) {
      console.log('TMDB API key not configured')
      return []
    }

    try {
      await this.delay(this.tmdbDelay)
      const response = await this.tmdbClient.get('/discover/tv', {
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
      console.error('TMDB animated TV shows error:', error.response?.data || error.message)
      return []
    }
  }

  /**
   * Full TMDB movie/TV document plus alternative_titles for English/native mapping.
   * @param {number} tmdbId
   * @param {'movie' | 'tv'} contentType
   * @returns {Promise<object | null>}
   */
  async getTmdbContentDetails(tmdbId, contentType) {
    if (!this.hasTmdbKey) return null

    try {
      await this.delay(this.tmdbDelay)
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
      await this.delay(this.malDelay)
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
    if (!this.hasMalKey) {
      console.log('MAL API key not configured')
      return []
    }

    try {
      await this.delay(this.malDelay)
      const response = await this.malClient.get('/anime/ranking', {
        params: {
          ranking_type: 'all',
          limit: Math.min(limit, 100),
          offset,
          fields: MAL_ANIME_FIELDS,
        },
      })

      return response.data.data || []
    } catch (error) {
      console.error('MAL top anime error:', error.response?.data || error.message)
      return []
    }
  }

  /**
   * Single MAL anime document for the configured field set.
   * @param {number} malId
   * @returns {Promise<object | null>}
   */
  async getMalAnimeDetails(malId) {
    if (!this.hasMalKey) return null

    try {
      await this.delay(this.malDelay)
      const response = await this.malClient.get(`/anime/${malId}`, {
        params: {
          fields: MAL_ANIME_FIELDS,
        },
      })

      return response.data
    } catch (error) {
      console.error('MAL anime details error:', error.response?.data || error.message)
      return null
    }
  }

  /**
   * MAL title search.
   * @param {string} query
   * @param {number} [limit=20]
   * @returns {Promise<object[]>}
   */
  async searchMalAnime(query, limit = 20) {
    if (!this.hasMalKey) return []

    try {
      await this.delay(this.malDelay)
      const response = await this.malClient.get('/anime', {
        params: {
          q: query,
          limit: Math.min(limit, 100),
          fields: MAL_ANIME_FIELDS,
        },
      })

      return response.data.data || []
    } catch (error) {
      console.error('MAL search error:', error.response?.data || error.message)
      return []
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
   * Drops titles with fewer than 50 votes or a missing vote average.
   * @param {object} tmdbData
   * @param {'movie' | 'tv'} contentType
   * @returns {object | null}
   */
  convertTmdbToContent(tmdbData, contentType) {
    if (!tmdbData.vote_count || tmdbData.vote_count < 50 || !tmdbData.vote_average) {
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
      malMediaType: ['unknown', 'tv', 'ova', 'movie', 'special', 'ona', 'music'].includes(
        malMediaType,
      )
        ? malMediaType
        : undefined,
      malSource: anime.source,
      malRating: anime.rating,
      genres: anime.genres?.map((genre) => ({ id: genre.id, name: genre.name })) || [],
      studios: anime.studios?.map((studio) => studio.name) || [],
      dataSources: {
        mal: {
          hasData: true,
          lastUpdated: new Date(),
        },
      },
    }

    if (anime.start_season) {
      const year = anime.start_season.year
      const month =
        anime.start_season.season === 'winter'
          ? 1
          : anime.start_season.season === 'spring'
            ? 4
            : anime.start_season.season === 'summer'
              ? 7
              : 10
      content.releaseDate = new Date(year, month - 1, 1)
    }

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
    const knownRuntimes = {
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
      'Summer Wars': 114,
      'The Secret World of Arrietty': 94,
      'Karigurashi no Arrietty': 94,
      'From Up on Poppy Hill': 91,
      'Kokuriko-zaka Kara': 91,
      'The Wind Rises': 126,
      'Kaze Tachinu': 126,
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
      'Summer Wars': 114,
      'The Secret World of Arrietty': 94,
      'Karigurashi no Arrietty': 94,
      'From Up on Poppy Hill': 91,
      'Kokuriko-zaka Kara': 91,
    }

    if (knownRuntimes[title]) {
      return knownRuntimes[title]
    }

    for (const [knownTitle, runtime] of Object.entries(knownRuntimes)) {
      if (
        title.toLowerCase().includes(knownTitle.toLowerCase()) ||
        knownTitle.toLowerCase().includes(title.toLowerCase())
      ) {
        return runtime
      }
    }

    const titleLower = title.toLowerCase()

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
   * Live search across TMDB and MAL, then title/type dedup and relevance ranking.
   * @param {string} query
   * @param {{ contentType?: string, limit?: number, includeTmdb?: boolean, includeMal?: boolean }} [options={}]
   * @returns {Promise<object[]>}
   */
  async searchContent(query, options = {}) {
    const { contentType = 'all', limit = 20, includeTmdb = true, includeMal = true } = options

    const results = []

    if (includeTmdb && this.hasTmdbKey) {
      try {
        const tmdbResults = await this.searchTmdb(query, contentType, limit)
        results.push(
          ...tmdbResults.map((item) => ({
            ...item,
            source: 'tmdb',
          })),
        )
      } catch (error) {
        console.error('TMDB search error:', error.message)
      }
    }

    if (includeMal && this.hasMalKey) {
      try {
        const malResults = await this.searchMalAnime(query, limit)
        results.push(
          ...malResults
            .map((item) => this.convertMalToContent(item))
            .filter((item) => item !== null)
            .filter((item) => matchesRequestedType(item, contentType))
            .map((item) => ({
              ...item,
              source: 'mal',
            })),
        )
      } catch (error) {
        console.error('MAL search error:', error.message)
      }
    }

    return this.deduplicateAndRank(results, query)
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

    try {
      if (contentType === 'all' || contentType === 'movie') {
        await this.delay(this.tmdbDelay)
        const movieResponse = await this.tmdbClient.get('/search/movie', {
          params: {
            api_key: this.tmdbApiKey,
            query,
            include_adult: false,
          },
        })

        const movies = movieResponse.data.results
          .filter((movie) => this.isAnimatedContent(movie))
          .map((movie) => this.convertTmdbToContent(movie, 'movie'))
          .filter((movie) => movie !== null)
          .slice(0, searchLimit)

        results.push(...movies)
      }

      if (contentType === 'all' || contentType === 'tv') {
        await this.delay(this.tmdbDelay)
        const tvResponse = await this.tmdbClient.get('/search/tv', {
          params: {
            api_key: this.tmdbApiKey,
            query,
            include_adult: false,
          },
        })

        const tvShows = tvResponse.data.results
          .filter((tv) => this.isAnimatedContent(tv))
          .map((tv) => this.convertTmdbToContent(tv, 'tv'))
          .filter((tv) => tv !== null)
          .slice(0, searchLimit)

        results.push(...tvShows)
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
   * Collapse live-search hits on englishTitle/title + contentType, then rank exact title match over score.
   * @param {object[]} results
   * @param {string} query
   * @returns {object[]}
   */
  deduplicateAndRank(results, query) {
    const seen = new Set()
    const deduplicated = []

    for (const result of results) {
      const key = `${result.englishTitle || result.title}-${result.contentType}`
      if (!seen.has(key)) {
        seen.add(key)
        deduplicated.push(result)
      }
    }

    const queryLower = query.toLowerCase()
    const matchesQuery = (item) =>
      uniqueTitles(
        item.englishTitle,
        item.title,
        item.nativeTitle,
        item.originalTitle,
        item.alternativeTitles,
      ).some((title) => title.toLowerCase().includes(queryLower))

    return deduplicated.sort((a, b) => {
      const aTitleMatch = matchesQuery(a)
      const bTitleMatch = matchesQuery(b)

      if (aTitleMatch && !bTitleMatch) return -1
      if (!aTitleMatch && bTitleMatch) return 1

      const aScore = a.malScore || a.voteAverage || 0
      const bScore = b.malScore || b.voteAverage || 0
      return bScore - aScore
    })
  }

  /**
   * Mix TMDB discover + MAL ranking, sorted by TMDB popularity or MAL scored-by count.
   * @param {{ contentType?: string, limit?: number, includeTmdb?: boolean, includeMal?: boolean }} [options={}]
   * @returns {Promise<object[]>}
   */
  async getPopularContent(options = {}) {
    const { contentType = 'all', limit = 20, includeTmdb = true, includeMal = true } = options

    const results = []

    if (includeTmdb && this.hasTmdbKey) {
      try {
        if (contentType === 'all' || contentType === 'movie') {
          const movies = await this.getTmdbAnimatedMovies(1, Math.ceil(limit / 2))
          results.push(
            ...movies
              .map((movie) => this.convertTmdbToContent(movie, 'movie'))
              .filter((movie) => movie !== null)
              .map((movie) => ({
                ...movie,
                source: 'tmdb',
              })),
          )
        }

        if (contentType === 'all' || contentType === 'tv') {
          const tvShows = await this.getTmdbAnimatedTVShows(1, Math.ceil(limit / 2))
          results.push(
            ...tvShows
              .map((tv) => this.convertTmdbToContent(tv, 'tv'))
              .filter((tv) => tv !== null)
              .map((tv) => ({
                ...tv,
                source: 'tmdb',
              })),
          )
        }
      } catch (error) {
        console.error('Error getting TMDB popular content:', error.message)
      }
    }

    if (includeMal && this.hasMalKey) {
      try {
        const malAnime = await this.getMalTopAnime(Math.ceil(limit / 2))
        results.push(
          ...malAnime
            .map((anime) => this.convertMalToContent(anime))
            .filter((anime) => anime !== null)
            .filter((anime) => matchesRequestedType(anime, contentType))
            .map((anime) => ({
              ...anime,
              source: 'mal',
            })),
        )
      } catch (error) {
        console.error('Error getting MAL popular content:', error.message)
      }
    }

    return results
      .sort((a, b) => {
        const aPop = a.popularity || a.malScoredBy || 0
        const bPop = b.popularity || b.malScoredBy || 0
        return bPop - aPop
      })
      .slice(0, limit)
  }
}

export default new UnifiedContentService()
