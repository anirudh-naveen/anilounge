/**
 * Search's "Recommended for you" rail: picks for the signed-in user from the titles
 * they rated highest, per Movies / Series tab. Module state, so picks survive opening
 * a title and coming back; fetched again for another account or after `reload`.
 */
import { reactive } from 'vue'
import { recommendationsAPI } from '@/services/api'
import type { UnifiedContent } from '@/types/content'

export type RecommendationType = 'movie' | 'tv'

export interface RecommendationRail {
  loading: boolean
  loaded: boolean
  /** 'needs_ratings': the user has rated fewer than `needed` titles. */
  status: 'ok' | 'needs_ratings' | 'error'
  rated: number
  needed: number
  items: UnifiedContent[]
}

const emptyRail = (): RecommendationRail => ({
  loading: false,
  loaded: false,
  status: 'ok',
  rated: 0,
  needed: 5,
  items: [],
})

const state = reactive({
  userKey: '' as string,
  rails: { movie: emptyRail(), tv: emptyRail() } as Record<RecommendationType, RecommendationRail>,
})

/**
 * Load a tab's picks once per user (or again with `force`).
 * @param type - Search tab
 * @param userKey - Signed-in user's id; another user's picks are dropped first
 * @param force - Refetch even if loaded
 */
async function load(type: RecommendationType, userKey: string, force = false) {
  if (state.userKey !== userKey) {
    state.userKey = userKey
    state.rails = { movie: emptyRail(), tv: emptyRail() }
  }
  const rail = state.rails[type]
  if (rail.loading || (rail.loaded && !force)) return
  rail.loading = true
  try {
    const response = await recommendationsAPI.list(type)
    const data = response.data?.data || {}
    rail.status = data.status === 'needs_ratings' ? 'needs_ratings' : 'ok'
    rail.rated = Number(data.rated) || 0
    rail.needed = Number(data.needed) || 5
    rail.items = data.items || []
  } catch (error) {
    console.error('Error loading recommendations:', error)
    rail.status = 'error'
    rail.items = []
  } finally {
    rail.loading = false
    rail.loaded = true
  }
}

export function usePersonalRecommendations() {
  return { state, load }
}
