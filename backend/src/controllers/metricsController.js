/**
 * Site metrics HTTP handlers: the app reports page views and clicks; admins read totals.
 *
 * Layer: controller. Recording is public (optional auth tags signed-in visitors) and always
 * answers 204 so a tracking hiccup never surfaces in the app. Logic: `services/metricsService.js`.
 */

import * as metricsService from '../services/metricsService.js'
import { sendError } from '../utils/httpError.js'

/**
 * Store a batch of page-view/click events.
 *
 * @param {import('express').Request} req - `body.visitorId`, `body.events` `[{ type, path, target?, referrer? }]`.
 * @param {import('express').Response} res - 204.
 * @returns {Promise<void>}
 */
export const recordEvents = async (req, res) => {
  await metricsService.recordEvents(req)
  res.status(204).end()
}

/**
 * Users, views, visitors, clicks, a daily series, and top pages/clicks/referrers.
 *
 * @param {import('express').Request} req - `query.days` (1-365, default 30).
 * @param {import('express').Response} res - 200 `{ data }` or 500.
 * @returns {Promise<void>}
 */
export const getMetrics = async (req, res) => {
  try {
    const data = await metricsService.getMetrics(req.query)
    res.json({ success: true, data })
  } catch (error) {
    sendError(res, error, 'Error loading metrics')
  }
}

export default { recordEvents, getMetrics }
