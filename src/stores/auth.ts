/**
 * auth.ts — Pinia auth store.
 *
 * Holds the current user and JWT, persists them to localStorage, and exposes
 * login, register, profile, and session helpers used by views and the router.
 */

import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { authAPI } from '@/services/api'
import type { User, LoginCredentials, RegisterData, UpdateProfileData } from '@/types'

export const useAuthStore = defineStore('auth', () => {
  const user = ref<User | null>(null)
  const token = ref<string | null>(localStorage.getItem('token'))
  const isLoading = ref(false)
  const error = ref<string | null>(null)

  const isAuthenticated = computed(() => !!token.value)

  /**
   * Signs in and stores the user plus access token in memory and localStorage.
   * @param credentials - Email and password.
   * @returns The login API payload.
   */
  const login = async (credentials: LoginCredentials) => {
    try {
      isLoading.value = true
      error.value = null

      const response = await authAPI.login(credentials)
      const { user: userData, accessToken: authToken } = response.data.data

      user.value = userData
      token.value = authToken

      localStorage.setItem('token', authToken)
      localStorage.setItem('user', JSON.stringify(userData))

      return response.data
    } catch (err: unknown) {
      const apiError = err as { response?: { data?: { message?: string }; status?: number } }
      error.value = apiError.response?.data?.message || 'Login failed'
      throw err
    } finally {
      isLoading.value = false
    }
  }

  /**
   * Creates an account and stores the new session like `login`.
   * @param userData - Username, email, and password.
   * @returns The register API payload.
   */
  const register = async (userData: RegisterData) => {
    try {
      isLoading.value = true
      error.value = null

      const response = await authAPI.register(userData)
      const { user: newUser, token: authToken } = response.data.data

      user.value = newUser
      token.value = authToken

      localStorage.setItem('token', authToken)
      localStorage.setItem('user', JSON.stringify(newUser))

      return response.data
    } catch (err: unknown) {
      const apiError = err as { response?: { data?: { message?: string }; status?: number } }
      error.value = apiError.response?.data?.message || 'Registration failed'
      throw err
    } finally {
      isLoading.value = false
    }
  }

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
   * Changes the signed-in user's password.
   * @param data - Current and new password.
   * @returns The change-password API payload.
   */
  const changePassword = async (data: { currentPassword: string; newPassword: string }) => {
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
    isAuthenticated,
    login,
    register,
    logout,
    loadUser,
    updateProfile,
    changePassword,
    uploadProfilePicture,
    initAuth,
  }
})
