/**
 * HTTP handlers for catalog entities (characters, voice actors, and studios).
 *
 * Layer: controller. Ingests character lists for a title on read, supports
 * search/detail, and toggles per-user favorites.
 */

import Content from '../models/Content.js'
import Entity from '../models/Entity.js'
import { query } from '../../config/postgres.js'
import {
  ensureCharacterAbout,
  ensureCharactersForContent,
  ensureStudioDetails,
  ensureVoiceActorAbout,
  ensureVoiceActorCredits,
  ensureVoiceActorsForCharacter,
  searchEntities,
  serializeEntity,
  serializeEntityDetails,
} from '../services/entityService.js'
import { entityToSearchHit } from '../utils/entities.js'

/**
 * Whether the signed-in user has favorited this entity.
 * @param {object|null} user
 * @param {string} entityId
 * @returns {Promise<boolean>}
 */
async function userHasFavorite(user, entityId) {
  if (!user) return false
  const { rows } = await query(
    'SELECT 1 FROM favorites WHERE user_id = $1 AND content_id = $2',
    [user._id, String(entityId)],
  )
  return rows.length > 0
}

/**
 * Characters appearing in a catalog title. Triggers Jikan/TMDB ingest when stale.
 *
 * @param {import('express').Request} req - Reads `params.id`.
 * @param {import('express').Response} res
 * @returns {Promise<void>}
 */
export const getContentCharacters = async (req, res) => {
  try {
    const content = await Content.findById(req.params.id)
    if (!content) {
      return res.status(404).json({ success: false, message: 'Content not found' })
    }
    const docs = await ensureCharactersForContent(content)
    res.json({
      success: true,
      data: docs.map((doc) => serializeEntity(doc)),
    })
  } catch (error) {
    console.error('Error fetching content characters:', error)
    res.status(500).json({ success: false, message: 'Error fetching characters' })
  }
}

/**
 * Search persisted entities by name. Defaults to characters.
 *
 * @param {import('express').Request} req - Reads `query.q`, `query.type`, `query.limit`.
 * @param {import('express').Response} res
 * @returns {Promise<void>}
 */
export const searchCatalogEntities = async (req, res) => {
  try {
    const q = String(req.query.q || req.query.query || '').trim()
    const entityType = String(req.query.type || 'character')
    const limit = parseInt(String(req.query.limit), 10) || 20
    const docs = await searchEntities(q, { entityType, limit })
    res.json({
      success: true,
      data: docs.map(entityToSearchHit).filter(Boolean),
    })
  } catch (error) {
    console.error('Error searching entities:', error)
    res.status(500).json({ success: false, message: 'Error searching entities' })
  }
}

/**
 * One entity detail page, with appearance titles populated.
 *
 * @param {import('express').Request} req - Reads `params.id`.
 * @param {import('express').Response} res
 * @returns {Promise<void>}
 */
export const getEntityById = async (req, res) => {
  try {
    let entity = await Entity.findById(req.params.id)
    if (!entity) {
      return res.status(404).json({ success: false, message: 'Entity not found' })
    }
    if (entity.entityType === 'character') {
      await ensureCharacterAbout(entity)
      await ensureVoiceActorsForCharacter(entity)
    }
    if (entity.entityType === 'voice_actor') {
      await ensureVoiceActorAbout(entity)
      entity = (await ensureVoiceActorCredits(entity)) || entity
    }
    if (entity.entityType === 'studio') {
      await ensureStudioDetails(entity)
    }
    const isFavorited = await userHasFavorite(req.user, entity._id)
    res.json({
      success: true,
      data: await serializeEntityDetails(entity, { isFavorited }),
    })
  } catch (error) {
    console.error('Error fetching entity:', error)
    res.status(500).json({ success: false, message: 'Error fetching entity' })
  }
}

/**
 * Add an entity to the signed-in user's favorites.
 *
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @returns {Promise<void>}
 */
export const favoriteEntity = async (req, res) => {
  try {
    const entity = await Entity.findById(req.params.id)
    if (!entity) {
      return res.status(404).json({ success: false, message: 'Entity not found' })
    }
    // favoritesCount is counted from `favorites` when read; only the response needs bumping.
    const { rowCount } = await query(
      `INSERT INTO favorites (user_id, content_id) VALUES ($1, $2)
       ON CONFLICT (user_id, content_id) DO NOTHING`,
      [req.user._id, entity._id],
    )
    if (rowCount) entity.favoritesCount = (entity.favoritesCount || 0) + 1
    res.json({
      success: true,
      data: await serializeEntityDetails(entity, { isFavorited: true }),
    })
  } catch (error) {
    console.error('Error favoriting entity:', error)
    res.status(500).json({ success: false, message: 'Error updating favorite' })
  }
}

/**
 * Remove an entity from the signed-in user's favorites.
 *
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @returns {Promise<void>}
 */
export const unfavoriteEntity = async (req, res) => {
  try {
    const entity = await Entity.findById(req.params.id)
    if (!entity) {
      return res.status(404).json({ success: false, message: 'Entity not found' })
    }
    const { rowCount } = await query(
      'DELETE FROM favorites WHERE user_id = $1 AND content_id = $2',
      [req.user._id, entity._id],
    )
    if (rowCount) entity.favoritesCount = Math.max(0, (entity.favoritesCount || 0) - 1)
    res.json({
      success: true,
      data: await serializeEntityDetails(entity, { isFavorited: false }),
    })
  } catch (error) {
    console.error('Error unfavoriting entity:', error)
    res.status(500).json({ success: false, message: 'Error updating favorite' })
  }
}

export default {
  getContentCharacters,
  searchCatalogEntities,
  getEntityById,
  favoriteEntity,
  unfavoriteEntity,
}
