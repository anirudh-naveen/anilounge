/**
 * HTTP handlers for a title's links out to other apps: where to watch it, and its
 * upcoming episodes as a calendar file.
 *
 * Layer: controller. Public; rules live in `services/watchProviderService.js` and
 * `services/calendarService.js`.
 */

import { getWhereToWatch } from '../services/watchProviderService.js'
import { episodeCalendarFor } from '../services/calendarService.js'
import { sendError } from '../utils/httpError.js'

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

export default { whereToWatch, episodeCalendar }
