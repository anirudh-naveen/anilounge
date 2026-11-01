/**
 * HTTP handler for "Recommended for you" on the Search tab.
 *
 * Layer: controller. Requires auth; picks come from the viewer's ratings.
 */

import recommendationService from '../services/recommendationService.js'

/**
 * Picks for the viewer on the Movies (`type=movie`) or Series (`type=tv`) tab.
 *
 * @param {import('express').Request} req - `req.user` from auth middleware; `type`, `limit` query.
 * @param {import('express').Response} res - 200 `{ data: { status, items, rated?, needed? } }` or 500.
 * @returns {Promise<void>}
 */
export const getRecommendations = async (req, res) => {
  try {
    const type = req.query.type === 'movie' ? 'movie' : 'tv'
    const limit = Math.min(40, Math.max(1, Number.parseInt(req.query.limit, 10) || 20))
    const data = await recommendationService.getRecommendationsForUser(req.user._id, {
      type,
      limit,
    })
    res.json({ success: true, data })
  } catch (error) {
    console.error('Error fetching recommendations:', error)
    res.status(500).json({ success: false, message: 'Error fetching recommendations' })
  }
}

export default { getRecommendations }
