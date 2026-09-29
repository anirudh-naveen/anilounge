/**
 * api.ts — Axios API client and content display helpers.
 *
 * Configures the backend base URL, keeps the access token in memory (renewed
 * from the httpOnly session cookie on 401), and exports auth, content, AI, and
 * watchlist endpoints used by Pinia stores and views. Both dev (Vite proxy) and
 * production (Vercel rewrite) call the API on the same origin under `/api`.
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
import type { ProfileSettings } from '@/types/profile'
import { getDisplayTitle } from '@/utils/titles'

const STALE_RAILWAY_HOST = 'find-animation-production.up.railway.app'

function resolveApiBaseUrl(): string {
  // Development: vite.config.ts proxies `/api` to the local backend, so the session
  // cookie is same-origin (a cross-origin localhost:5001 cookie is dropped by Safari).
  if (import.meta.env.DEV) return '/api'

  const configured = import.meta.env.VITE_API_URL as string | undefined
  const usable = configured && !configured.includes(STALE_RAILWAY_HOST) ? configured : undefined
  // Routes are mounted under `/api`; accept a bare origin like `https://api.example.com`.
  if (usable) return /\/api\/?$/.test(usable) ? usable : `${usable.replace(/\/+$/, '')}/api`
  // Same-origin `/api` is proxied to Railway by vercel.json, so the session cookie is
  // first-party and preview deployments do not hit CORS or a renamed Railway hostname.
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
    // Required by the cookie-based session endpoints (a cross-site form cannot send it).
    'X-Requested-With': 'XMLHttpRequest',
  },
  withCredentials: true, // Sends the httpOnly session cookie to /auth/refresh and /auth/revoke
})

// ---------------------------------------------------------------------------
// Session: the access token lives only in memory; an httpOnly cookie restores it.
// ---------------------------------------------------------------------------

/** Signed-in user fields returned by `/auth/refresh`. */
export interface SessionUser {
  id: string
  username: string
  email: string
  isDemoAccount?: boolean
  isAdmin?: boolean
  role?: 'user' | 'admin' | 'creator'
  profilePicture?: string | null
  createdAt?: string
  preferences?: { favoriteGenres: string[] }
}

/** Result of a cookie refresh: a new access token and user, or null when signed out. */
export type RefreshedSession = { accessToken: string; user: SessionUser } | null

let accessToken: string | null = null
let refreshInFlight: Promise<RefreshedSession> | null = null
const sessionListeners = new Set<(session: RefreshedSession) => void>()

/** Set (or clear) the in-memory access token sent as `Authorization: Bearer`. */
export const setAccessToken = (token: string | null) => {
  accessToken = token
}

/** Be told when a background refresh renews or ends the session. Returns an unsubscribe. */
export const onSessionChange = (listener: (session: RefreshedSession) => void) => {
  sessionListeners.add(listener)
  return () => sessionListeners.delete(listener)
}

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

const requestRefresh = async (): Promise<RefreshedSession> => {
  // One retry covers another tab rotating the same cookie a moment earlier.
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const response = await api.post('/auth/refresh', {}, { skipAuthRefresh: true })
      return response.data.data as RefreshedSession
    } catch (err) {
      const code = (err as { response?: { data?: { code?: string } } }).response?.data?.code
      if (code !== 'REFRESH_RACE' || attempt === 1) return null
      await wait(300)
    }
  }
  return null
}

/**
 * Exchange the session cookie for a fresh access token. Concurrent callers share one
 * request, and tabs take turns (Web Locks) so they do not rotate the same cookie at once.
 * @returns The new token and user, or null when there is no valid session.
 */
export const refreshSession = (): Promise<RefreshedSession> => {
  if (!refreshInFlight) {
    const run = () => requestRefresh()
    const locked: Promise<RefreshedSession> =
      typeof navigator !== 'undefined' && navigator.locks
        ? // The DOM typings do not unwrap the callback's promise; the runtime does.
          (navigator.locks.request(
            'anilounge-session-refresh',
            run,
          ) as unknown as Promise<RefreshedSession>)
        : run()
    refreshInFlight = locked.finally(() => {
      refreshInFlight = null
    })
  }
  return refreshInFlight
}

