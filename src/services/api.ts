/**
 * api.ts — Axios API client and content display helpers.
 *
 * Configures the backend base URL, attaches JWTs, and exports auth, content,
 * AI, and watchlist endpoints used by Pinia stores and views. Dev points at
 * `localhost:5001`; production uses the Railway API.
 */

import axios from 'axios'
import type {
  LoginCredentials,
  RegisterData,
  UpdateProfileData,
  WatchlistData,
  UpdateWatchlistData,
  ContentParams,
} from '@/types'
import { getDisplayTitle } from '@/utils/titles'

const STALE_RAILWAY_HOST = 'find-animation-production.up.railway.app'

function resolveApiBaseUrl(): string {
  const configured = import.meta.env.VITE_API_URL as string | undefined
  const usable = configured && !configured.includes(STALE_RAILWAY_HOST) ? configured : undefined

  if (usable) return usable
  if (import.meta.env.DEV) return 'http://localhost:5001/api'
  // Same-origin `/api` is proxied to Railway by vercel.json, so preview
  // deployments do not hit CORS or a renamed Railway hostname.
  return '/api'
}

const API_BASE_URL = resolveApiBaseUrl()

export { API_BASE_URL }

/** Origin for `/uploads` and other backend files (empty in production when using `/api`). */
export const API_HOST = API_BASE_URL.replace(/\/api\/?$/, '')

const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
  withCredentials: true, // Required for CORS requests with credentials
})

api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('token')
    if (token) {
      config.headers.Authorization = `Bearer ${token}`
    }
    return config
  },
  (error) => {
    return Promise.reject(error)
  },
)

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      // Expired/invalid access token: drop the session and send the user to login.
      localStorage.removeItem('token')
      localStorage.removeItem('user')
      window.location.href = '/login'
    }
    return Promise.reject(error)
  },
)

export const authAPI = {
  register: (userData: RegisterData) => api.post('/auth/register', userData),
  login: (credentials: LoginCredentials) => api.post('/auth/login', credentials),
  getProfile: () => api.get('/auth/profile'),
  updateProfile: (data: UpdateProfileData) => api.put('/auth/profile', data),
  changePassword: (data: { currentPassword: string; newPassword: string }) =>
    api.put('/auth/change-password', data),
  uploadProfilePicture: (formData: FormData) =>
    api.post('/auth/upload-profile-picture', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    }),
}

export const entityAPI = {
  search: (params: { q: string; type?: string; limit?: number }) => api.get('/entities', { params }),

  getById: (id: string) => api.get(`/entities/${id}`),

  getContentCharacters: (contentId: string) => api.get(`/content/${contentId}/characters`),

  getFavorites: () => api.get('/favorites'),

  favorite: (id: string) => api.post(`/entities/${id}/favorite`),

  unfavorite: (id: string) => api.delete(`/entities/${id}/favorite`),
}

export const contentAPI = {
  getContent: (params: ContentParams) => api.get('/content', { params }),

  getContentById: (id: string) => api.get(`/content/${id}`),

  getContentEpisodes: (id: string) => api.get(`/content/${id}/episodes`),

  getContentByExternalId: (id: string, source?: 'tmdb' | 'mal') =>
    api.get(`/content/external/${id}`, {
      params: source ? { source } : {},
    }),

  searchContent: (searchParams: Record<string, string | number>) =>
    api.get('/search', { params: searchParams }),

  getPopularContent: (params?: { type?: string; limit?: number }) =>
    api.get('/popular', { params }),

  getSimilarContent: (id: string, limit?: number) =>
    api.get(`/content/${id}/similar`, {
      params: limit ? { limit } : {},
    }),

  getRelatedContent: (contentId: string) => api.get(`/content/${contentId}/related`),

  getFranchiseContent: (franchiseName: string) => api.get(`/franchise/${franchiseName}`),

  getDatabaseStats: () => api.get('/stats'),
}

export const aiAPI = {
  search: (query: string) => api.post('/ai-search', { query }),

  // Legacy endpoints kept for older chatbot/recommendation callers.
  getRecommendations: (userId: string) => api.get(`/ai/recommendations/${userId}`),
  analyzeContent: (contentId: string) => api.get(`/ai/analyze/${contentId}`),
  chat: (message: string, history: Array<{ role: string; text: string }> = []) =>
    api.post('/ai/chat', { message, history }),
}

