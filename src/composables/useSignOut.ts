/**
 * Sign out after a confirm, clear per-user state, and go home. Used by the site's user
 * menu and the app layout's Settings page.
 */
import { useRouter } from 'vue-router'
import { useToast } from 'vue-toastification'
import { useAuthStore } from '@/stores/auth'
import { useFavoritesStore } from '@/stores/favorites'

export function useSignOut() {
  const router = useRouter()
  const toast = useToast()
  const authStore = useAuthStore()
  const favoritesStore = useFavoritesStore()

  /** @returns Whether the user went ahead and signed out. */
  return async (): Promise<boolean> => {
    if (!confirm('Are you sure you want to logout?')) return false
    await authStore.logout()
    favoritesStore.reset()
    toast.success('Logged out successfully!')
    router.push('/')
    return true
  }
}