api.interceptors.request.use(
  (config) => {
    if (accessToken) {
      config.headers.Authorization = `Bearer ${accessToken}`
    }
    return config
  },
  (error) => {
    return Promise.reject(error)
  },
)

/** Sign-in steps whose 401 means "wrong password/code", not "session expired". */
const CREDENTIAL_PATHS = ['/auth/login', '/auth/2fa/verify', '/auth/verify-email', '/auth/unlock']

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const config = error.config
    const isCredentialStep = CREDENTIAL_PATHS.includes(String(config?.url || ''))
    if (
      error.response?.status !== 401 ||
      isCredentialStep ||
      !config ||
      config.skipAuthRefresh ||
      config.retriedAfterRefresh
    ) {
      return Promise.reject(error)
    }

    // Access token expired: renew it from the session cookie and replay the request once.
    const hadSession = Boolean(accessToken)
    const session = await refreshSession()
    sessionListeners.forEach((listener) => listener(session))
    if (session) {
      setAccessToken(session.accessToken)
      config.retriedAfterRefresh = true
      config.headers.Authorization = `Bearer ${session.accessToken}`
      return api(config)
    }

    setAccessToken(null)
    if (hadSession) window.location.href = '/login'
    return Promise.reject(error)
  },
)

export const authAPI = {
  register: (userData: RegisterData) => api.post('/auth/register', userData),
  login: (credentials: LoginCredentials) => api.post('/auth/login', credentials),
  getProfile: () => api.get('/auth/profile'),
  logout: () => api.post('/auth/revoke', {}, { skipAuthRefresh: true }),
  signOutEverywhere: () => api.post('/account/sessions/revoke-all', {}),
  updateProfile: (data: UpdateProfileData) => api.put('/auth/profile', data),
  changePassword: (data: { currentPassword: string; newPassword: string }) =>
    api.put('/auth/change-password', data),
  deleteAccount: (password: string) => api.delete('/account', { data: { password } }),
  verifyEmail: (email: string, code: string) => api.post('/auth/verify-email', { email, code }),
  resendVerification: (email: string) => api.post('/auth/resend-verification', { email }),
  unlockAccount: (email: string, code: string) => api.post('/auth/unlock', { email, code }),
  verifyTwoFactor: (challengeToken: string, code: string) =>
    api.post('/auth/2fa/verify', { challengeToken, code }),
  removeProfilePicture: () => api.delete('/account/profile-picture'),
  uploadProfilePicture: (formData: FormData) =>
    api.post('/auth/upload-profile-picture', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    }),
}

export const entityAPI = {
  search: (params: { q: string; type?: string; limit?: number }) =>
    api.get('/entities', { params }),

  getById: (id: string) => api.get(`/entities/${id}`),

  getContentCharacters: (contentId: string) => api.get(`/content/${contentId}/characters`),

  getContentVoiceActors: (contentId: string) => api.get(`/content/${contentId}/voice-actors`),

  getFavorites: () => api.get('/favorites'),

  favorite: (id: string) => api.post(`/entities/${id}/favorite`),

  unfavorite: (id: string) => api.delete(`/entities/${id}/favorite`),
}

export const securityAPI = {
  getStatus: () => api.get('/account/security'),

  startTwoFactorSetup: () => api.post('/account/2fa/setup', {}),

  enableTwoFactor: (code: string) => api.post('/account/2fa/enable', { code }),

  disableTwoFactor: (password: string, code: string) =>
    api.post('/account/2fa/disable', { password, code }),

  newBackupCodes: (code: string) => api.post('/account/2fa/backup-codes', { code }),
}

/** Optional email categories; account and security emails cannot be turned off. */
export interface EmailPreferences {
  announcements: boolean
  friend_requests: boolean
}

export const emailPreferencesAPI = {
  get: () => api.get('/account/email-preferences'),

  update: (changes: Partial<EmailPreferences>) => api.put('/account/email-preferences', changes),
}

