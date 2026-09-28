/**
 * Public user profiles, profile customization, and title favorites.
 *
 * Layer: controller. Serves the shareable `/users/:username` profile (favorites,
 * watchlist, and stats tabs, filtered by the owner's visibility settings),
 * saves profile settings, and toggles favorites on movies, series, and specials.
 */

import { query } from '../../config/postgres.js'
import { WATCHABLE_KINDS } from '../db/kinds.js'
import { attachContentRelations, mapContentRow } from '../models/Content.js'
import Entity from '../models/Entity.js'
import User from '../models/User.js'
import { serializeEntity } from '../utils/entities.js'
import { computeProfileStats } from '../utils/profileStats.js'
import {
  normalizePreferences,
  normalizeProfileSettings,
  PROFILE_BIO_MAX,
} from '../utils/profileSettings.js'

const PUBLIC_CONTENT_FIELDS = [
  '_id',
  'title',
  'englishTitle',
  'nativeTitle',
  'contentType',
  'posterPath',
  'releaseDate',
  'runtime',
  'episodeCount',
  'malEpisodes',
  'unifiedScore',
  'genres',
  'malStatus',
  'nextEpisodeAirDate',
]

/**
 * Card-sized projection of a catalog title.
 * @param {object} content
 * @returns {object}
 */
function slimContent(content) {
  const out = {}
  for (const field of PUBLIC_CONTENT_FIELDS) out[field] = content[field]
  return out
}

/**
 * Card-sized projection of a favorited character, voice actor, or studio.
 * @param {object} entity
 * @returns {object}
 */
function slimEntity(entity) {
  const { appearances, about, alternativeNames, ...rest } = serializeEntity(entity, {
    isFavorited: true,
  })
  return rest
}

/**
 * Favorited titles for a user, newest first, with genres attached.
 * @param {string} userId
 * @returns {Promise<object[]>}
 */
async function loadFavoriteContent(userId) {
  const { rows } = await query(
    `SELECT w.*, f.added_at AS favorited_at
     FROM favorites f
     JOIN works w ON w.id = f.content_id
     WHERE f.user_id = $1
     ORDER BY f.added_at DESC`,
    [userId],
  )
  const docs = await attachContentRelations(rows.map(mapContentRow))
  return docs.map(slimContent)
}

/**
 * Favorited entities for a user, newest first, grouped by type.
 * @param {object} user - Loaded `User` with `favoriteEntities`.
 * @returns {Promise<{ characters: object[], voiceActors: object[], studios: object[] }>}
 */
async function loadFavoriteEntities(user) {
  const rows = (user.favoriteEntities || []).filter((row) =>
    ['character', 'voice', 'studio'].includes(row.kind),
  )
  const groups = { characters: [], voiceActors: [], studios: [] }
  if (!rows.length) return groups
  const entities = await Entity.find({ _id: { $in: rows.map((row) => row.entity) } })
  const byId = new Map(entities.map((entity) => [String(entity._id), entity]))
  const ordered = [...rows].sort((a, b) => new Date(b.addedAt) - new Date(a.addedAt))
  for (const row of ordered) {
    const entity = byId.get(String(row.entity))
    if (!entity) continue
    const slim = slimEntity(entity)
    if (slim.entityType === 'character') groups.characters.push(slim)
    else if (slim.entityType === 'voice_actor') groups.voiceActors.push(slim)
    else if (slim.entityType === 'studio') groups.studios.push(slim)
  }
  return groups
}

/**
 * Public profile for `params.username`.
 * Private profiles and hidden tabs are only returned to the owner; email and
 * watchlist notes are never included.
 *
 * @param {import('express').Request} req - Reads `params.username`; `req.user` when signed in.
 * @param {import('express').Response} res - 200 `{ data: profile }`, 404 unknown or private, or 500.
 * @returns {Promise<void>}
 */
