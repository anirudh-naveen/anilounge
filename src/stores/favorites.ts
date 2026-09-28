/**
 * favorites.ts — Pinia store for favorited titles (movies, series, specials).
 *
 * Tracks the signed-in user's favorite title IDs so card hearts can render and
 * toggle without refetching. Character/voice/studio favorites live in `entities`.
 */

import { defineStore } from 'pinia'
import { ref } from 'vue'
import { profileAPI } from '@/services/api'

export const useFavoritesStore = defineStore('favorites', () => {
  const contentIds = ref<Set<string>>(new Set())
  const isLoaded = ref(false)
  const pending = ref<Set<string>>(new Set())
  let loading: Promise<void> | null = null

  /**
   * Fetch favorite title IDs once per session; concurrent callers share the request.
   */
  const load = async (force = false): Promise<void> => {
    if (isLoaded.value && !force) return
    if (!loading) {
      loading = profileAPI
        .getFavoriteContentIds()
        .then((response) => {
          contentIds.value = new Set((response.data?.data || []) as string[])
          isLoaded.value = true
        })
        .finally(() => {
          loading = null
        })
    }
    return loading
  }

  const isFavorite = (id: string) => contentIds.value.has(id)

  /**
   * Flip a title's favorite state, updating the UI first and rolling back on failure.
   * @returns The new favorite state.
   */
  const toggle = async (id: string): Promise<boolean> => {
    if (pending.value.has(id)) return isFavorite(id)
    const next = !isFavorite(id)
    const apply = (value: boolean) => {
      const ids = new Set(contentIds.value)
      if (value) ids.add(id)
      else ids.delete(id)
      contentIds.value = ids
    }
    pending.value = new Set(pending.value).add(id)
    apply(next)
    try {
      if (next) await profileAPI.favoriteContent(id)
      else await profileAPI.unfavoriteContent(id)
      return next
    } catch (err) {
      apply(!next)
      throw err
    } finally {
      const rest = new Set(pending.value)
      rest.delete(id)
      pending.value = rest
    }
  }

  /** Forget cached state (on logout). */
  const reset = () => {
    contentIds.value = new Set()
    isLoaded.value = false
  }

  return { contentIds, isLoaded, pending, load, isFavorite, toggle, reset }
})
