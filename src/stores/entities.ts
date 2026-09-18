/**
 * entities.ts — Pinia store for catalog characters (and later VAs/studios).
 *
 * Loads title casts, entity detail pages, search hits, and profile favorites.
 */

import { defineStore } from 'pinia'
import { ref } from 'vue'
import { entityAPI } from '@/services/api'
import type { CatalogEntity } from '@/types/content'

export const useEntityStore = defineStore('entities', () => {
  const currentEntity = ref<CatalogEntity | null>(null)
  const favorites = ref<CatalogEntity[]>([])
  const isLoading = ref(false)
  const error = ref<string | null>(null)

  /**
   * Characters attached to a movie or series (ingests from Jikan/TMDB on the server).
   */
  const getContentCharacters = async (contentId: string): Promise<CatalogEntity[]> => {
    const response = await entityAPI.getContentCharacters(contentId)
    return (response.data?.data || []) as CatalogEntity[]
  }

  const getEntityDetails = async (id: string): Promise<CatalogEntity> => {
    isLoading.value = true
    error.value = null
    try {
      const response = await entityAPI.getById(id)
      currentEntity.value = response.data.data as CatalogEntity
      return currentEntity.value
    } catch (err) {
      error.value = err instanceof Error ? err.message : 'Failed to load'
      throw err
    } finally {
      isLoading.value = false
    }
  }

  const loadFavorites = async (): Promise<CatalogEntity[]> => {
    const response = await entityAPI.getFavorites()
    favorites.value = (response.data?.data || []) as CatalogEntity[]
    return favorites.value
  }

  const toggleFavorite = async (entity: CatalogEntity): Promise<CatalogEntity> => {
    const response = entity.isFavorited
      ? await entityAPI.unfavorite(entity._id)
      : await entityAPI.favorite(entity._id)
    const updated = response.data.data as CatalogEntity
    if (currentEntity.value && currentEntity.value._id === updated._id) {
      currentEntity.value = updated
    }
    if (updated.isFavorited) {
      if (!favorites.value.some((row) => row._id === updated._id)) {
        favorites.value = [updated, ...favorites.value]
      }
    } else {
      favorites.value = favorites.value.filter((row) => row._id !== updated._id)
    }
    return updated
  }

  return {
    currentEntity,
    favorites,
    isLoading,
    error,
    getContentCharacters,
    getEntityDetails,
    loadFavorites,
    toggleFavorite,
  }
})
