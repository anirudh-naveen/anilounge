/**
 * HTTP handlers for the homepage sections.
 *
 * Layer: controller. Activity requires auth; release updates personalize when a
 * token is present; the character of the day is public.
 */

import homeService from '../services/homeService.js'

/**
 * Viewer and friend watchlist changes, newest first.
 *
 * @param {import('express').Request} req - `req.user` from auth middleware.
 * @param {import('express').Response} res - 200 `{ data: { personal, friends, friendCount } }` or 500.
 * @returns {Promise<void>}
 */
export const getActivity = async (req, res) => {
  try {
    const data = await homeService.getActivityFeed(req.user._id)
    res.json({ success: true, data })
  } catch (error) {
    console.error('Error fetching home activity:', error)
    res.status(500).json({ success: false, message: 'Error fetching activity' })
  }
}

/**
 * New episodes and upcoming titles for the viewer's watchlist, or trending ones.
 *
 * @param {import('express').Request} req - Optional `req.user`.
 * @param {import('express').Response} res - 200 `{ data: { source, items } }` or 500.
 * @returns {Promise<void>}
 */
export const getUpdates = async (req, res) => {
  try {
    const data = await homeService.getReleaseUpdates(req.user?._id || null)
    res.json({ success: true, data })
  } catch (error) {
    console.error('Error fetching home updates:', error)
    res.status(500).json({ success: false, message: 'Error fetching updates' })
  }
}

/**
 * Today's featured character.
 *
 * @param {import('express').Request} req
 * @param {import('express').Response} res - 200 `{ data: { day, character } | null }` or 500.
 * @returns {Promise<void>}
 */
export const getCharacterOfTheDay = async (req, res) => {
  try {
    const data = await homeService.getCharacterOfTheDay()
    res.json({ success: true, data })
  } catch (error) {
    console.error('Error fetching character of the day:', error)
    res.status(500).json({ success: false, message: 'Error fetching character of the day' })
  }
}

export default {
  getActivity,
  getUpdates,
  getCharacterOfTheDay,
}
