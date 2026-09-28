/**
 * auth.ts — Pinia auth store.
 *
 * Holds the current user and JWT, persists them to localStorage, and exposes
 * login (with the 2FA step), register and email verification, profile, and
 * session helpers used by views and the router.
 */

import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { authAPI } from '@/services/api'
import type { User, LoginCredentials, RegisterData, UpdateProfileData } from '@/types'

const DEMO_USER_EMAIL = 'demo@findanimation.com'

export const useAuthStore = defineStore('auth', () => {
  const user = ref<User | null>(null)
  const token = ref<string | null>(localStorage.getItem('token'))
  const isLoading = ref(false)
  const error = ref<string | null>(null)

  const isAuthenticated = computed(() => !!token.value)
  /** True for the shared recruiter demo account, which cannot change its password. */
  const isDemoUser = computed(
    () =>
      Boolean(user.value?.isDemoAccount) || user.value?.email?.toLowerCase() === DEMO_USER_EMAIL,
  )

  /** Machine-readable code from the last failed call (e.g. `EMAIL_NOT_VERIFIED`, `ACCOUNT_LOCKED`). */
  const errorCode = ref<string | null>(null)

  type ApiError = { response?: { data?: { message?: string; code?: string }; status?: number } }

  const captureError = (err: unknown, fallback: string) => {
    const apiError = err as ApiError
    error.value = apiError.response?.data?.message || fallback
    errorCode.value = apiError.response?.data?.code || null
  }

  /**
   * Stores a signed-in user plus access token in memory and localStorage.
   * @param userData - User returned by a sign-in endpoint.
   * @param authToken - Access JWT.
   */
  const setSession = (userData: User, authToken: string) => {
    user.value = userData
    token.value = authToken
    localStorage.setItem('token', authToken)
    localStorage.setItem('user', JSON.stringify(userData))
  }

  /**
   * Runs an auth call with shared loading/error handling.
   * @param fallback - Error message when the server gives none.
   * @param action - The API work.
   */
  const run = async <T>(fallback: string, action: () => Promise<T>): Promise<T> => {
    try {
      isLoading.value = true
      error.value = null
      errorCode.value = null
      return await action()
    } catch (err: unknown) {
      captureError(err, fallback)
      throw err
    } finally {
      isLoading.value = false
    }
  }

  /**
   * Signs in with email and password. Accounts with 2FA return a challenge instead
   * of a session; finish those with `verifyTwoFactor`.
   * @param credentials - Email and password.
   * @returns `{ requiresTwoFactor: true, challengeToken }`, or `{ requiresTwoFactor: false }` once signed in.
   */
  const login = (credentials: LoginCredentials) =>
    run('Login failed', async () => {
      const response = await authAPI.login(credentials)
      const data = response.data.data
      if (data.requiresTwoFactor) {
        return { requiresTwoFactor: true as const, challengeToken: data.challengeToken as string }
      }
      setSession(data.user, data.accessToken)
      return { requiresTwoFactor: false as const }
    })

  /**
   * Second sign-in step with an authenticator or backup code.
   * @param challengeToken - Token from `login`.
   * @param code - Six-digit app code or `xxxx-xxxx` backup code.
   */
  const verifyTwoFactor = (challengeToken: string, code: string) =>
    run('Verification failed', async () => {
      const response = await authAPI.verifyTwoFactor(challengeToken, code)
      setSession(response.data.data.user, response.data.data.accessToken)
    })

  /**
   * Creates an account. No session is started: the user must verify their email first.
   * @param userData - Username, email, and password.
   * @returns The email the verification code was sent to.
   */
  const register = (userData: RegisterData) =>
    run('Registration failed', async () => {
      const response = await authAPI.register(userData)
      return { email: response.data.data.email as string }
    })

  /**
   * Verifies an email with its emailed code and signs the user in.
   * @returns `alreadyVerified` when the account needs a normal sign-in instead.
   */
  const verifyEmail = (email: string, code: string) =>
    run('Verification failed', async () => {
      const response = await authAPI.verifyEmail(email, code)
      const data = response.data.data
      if (data?.alreadyVerified) return { alreadyVerified: true }
      setSession(data.user, data.accessToken)
      return { alreadyVerified: false }
    })

  /**
   * Clears the in-memory session and removes token/user from localStorage.
   */
  const logout = () => {
    user.value = null
    token.value = null
    localStorage.removeItem('token')
    localStorage.removeItem('user')
  }

  /**
   * Reloads the user from `/auth/profile` using the stored token.
   * Logs out only on 401; other failures leave the session intact.
   * @returns Resolves when the profile is stored, or immediately if there is no token.
   */
  const loadUser = async () => {
    if (!token.value) return

    try {
      const response = await authAPI.getProfile()
      user.value = response.data.data.user
      localStorage.setItem('user', JSON.stringify(user.value))
    } catch (err: unknown) {
      console.error('Error loading user:', err)
      const apiError = err as { response?: { status?: number } }
      // Only logout on 401 (expired/invalid token); keep the session for other failures.
      if (apiError.response?.status === 401) {
        logout()
      }
      throw err
    }
  }

  /**
   * Updates profile fields and writes the returned user back to localStorage.
   * @param data - Partial profile payload (username, email, picture, preferences).
   * @returns The update API payload.
   */
  const updateProfile = async (data: UpdateProfileData) => {
    try {
      isLoading.value = true
      error.value = null

      const response = await authAPI.updateProfile(data)
      user.value = response.data.data.user
      localStorage.setItem('user', JSON.stringify(user.value))

      return response.data
    } catch (err: unknown) {
      const apiError = err as { response?: { data?: { message?: string } } }
      error.value = apiError.response?.data?.message || 'Profile update failed'
      throw err
    } finally {
      isLoading.value = false
    }
  }

  /**
   * Changes the signed-in user's password. Rejected for the shared demo account.
   * @param data - Current and new password.
   * @returns The change-password API payload.
   */
  const changePassword = async (data: { currentPassword: string; newPassword: string }) => {
    if (isDemoUser.value) {
      error.value = 'Password cannot be changed for the demo account.'
      throw new Error(error.value)
    }

    try {
      isLoading.value = true
      error.value = null

      const response = await authAPI.changePassword(data)
      return response.data
    } catch (err: unknown) {
      const apiError = err as { response?: { data?: { message?: string } } }
      error.value = apiError.response?.data?.message || 'Password change failed'
      throw err
    } finally {
      isLoading.value = false
    }
  }

  /**
   * Permanently deletes the signed-in account (password re-check), then clears the session.
   * Rejected for the shared demo account.
   * @param password - Current password, re-entered to confirm.
   */
  const deleteAccount = async (password: string) => {
    if (isDemoUser.value) {
      error.value = 'The demo account cannot be deleted.'
      throw new Error(error.value)
    }

    try {
      isLoading.value = true
      error.value = null

      await authAPI.deleteAccount(password)
      logout()
    } catch (err: unknown) {
      const apiError = err as { response?: { data?: { message?: string } } }
      error.value = apiError.response?.data?.message || 'Account deletion failed'
      throw err
    } finally {
      isLoading.value = false
    }
  }

  /**
   * Uploads a profile picture and persists the returned user.
   * @param formData - Multipart body containing the image file.
   * @returns The upload API payload.
   */
  const uploadProfilePicture = async (formData: FormData) => {
    try {
      isLoading.value = true
      error.value = null

      const response = await authAPI.uploadProfilePicture(formData)
      user.value = response.data.data.user
      localStorage.setItem('user', JSON.stringify(user.value))

      return response.data
    } catch (err: unknown) {
      const apiError = err as { response?: { data?: { message?: string } } }
      error.value = apiError.response?.data?.message || 'Profile picture upload failed'
      throw err
    } finally {
      isLoading.value = false
    }
  }

  /**
   * Hydrates `user` from localStorage when a token is already present.
   * Clears both token and user if the saved JSON is invalid.
   */
  const initAuth = () => {
    const savedUser = localStorage.getItem('user')
    if (savedUser && token.value) {
      try {
        user.value = JSON.parse(savedUser)
      } catch (error) {
        console.error('Error parsing saved user:', error)
        localStorage.removeItem('user')
        localStorage.removeItem('token')
        user.value = null
        token.value = null
      }
    }
  }

  return {
    user,
    token,
    isLoading,
    error,
    errorCode,
    isAuthenticated,
    isDemoUser,
    login,
    verifyTwoFactor,
    register,
    verifyEmail,
    logout,
    loadUser,
    updateProfile,
    changePassword,
    deleteAccount,
    uploadProfilePicture,
    initAuth,
  }
})