export const watchlistAPI = {
  addToWatchlist: (data: WatchlistData) => api.post('/watchlist', data),

  getWatchlist: () => api.get('/watchlist'),

  updateWatchlistItem: (contentId: string, data: UpdateWatchlistData) =>
    api.put(`/watchlist/${contentId}`, data),

  removeFromWatchlist: (contentId: string) => api.delete(`/watchlist/${contentId}`),
}

/**
 * Builds a TMDB image URL, or returns MAL URLs unchanged (they are already absolute).
 * @param path - TMDB path, full HTTP URL, or empty.
 * @param size - TMDB size token (default `w500`).
 * @returns Image URL, or the local placeholder when `path` is empty.
 */
export const getImageUrl = (path: string, size = 'w500') => {
  if (!path) return '/placeholder-movie.jpg'
  if (path.startsWith('//')) return `https:${path}`
  if (path.startsWith('http://') && /myanimelist\.net/i.test(path)) {
    return `https://${path.slice('http://'.length)}`
  }
  if (path.startsWith('http')) return path

  return `https://image.tmdb.org/t/p/${size}${path}`
}

/**
 * Poster-sized TMDB/MAL image URL (`w500`).
 * @param path - Poster path or absolute URL.
 * @returns Image URL or placeholder.
 */
export const getPosterUrl = (path: string) => getImageUrl(path, 'w500')

/**
 * Backdrop-sized TMDB/MAL image URL (`w1280`).
 * @param path - Backdrop path or absolute URL.
 * @returns Image URL or placeholder.
 */
export const getBackdropUrl = (path: string) => getImageUrl(path, 'w1280')

/**
 * Episode still TMDB image URL (`w300`).
 * @param path - Still path or absolute URL.
 * @returns Image URL or placeholder.
 */
export const getStillUrl = (path: string) => getImageUrl(path, 'w300')

/**
 * Cast profile TMDB image URL (`w185`).
 * @param path - Profile path or absolute URL.
 * @returns Image URL or placeholder.
 */
export const getProfileUrl = (path: string) => getImageUrl(path, 'w185')

/** Local loose shape for display helpers; distinct from `UnifiedContent`. */
interface ContentData {
  _id?: string
  id?: string
  title?: string
  englishTitle?: string
  nativeTitle?: string
  displayTitle?: string
  originalTitle?: string
  overview?: string
  posterPath?: string
  backdropPath?: string
  contentType?: string
  releaseDate?: string | Date
  genres?: Array<{ id?: number; name?: string }> | string[]
  voteAverage?: number
  malScore?: number
  unifiedScore?: number
  voteCount?: number
  malScoredBy?: number
  userRatingAverage?: number
  userRatingCount?: number
  runtime?: number
  episodeCount?: number
  malEpisodes?: number
  seasonCount?: number
  studios?: string[]
  productionCompanies?: string[]
  alternativeTitles?: string[]
  tmdbId?: number
  malId?: number
  dataSources?: {
    tmdb?: { hasData?: boolean }
    mal?: { hasData?: boolean }
  }
}

/**
 * Flattened display fields for catalog cards and detail views.
 * @param content - Catalog item or API payload with optional source fields.
 * @returns Title, media, rating, and source flags used by the UI.
 */
export const getContentDisplayInfo = (content: ContentData) => {
  return {
    id: content._id || content.id,
    title: getDisplayTitle(content),
    overview: content.overview || '',
    posterPath: content.posterPath,
    backdropPath: content.backdropPath,
    contentType: content.contentType,
    releaseDate: content.releaseDate,
    genres: content.genres || [],
    rating: {
      score: content.unifiedScore || 0,
      count: (content.voteCount || 0) + (content.malScoredBy || 0) + (content.userRatingCount || 0),
    },
    runtime: content.runtime,
    episodeCount: content.episodeCount || content.malEpisodes,
    seasonCount: content.seasonCount,
    studios: content.studios || content.productionCompanies || [],
    alternativeTitles: content.alternativeTitles || [],
    tmdbId: content.tmdbId,
    malId: content.malId,
    hasTmdbData: content.dataSources?.tmdb?.hasData || false,
    hasMalData: content.dataSources?.mal?.hasData || false,
  }
}

