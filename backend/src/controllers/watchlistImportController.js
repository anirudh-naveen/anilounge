/**
 * HTTP handlers for importing a watchlist from AniList, MyAnimeList, or TMDB.
 *
 * Layer: controller. Backs the Import panel on the Watchlist page; the work runs as a
 * background job in services/watchlistImportService.js that the page polls.
 */

import { validationResult } from 'express-validator'
import {
  createTmdbRequestToken,
  getImportJob,
  prepareImport,
  startImportJob,
} from '../services/watchlistImportService.js'
import { isAllowedCorsOrigin } from '../utils/allowedFrontends.js'
import { HttpError, assertNotDemo, sendError } from '../utils/httpError.js'

/**
 * Start an import. Body: `source` plus `username` (anilist, mal), `file`
 * (mal_file: `{ xml }` or `{ gzipBase64 }`), or `requestToken` (tmdb); optional
 * `overwrite` and `addMissing` booleans.
 *
 * @param {import('express').Request} req
 * @param {import('express').Response} res - 202 `{ data: job }`; 400/409/429 with a message.
 * @returns {Promise<void>}
 */
export const startImport = async (req, res) => {
  try {
    const errors = validationResult(req)
    if (!errors.isEmpty()) throw new HttpError(400, errors.array()[0].msg)
    assertNotDemo(req.user)
    const { source, overwrite = false, addMissing = true } = req.body
    const load = prepareImport(source, req.body)
    const job = startImportJob(req.user._id, source, load, {
      overwrite: overwrite === true,
      addMissing: addMissing !== false,
    })
    res.status(202).json({ success: true, data: job })
  } catch (error) {
    sendError(res, error, 'Error starting the import')
  }
}

/**
 * The signed-in user's running or most recent import, or null.
 *
 * @param {import('express').Request} req
 * @param {import('express').Response} res - 200 `{ data: job | null }`.
 * @returns {Promise<void>}
 */
export const getImport = async (req, res) => {
  res.json({ success: true, data: getImportJob(req.user._id) })
}

/**
 * First step of a TMDB import: a token for the user to approve on themoviedb.org,
 * which then sends them back to `redirectTo` (must be one of our frontends).
 *
 * @param {import('express').Request} req - `body.redirectTo`.
 * @param {import('express').Response} res - 200 `{ data: { requestToken, authorizeUrl } }`.
 * @returns {Promise<void>}
 */
export const startTmdbAuthorization = async (req, res) => {
  try {
    assertNotDemo(req.user)
    let redirect
    try {
      redirect = new URL(String(req.body?.redirectTo || ''))
    } catch {
      redirect = null
    }
    if (!redirect || !isAllowedCorsOrigin(redirect.origin)) {
      throw new HttpError(400, 'Invalid return address for TMDB.')
    }
    res.json({ success: true, data: await createTmdbRequestToken(redirect.toString()) })
  } catch (error) {
    sendError(res, error, 'Error contacting TMDB')
  }
}

export default { startImport, getImport, startTmdbAuthorization }
