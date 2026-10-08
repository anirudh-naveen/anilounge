/**
 * entities.ts — Pinia store for catalog characters, voice actors, and studios.
 *
 * Loads title casts and entity detail pages, and toggles entity favorites.
 */

import { defineStore } from 'pinia'
import { entityAPI } from '@/services/api'
import type { CatalogEntity } from '@/types/content'

export const useEntityStore = defineStore('entities', () => {
  /**
   * Characters attached to a movie or series (ingests from Jikan/TMDB on the server).
   */
  const getContentCharacters = async (contentId: string): Promise<CatalogEntity[]> => {
    const response = await entityAPI.getContentCharacters(contentId)
    return (response.data?.data || []) as CatalogEntity[]
  }

  const getEntityDetails = async (id: string): Promise<CatalogEntity> => {
    const response = await entityAPI.getById(id)
    return response.data.data as CatalogEntity
  }

  /** Favorite or unfavorite, returning the entity as the server now sees it. */
  const toggleFavorite = async (entity: CatalogEntity): Promise<CatalogEntity> => {
    const response = entity.isFavorited
      ? await entityAPI.unfavorite(entity._id)
      : await entityAPI.favorite(entity._id)
    return response.data.data as CatalogEntity
  }

  return {
    getContentCharacters,
    getEntityDetails,
    toggleFavorite,
  }
})