/**
 * Maps genre objects/strings to names and drops the redundant `"Animation"` genre.
 * @param genres - Genre objects or name strings from TMDB/MAL.
 * @returns Display names excluding Animation.
 */
export const formatGenres = (genres: Array<{ id?: number; name?: string }> | string[]) => {
  if (!genres || !Array.isArray(genres)) return []

  return genres
    .map((genre) => {
      if (typeof genre === 'string') return genre
      if (typeof genre === 'object' && genre.name) return genre.name
      return 'Unknown'
    })
    .filter((genre) => genre !== 'Animation')
}

/**
 * Human-readable content-type label, including `"Special"` for MAL specials
 * and `"Character"` for catalog people.
 * @param contentType - `movie`, `tv`, `special`, or `character`.
 * @returns `"Movie"`, `"Series"`, `"Special"`, or `"Character"`.
 */
export const getContentTypeDisplay = (contentType: string) => {
  if (contentType === 'special') return 'Special'
  if (contentType === 'movie') return 'Movie'
  if (contentType === 'character') return 'Character'
  if (contentType === 'voice_actor') return 'Voice Actor'
  if (contentType === 'studio') return 'Studio'
  return 'Series'
}

/**
 * Whether this type is grouped with movies in catalog filters (includes specials).
 * @param contentType - `movie`, `tv`, `special`, or undefined.
 * @returns True for movies and specials.
 */
export const isMovieLike = (contentType?: string) =>
  contentType === 'movie' || contentType === 'special'

/**
 * Whether this row is a character, voice actor, or studio (not a watchable title).
 * @param item - Search or catalog row.
 */
export const isCatalogEntity = (item?: { entityType?: string; contentType?: string }) => {
  const kind = item?.entityType || item?.contentType
  return kind === 'character' || kind === 'voice_actor' || kind === 'studio'
}

/**
 * Card badge label. Specials keep their own tag even though they live in Movies.
 * @param contentType - `movie`, `tv`, or `special`.
 * @returns `"Movie"`, `"Series"`, or `"Special"`.
 */
export const getCardContentTypeDisplay = (contentType: string) => getContentTypeDisplay(contentType)

/**
 * Whether an item matches a Movies/TV/All filter; `"movie"` includes specials.
 * @param itemType - The item's `contentType`.
 * @param filter - Active type filter (`all`, `movie`, `tv`, …).
 * @returns True when the item should appear under that filter.
 */
export const matchesContentTypeFilter = (itemType: string | undefined, filter?: string) => {
  if (!filter || filter === 'all') return true
  if (itemType === 'character' || itemType === 'voice_actor' || itemType === 'studio') {
    return false
  }
  if (filter === 'movie') return isMovieLike(itemType)
  return itemType === filter
}

/**
 * CSS class for poster type badges.
 * @param contentType - `movie`, `tv`, or `special`.
 * @returns `'movie-badge'`, `'tv-badge'`, or `'special-badge'`.
 */
export const getContentTypeBadgeClass = (contentType: string) => {
  if (contentType === 'tv') return 'tv-badge'
  if (contentType === 'special') return 'special-badge'
  if (contentType === 'character') return 'character-badge'
  if (contentType === 'voice_actor') return 'voice-actor-badge'
  if (contentType === 'studio') return 'studio-badge'
  return 'movie-badge'
}

/**
 * Whether the watchlist should track episode progress.
 * Specials only track when they have more than one episode.
 * @param item - Content type plus episode counts.
 * @returns True for TV and multi-episode specials.
 */
export const tracksEpisodes = (item: {
  contentType?: string
  episodeCount?: number
  malEpisodes?: number
}) => {
  if (item.contentType === 'tv') return true
  if (item.contentType === 'special') {
    return (item.episodeCount || item.malEpisodes || 0) > 1
  }
  return false
}

/**
 * Vue route name for a detail page; specials use `MovieDetails`.
 * @param item - Object with a `contentType`.
 * @returns `'TVShowDetails'` or `'MovieDetails'`.
 */
export const getDetailsRouteName = (item: { contentType?: string; entityType?: string }) => {
  const kind = item.entityType || item.contentType
  if (kind === 'character') return 'CharacterDetails'
  return item.contentType === 'tv' ? 'TVShowDetails' : 'MovieDetails'
}

export default api
