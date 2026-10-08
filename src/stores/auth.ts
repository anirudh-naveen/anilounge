/**
 * auth.ts — Pinia auth store.
 *
 * Holds the current user and in-memory access token (restored from the httpOnly
 * session cookie, so users stay signed in across browser restarts), and exposes
 * login (with the 2FA step), register and email verification, profile, and
 * session helpers used by views and the router.
 */

import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { authAPI, onSessionChange, refreshSession, setAccessToken } from '@/services/api'
import type { User, LoginCredentials, RegisterData, UpdateProfileData } from '@/types'

const DEMO_USER_EMAIL = 'demo@findanimation.com'

export const useAuthStore = defineStore('auth', () => {
  const user = ref<User | null>(null)
  // In memory only: page scripts never persist the access token. The httpOnly session
  // cookie restores it on load (`restoreSession`) and when it expires (api interceptor).
  const token = ref<string | null>(null)
  const isLoading = ref(false)
  const error = ref<string | null>(null)

  const isAuthenticated = computed(() => !!token.value)
  /** True for the shared recruiter demo account, which cannot change its password. */
  const isDemoUser = computed(
    () =>
      Boolean(user.value?.isDemoAccount) || user.value?.email?.toLowerCase() === DEMO_USER_EMAIL,
  )

  /** Admin role or ADMIN_EMAILS owner; the server enforces this, the UI only uses it to show the page. */
  const isAdmin = computed(() => Boolean(user.value?.isAdmin))
  /** The site creator: the only one who can add/remove admins and ban users. */
  const isCreator = computed(() => isAdmin.value && user.value?.role === 'creator')
  /** Admins, plus Developer-badge holders (who only get the admin page's Content tab). */
  const canEditContent = computed(() => isAdmin.value || Boolean(user.value?.canEditContent))

  /** Machine-readable code from the last failed call (e.g. `EMAIL_NOT_VERIFIED`, `ACCOUNT_LOCKED`). */
  const errorCode = ref<string | null>(null)

  type ApiError = { response?: { data?: { message?: string; code?: string }; status?: number } }

  const captureError = (err: unknown, fallback: string) => {
    const apiError = err as ApiError
    error.value = apiError.response?.data?.message || fallback
    errorCode.value = apiError.response?.data?.code || null
  }

  /**
   * Stores a signed-in user plus access token in memory.
   * @param userData - User returned by a sign-in endpoint.
   * @param authToken - Access JWT.
   */
  const setSession = (userData: User, authToken: string) => {
    user.value = userData
    token.value = authToken
    setAccessToken(authToken)
  }

  /** Forgets the session in this tab without calling the server. */
  const clearSession = () => {
    user.value = null
    token.value = null
    setAccessToken(null)
  }

  // Keep the store in step with refreshes done by the api interceptor.
  onSessionChange((session) => {
    if (session) {
      token.value = session.accessToken
      if (!user.value) user.value = session.user as User
    } else {
      clearSession()
    }
  })

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
   * Signs out this browser: revokes the session cookie server-side and clears local state.
   */
  const logout = async () => {
    try {
      await authAPI.logout()
    } catch (err) {
      console.error('Sign-out request failed:', err)
    }
    clearSession()
  }

  /**
   * Revokes every session for this account (all browsers and devices), including this one.
   */
  const signOutEverywhere = async () => {
    await authAPI.signOutEverywhere()
    clearSession()
  }

  /**
   * Reloads the user from `/auth/profile` using the in-memory token.
   * Logs out only on 401; other failures leave the session intact.
   * @returns Resolves when the profile is stored, or immediately if there is no token.
   */
  const loadUser = async () => {
    if (!token.value) return

    try {
      const response = await authAPI.getProfile()
      user.value = response.data.data.user
    } catch (err: unknown) {
      console.error('Error loading user:', err)
      const apiError = err as { response?: { status?: number } }
      // A 401 here means the cookie refresh also failed; keep the session for other failures.
      if (apiError.response?.status === 401) {
        clearSession()
      }
      throw err
    }
  }

  /**
   * Updates profile fields and stores the returned user.
   * @param data - Partial profile payload (username, email, picture, preferences).
   * @returns The update API payload.
   */
  const updateProfile = (data: UpdateProfileData) =>
    run('Profile update failed', async () => {
      const response = await authAPI.updateProfile(data)
      user.value = response.data.data.user
      return response.data
    })

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

    return run('Password change failed', async () => {
      const response = await authAPI.changePassword(data)
      return response.data
    })
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

    return run('Account deletion failed', async () => {
      await authAPI.deleteAccount(password)
      clearSession()
    })
  }

  /**
   * Uploads a profile picture and persists the returned user.
   * @param formData - Multipart body containing the image file.
   * @returns The upload API payload.
   */
  const uploadProfilePicture = (formData: FormData) =>
    run('Profile picture upload failed', async () => {
      const response = await authAPI.uploadProfilePicture(formData)
      // The upload response is a partial user; keep fields like isDemoAccount.
      user.value = { ...user.value, ...response.data.data.user }
      return response.data
    })

  /**
   * Removes the profile picture. Rejected by the server for the demo account.
   */
  const removeProfilePicture = () =>
    run('Failed to remove profile picture', async () => {
      await authAPI.removeProfilePicture()
      if (user.value) user.value = { ...user.value, profilePicture: undefined }
    })

  let restoring: Promise<void> | null = null

  /**
   * Restores a signed-in session from the httpOnly cookie (keeps users logged in across
   * browser restarts). Runs once; later calls return the same promise.
   */
  const restoreSession = () => {
    if (!restoring) {
      // Tokens used to be kept in localStorage; drop anything left from older builds.
      localStorage.removeItem('token')
      localStorage.removeItem('user')
      restoring = refreshSession()
        .then((session) => {
          if (session) setSession(session.user as User, session.accessToken)
        })
        .catch((err) => console.error('Session restore failed:', err))
    }
    return restoring
  }

  return {
    user,
    token,
    isLoading,
    error,
    errorCode,
    isAuthenticated,
    isDemoUser,
    isAdmin,
    canEditContent,
    isCreator,
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
    removeProfilePicture,
    restoreSession,
    signOutEverywhere,
  }
})
