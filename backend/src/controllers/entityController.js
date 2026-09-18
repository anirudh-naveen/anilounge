/**
 * HTTP handlers for catalog entities (characters, and later voice actors / studios).
 *
 * Layer: controller. Ingests character lists for a title on read, supports
 * search/detail, and toggles per-user favorites.
 */

import mongoose from 'mongoose'
import Content from '../models/Content.js'
import Entity from '../models/Entity.js'
import User from '../models/User.js'
import {
  ensureCharacterAbout,
  ensureCharactersForContent,
  searchEntities,
  serializeEntity,
  serializeEntityDetails,
} from '../services/entityService.js'
import { entityToSearchHit } from '../utils/entities.js'

/**
 * Whether the signed-in user has favorited this entity.
 * @param {object|null} user
 * @param {string} entityId
 * @returns {boolean}
 */
function userHasFavorite(user, entityId) {
  const id = String(entityId)
  return Boolean(
    user?.favoriteEntities?.some((row) => String(row.entity) === id),
  )
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
    const entity = await Entity.findById(req.params.id)
    if (!entity) {
      return res.status(404).json({ success: false, message: 'Entity not found' })
    }
    if (entity.entityType === 'character') {
      await ensureCharacterAbout(entity)
    }
    const isFavorited = req.user ? userHasFavorite(req.user, entity._id) : false
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
    const user = await User.findById(req.user._id)
    if (userHasFavorite(user, entity._id)) {
      return res.json({
        success: true,
        data: await serializeEntityDetails(entity, { isFavorited: true }),
      })
    }
    user.favoriteEntities.push({ entity: entity._id, addedAt: new Date() })
    entity.favoritesCount = (entity.favoritesCount || 0) + 1
    await Promise.all([user.save(), entity.save()])
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
    const entityId = req.params.id
    if (!mongoose.Types.ObjectId.isValid(entityId)) {
      return res.status(400).json({ success: false, message: 'Invalid ID format' })
    }
    const entity = await Entity.findById(entityId)
    if (!entity) {
      return res.status(404).json({ success: false, message: 'Entity not found' })
    }
    const user = await User.findById(req.user._id)
    const before = user.favoriteEntities.length
    user.favoriteEntities = user.favoriteEntities.filter(
      (row) => String(row.entity) !== String(entityId),
    )
    if (user.favoriteEntities.length !== before) {
      entity.favoritesCount = Math.max(0, (entity.favoritesCount || 0) - 1)
      await Promise.all([user.save(), entity.save()])
    }
    res.json({
      success: true,
      data: await serializeEntityDetails(entity, { isFavorited: false }),
    })
  } catch (error) {
    console.error('Error unfavoriting entity:', error)
    res.status(500).json({ success: false, message: 'Error updating favorite' })
  }
}

/**
 * Signed-in user's favorited entities, newest first.
 *
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @returns {Promise<void>}
 */
export const getFavoriteEntities = async (req, res) => {
  try {
    const user = await User.findById(req.user._id).populate({
      path: 'favoriteEntities.entity',
    })
    const favorites = (user?.favoriteEntities || [])
      .filter((row) => row.entity)
      .sort((left, right) => new Date(right.addedAt) - new Date(left.addedAt))
      .map((row) => serializeEntity(row.entity, { isFavorited: true }))
    res.json({ success: true, data: favorites })
  } catch (error) {
    console.error('Error fetching favorites:', error)
    res.status(500).json({ success: false, message: 'Error fetching favorites' })
  }
}

export default {
  getContentCharacters,
  searchCatalogEntities,
  getEntityById,
  favoriteEntity,
  unfavoriteEntity,
  getFavoriteEntities,
}
