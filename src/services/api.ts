import axios from 'axios'
import type {
  LoginCredentials,
  RegisterData,
  UpdateProfileData,
  WatchlistData,
  UpdateWatchlistData,
  RateContentData,
  ContentParams,
} from '@/types'

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:5001/api'

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
}

// Content API
export const contentAPI = {
  getMovies: (params: ContentParams) => api.get('/content/movies', { params }),
  getTVShows: (params: ContentParams) => api.get('/content/tv', { params }),
  searchContent: (query: string, page = 1, useAI = true) =>
    api.get('/content/search', {
      params: { query, page, useAI },
    }),
  getContentDetails: (id: string) => api.get(`/content/${id}`),
}

// AI API
export const aiAPI = {
  getRecommendations: (userId: string) => api.get(`/ai/recommendations/${userId}`),
  analyzeContent: (contentId: string) => api.get(`/ai/analyze/${contentId}`),
}

// User API
export const userAPI = {
  addToWatchlist: (data: WatchlistData) => api.post('/user/watchlist', data),
  updateWatchlistItem: (contentId: string, data: UpdateWatchlistData) =>
    api.put(`/user/watchlist/${contentId}`, data),
  removeFromWatchlist: (contentId: string) => api.delete(`/user/watchlist/${contentId}`),
  rateContent: (data: RateContentData) => api.post('/user/rate', data),
  getRecommendations: () => api.get('/user/recommendations'),
}

// Utility functions
export const getImageUrl = (path: string, size = 'w500') => {
  if (!path) return '/placeholder-movie.jpg'
  return `https://image.tmdb.org/t/p/${size}${path}`
}

export const getPosterUrl = (path: string) => getImageUrl(path, 'w500')
export const getBackdropUrl = (path: string) => getImageUrl(path, 'w1280')

export default api
