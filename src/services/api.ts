import axios from 'axios'
import type {
  LoginCredentials,
  RegisterData,
  UpdateProfileData,
  WatchlistData,
  UpdateWatchlistData,
  ContentParams,
} from '@/types'

const API_BASE_URL =
  import.meta.env.VITE_API_URL ||
  (import.meta.env.DEV
    ? 'http://localhost:5001/api'
    : 'https://find-animation-production.up.railway.app/api')

// Create axios instance
const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
})

// Request interceptor to add auth token
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

// Response interceptor to handle errors
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      // Token expired or invalid
      localStorage.removeItem('token')
      localStorage.removeItem('user')
      window.location.href = '/login'
    }
    return Promise.reject(error)
  },
)

// Auth API
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

// Unified Content API
export const contentAPI = {
  // Get all content with pagination and filtering
  getContent: (params: ContentParams) => api.get('/content', { params }),

  // Get content by ID
  getContentById: (id: string) => api.get(`/content/${id}`),

  // Get content by external ID (TMDB or MAL)
  getContentByExternalId: (id: string, source?: 'tmdb' | 'mal') =>
    api.get(`/content/external/${id}`, {
      params: source ? { source } : {},
    }),

  // Search content
  searchContent: (searchParams: Record<string, string | number>) =>
    api.get('/search', { params: searchParams }),

  // Get popular content
  getPopularContent: (params?: { type?: string; limit?: number }) =>
    api.get('/popular', { params }),

  // Get similar content
  getSimilarContent: (id: string, limit?: number) =>
    api.get(`/content/${id}/similar`, {
      params: limit ? { limit } : {},
    }),

  // Get related content (sequels, prequels, related)
  getRelatedContent: (contentId: string) => api.get(`/content/${contentId}/related`),

  // Get franchise content
  getFranchiseContent: (franchiseName: string) => api.get(`/franchise/${franchiseName}`),

  // Get database statistics
  getDatabaseStats: () => api.get('/stats'),
}

// AI API
export const aiAPI = {
  // AI-powered search
  search: (query: string) => api.post('/ai-search', { query }),

  // Legacy endpoints for compatibility
  getRecommendations: (userId: string) => api.get(`/ai/recommendations/${userId}`),
  analyzeContent: (contentId: string) => api.get(`/ai/analyze/${contentId}`),
  chat: (message: string) => api.post('/ai/chat', { message }),
}

// Watchlist API
export const watchlistAPI = {
  // Add to watchlist
  addToWatchlist: (data: WatchlistData) => api.post('/watchlist', data),

  // Get user watchlist
  getWatchlist: () => api.get('/watchlist'),

  // Update watchlist item
  updateWatchlistItem: (contentId: string, data: UpdateWatchlistData) =>
    api.put(`/watchlist/${contentId}`, data),

  // Remove from watchlist
  removeFromWatchlist: (contentId: string) => api.delete(`/watchlist/${contentId}`),
}

// Legacy API compatibility - removed redundant userAPI
// All watchlist functionality is now handled by watchlistAPI

// Utility functions for images
export const getImageUrl = (path: string, size = 'w500') => {
  if (!path) return '/placeholder-movie.jpg'

  // Handle MAL images (they're already full URLs)
  if (path.startsWith('http')) {
    return path
  }

  // Handle TMDB images
  return `https://image.tmdb.org/t/p/${size}${path}`
}

export const getPosterUrl = (path: string) => getImageUrl(path, 'w500')
export const getBackdropUrl = (path: string) => getImageUrl(path, 'w1280')

// Content interface for type safety
interface ContentData {
  _id?: string
  id?: string
  title?: string
  displayTitle?: string
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

// Utility function to get content display info
export const getContentDisplayInfo = (content: ContentData) => {
  return {
    id: content._id || content.id,
    title: content.title || content.displayTitle || 'Unknown Title',
    overview: content.overview || '',
    posterPath: content.posterPath,
    backdropPath: content.backdropPath,
    contentType: content.contentType,
    releaseDate: content.releaseDate,
    genres: content.genres || [],
    rating: {
      score: content.unifiedScore || 0,
      count: content.voteCount || content.malScoredBy || 0,
      source: content.malScore ? 'mal' : 'tmdb',
    },
    // Additional info
    runtime: content.runtime,
    episodeCount: content.episodeCount || content.malEpisodes,
    seasonCount: content.seasonCount,
    studios: content.studios || content.productionCompanies || [],
    alternativeTitles: content.alternativeTitles || [],
    // External IDs
    tmdbId: content.tmdbId,
    malId: content.malId,
    // Data sources
    hasTmdbData: content.dataSources?.tmdb?.hasData || false,
    hasMalData: content.dataSources?.mal?.hasData || false,
  }
}

// Utility function to format genres
export const formatGenres = (genres: Array<{ id?: number; name?: string }> | string[]) => {
  if (!genres || !Array.isArray(genres)) return []

  return genres
    .map((genre) => {
      if (typeof genre === 'string') return genre
      if (typeof genre === 'object' && genre.name) return genre.name
      return 'Unknown'
    })
    .filter((genre) => genre !== 'Animation') // Filter out Animation genre as requested
}

// Utility function to get content type display
export const getContentTypeDisplay = (contentType: string) => {
  return contentType === 'movie' ? 'Movie' : 'TV Show'
}

export default api