export const profileAPI = {
  getPublicProfile: (username: string) => api.get(`/users/${encodeURIComponent(username)}`),

  updateSettings: (data: { settings?: Partial<ProfileSettings>; bio?: string }) =>
    api.put('/profile/settings', data),

  getFavoriteContentIds: () => api.get('/favorites/content'),

  favoriteContent: (id: string) => api.post(`/content/${id}/favorite`),

  unfavoriteContent: (id: string) => api.delete(`/content/${id}/favorite`),
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

export const homeAPI = {
  getActivity: () => api.get('/home/activity'),

  getUpdates: () => api.get('/home/updates'),

  getCharacterOfTheDay: () => api.get('/home/character-of-the-day'),
}

export const friendsAPI = {
  list: () => api.get('/friends'),

  search: (q: string) => api.get('/friends/search', { params: { q } }),

  sendRequest: (userId: string, message?: string) =>
    api.post('/friends/requests', { userId, message }),

  accept: (userId: string) => api.post(`/friends/requests/${userId}/accept`, {}),

  /** Decline an incoming request, cancel an outgoing one, or unfriend. */
  remove: (userId: string) => api.delete(`/friends/${userId}`),
}

export const adminAPI = {
  searchContent: (params: { q?: string; type?: string; page?: number }) =>
    api.get('/admin/content', { params }),

  getContent: (id: string) => api.get(`/admin/content/${id}`),

  updateContent: (id: string, body: { changes?: Record<string, unknown>; unlock?: string[] }) =>
    api.patch(`/admin/content/${id}`, body),

  /** Add or remove a cast/voice/studio link; returns the editor row `editorId`. */
  changeLink: (op: 'add' | 'remove', link: Record<string, unknown>, editorId: string) =>
    api.post(`/admin/links/${op}`, { link, editorId }),

  reorderCast: (workId: string, characterIds: string[]) =>
    api.put(`/admin/content/${workId}/cast-order`, { characterIds }),

  setAppearanceRole: (body: { workId: string; characterId: string; role: string; editorId: string }) =>
    api.put('/admin/links/role', body),

  getLog: (params: { month?: string; category?: string }) => api.get('/admin/log', { params }),

  listSyncChanges: (params: { outcome?: string; page?: number }) =>
    api.get('/admin/sync-changes', { params }),

  countSyncChanges: () => api.get('/admin/sync-changes/count'),

  /** revert: restore the old value and lock it; apply: unlock and take the sync's value. */
  resolveSyncChanges: (action: 'revert' | 'apply' | 'dismiss', ids: string[]) =>
    api.post(`/admin/sync-changes/${action}`, { ids }),

  listUsers: (params: { q?: string; filter?: string; page?: number }) =>
    api.get('/admin/users', { params }),

  setUserRole: (id: string, role: 'user' | 'admin') => api.put(`/admin/users/${id}/role`, { role }),

  /** Badge-only roles; `roles` is the full list the user should have. */
  setCosmeticRoles: (id: string, roles: string[]) =>
    api.put(`/admin/users/${id}/cosmetic-roles`, { roles }),

  /** `duration`: 1h | 24h | 7d | 30d | permanent, or 'off' to unmute. */
  muteUser: (id: string, duration: string, reason?: string) =>
    api.post(`/admin/users/${id}/mute`, { duration, reason }),

  setBan: (id: string, banned: boolean, reason?: string) =>
    api.post(`/admin/users/${id}/ban`, { banned, reason }),
}

/** Public list of staff accounts behind the creator/admin badges. */
export const staffAPI = {
  list: () => api.get('/staff'),
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
 * @param item - Object with a `contentType` or `entityType`.
 * @returns The title, character, voice-actor, or studio details route.
 */
export const getDetailsRouteName = (item: { contentType?: string; entityType?: string }) => {
  const kind = item.entityType || item.contentType
  if (kind === 'character') return 'CharacterDetails'
  if (kind === 'voice_actor') return 'VoiceActorDetails'
  if (kind === 'studio') return 'StudioDetails'
  return item.contentType === 'tv' ? 'TVShowDetails' : 'MovieDetails'
}

export default api
