/**
 * HTTP handlers for a title's links out to other apps (where to watch it, its upcoming
 * episodes as a calendar file) and to other titles ("watchers who liked this also liked").
 *
 * Layer: controller. Public; rules live in `services/watchProviderService.js`,
 * `services/calendarService.js`, and `services/recommendationService.js`.
 */

import { getWhereToWatch } from '../services/watchProviderService.js'
import { episodeCalendarFor } from '../services/calendarService.js'
import { sendError } from '../utils/httpError.js'
import { getSimilarTitles } from '../services/recommendationService.js'

/**
 * Streaming links and services for a title in the viewer's country.
 *
 * @param {import('express').Request} req - `params.id`, optional `query.region` (two letters).
 * @param {import('express').Response} res - 200 `{ data: { region, streaming, providers } }`, 404, or 500.
 * @returns {Promise<void>}
 */
export const whereToWatch = async (req, res) => {
  try {
    const data = await getWhereToWatch(req.params.id, req.query.region)
    res.set('Cache-Control', 'public, max-age=3600')
    res.json({ success: true, data })
  } catch (error) {
    sendError(res, error, 'Error loading where to watch')
  }
}

/**
 * A show's upcoming episodes as an .ics file (opens "Add to Calendar").
 *
 * @param {import('express').Request} req - `params.id`.
 * @param {import('express').Response} res - 200 text/calendar, 404 no upcoming episode, or 500.
 * @returns {Promise<void>}
 */
export const episodeCalendar = async (req, res) => {
  try {
    const { filename, body } = await episodeCalendarFor(req.params.id)
    res.set('Content-Type', 'text/calendar; charset=utf-8')
    res.set('Content-Disposition', `inline; filename="${filename}"`)
    res.set('Cache-Control', 'public, max-age=1800')
    res.send(body)
  } catch (error) {
    sendError(res, error, 'Error making the calendar file')
  }
}

/**
 * Titles the community recommends to people who liked this one.
 *
 * @param {import('express').Request} req - `params.id`, optional `query.limit` (1-24).
 * @param {import('express').Response} res - 200 `{ data: { items } }` or 500.
 * @returns {Promise<void>}
 */
export const similarTitles = async (req, res) => {
  try {
    const limit = Math.min(24, Math.max(1, Number.parseInt(req.query.limit, 10) || 12))
    const items = await getSimilarTitles(req.params.id, { limit })
    res.set('Cache-Control', 'public, max-age=3600')
    res.json({ success: true, data: { items } })
  } catch (error) {
    sendError(res, error, 'Error loading similar titles')
  }
}

export default { whereToWatch, episodeCalendar, similarTitles }
