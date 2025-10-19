import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { authAPI } from '@/services/api'
import type { User } from '@/types'

export const useAuthStore = defineStore('auth', () => {
  const user = ref<User | null>(null)
  const token = ref<string | null>(localStorage.getItem('token'))
  const isLoading = ref(false)
  const error = ref<string | null>(null)

  const isAuthenticated = computed(() => !!token.value)

  const login = async (credentials) => {
    try {
      isLoading.value = true
      error.value = null

      const response = await authAPI.login(credentials)
      const { user: userData, token: authToken } = response.data.data

      user.value = userData
      token.value = authToken

      localStorage.setItem('token', authToken)
      localStorage.setItem('user', JSON.stringify(userData))

      return response.data
    } catch (err) {
      error.value = err.response?.data?.message || 'Login failed'
      throw err
    } finally {
      isLoading.value = false
    }
  }

  const register = async (userData) => {
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
    } catch (err) {
      error.value = err.response?.data?.message || 'Registration failed'
      throw err
    } finally {
      isLoading.value = false
    }
  }

  const logout = () => {
    user.value = null
    token.value = null
    localStorage.removeItem('token')
    localStorage.removeItem('user')
  }

  const loadUser = async () => {
    if (!token.value) return

    try {
      const response = await authAPI.getProfile()
      user.value = response.data.data.user
      localStorage.setItem('user', JSON.stringify(user.value))
    } catch (err) {
      console.error('Error loading user:', err)
      // Only logout if it's an authentication error (401)
      if (err.response?.status === 401) {
        logout()
      }
      // For other errors, just throw them without logging out
      throw err
    }
  }

  const updateProfile = async (data) => {
    try {
      isLoading.value = true
      error.value = null

      const response = await authAPI.updateProfile(data)
      user.value = response.data.data.user
      localStorage.setItem('user', JSON.stringify(user.value))

      return response.data
    } catch (err) {
      error.value = err.response?.data?.message || 'Profile update failed'
      throw err
    } finally {
      isLoading.value = false
    }
  }

  // Initialize user from localStorage
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
    initAuth,
  }
})