export const getPublicProfile = async (req, res) => {
  try {
    const username = String(req.params.username || '').trim()
    const user = username
      ? await User.findOne({ username }).populate({ path: 'watchlist.content' })
      : null
    const isOwner = Boolean(user && req.user && String(req.user._id) === String(user._id))
    const settings = user ? normalizeProfileSettings(user.profileSettings) : null

    if (!user || (!settings.isPublic && !isOwner)) {
      return res.status(404).json({ success: false, message: 'Profile not found.' })
    }

    const visibleTabs = settings.tabOrder.filter(
      (tab) => isOwner || !settings.hiddenTabs.includes(tab),
    )
    const shows = (tab) => visibleTabs.includes(tab)
    const watchlistRows = (user.watchlist || []).filter(
      (item) => item.content && typeof item.content === 'object',
    )

    const [favoriteContent, favoriteEntities] = shows('favorites')
      ? await Promise.all([loadFavoriteContent(user._id), loadFavoriteEntities(user)])
      : [[], null]

    res.json({
      success: true,
      data: {
        user: {
          id: user._id,
          username: user.username,
          profilePicture: user.profilePicture,
          bio: user.bio || '',
          createdAt: user.createdAt,
          preferences: normalizePreferences(user.preferences),
        },
        settings,
        isOwner,
        tabs: visibleTabs,
        favorites: shows('favorites')
          ? { content: favoriteContent, ...favoriteEntities }
          : null,
        watchlist: shows('watchlist')
          ? watchlistRows.map((item) => ({
              content: slimContent(item.content),
              status: item.status,
              rating: item.rating,
              currentEpisode: item.currentEpisode,
              addedAt: item.addedAt,
              updatedAt: item.updatedAt,
            }))
          : null,
        stats: shows('stats') ? computeProfileStats(watchlistRows) : null,
      },
    })
  } catch (error) {
    console.error('Error fetching public profile:', error)
    res.status(500).json({ success: false, message: 'Error fetching profile' })
  }
}

/**
 * Save profile customization (visibility, accent, headline, tabs) and bio.
 *
 * @param {import('express').Request} req - Optional `body.settings` (partial) and `body.bio`.
 * @param {import('express').Response} res - 200 `{ data: { settings, bio } }`, 400 bio too long, 404, or 500.
 * @returns {Promise<void>}
 */
export const updateProfileSettings = async (req, res) => {
  try {
    const { settings, bio } = req.body || {}
    if (bio !== undefined && (typeof bio !== 'string' || bio.length > PROFILE_BIO_MAX)) {
      return res.status(400).json({
        success: false,
        message: `Bio must be ${PROFILE_BIO_MAX} characters or fewer.`,
      })
    }

    const user = await User.findById(req.user._id)
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found.' })
    }

    if (settings !== undefined) {
      user.profileSettings = normalizeProfileSettings(
        settings,
        normalizeProfileSettings(user.profileSettings),
      )
    }
    if (bio !== undefined) user.bio = bio.trim()
    await user.save()

    res.json({
      success: true,
      message: 'Profile updated.',
      data: { settings: normalizeProfileSettings(user.profileSettings), bio: user.bio || '' },
    })
  } catch (error) {
    console.error('Error updating profile settings:', error)
    res.status(500).json({ success: false, message: 'Error updating profile' })
  }
}

/**
 * IDs of the signed-in user's favorited titles (drives card heart state).
 *
 * @param {import('express').Request} req
 * @param {import('express').Response} res - 200 `{ data: string[] }` or 500.
 * @returns {Promise<void>}
 */
export const getFavoriteContentIds = async (req, res) => {
  try {
    const { rows } = await query(
      `SELECT f.content_id
       FROM favorites f
       JOIN content c ON c.id = f.content_id
       WHERE f.user_id = $1 AND c.kind = ANY($2::text[])`,
      [req.user._id, WATCHABLE_KINDS],
    )
    res.json({ success: true, data: rows.map((row) => String(row.content_id)) })
  } catch (error) {
    console.error('Error fetching favorite titles:', error)
    res.status(500).json({ success: false, message: 'Error fetching favorites' })
  }
}

/**
 * Add (`POST`) or remove (`DELETE`) a movie, series, or special from favorites.
 *
 * @param {import('express').Request} req - `params.id` title id; method selects the action.
 * @param {import('express').Response} res - 200 `{ data: { contentId, isFavorited } }`, 404 not a title, or 500.
 * @returns {Promise<void>}
 */
export const toggleContentFavorite = async (req, res) => {
  try {
    const contentId = req.params.id
    const { rows } = await query('SELECT kind FROM content WHERE id = $1', [contentId])
    if (!rows[0] || !WATCHABLE_KINDS.includes(rows[0].kind)) {
      return res.status(404).json({ success: false, message: 'Content not found' })
    }

    const isFavorited = req.method !== 'DELETE'
    if (isFavorited) {
      await query(
        `INSERT INTO favorites (user_id, content_id) VALUES ($1, $2)
         ON CONFLICT (user_id, content_id) DO NOTHING`,
        [req.user._id, contentId],
      )
    } else {
      await query('DELETE FROM favorites WHERE user_id = $1 AND content_id = $2', [
        req.user._id,
        contentId,
      ])
    }

    res.json({ success: true, data: { contentId, isFavorited } })
  } catch (error) {
    console.error('Error updating favorite title:', error)
    res.status(500).json({ success: false, message: 'Error updating favorite' })
  }
}

export default {
  getPublicProfile,
  updateProfileSettings,
  getFavoriteContentIds,
  toggleContentFavorite,
}
