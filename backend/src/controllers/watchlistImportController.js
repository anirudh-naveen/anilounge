/**
 * HTTP handlers for importing a watchlist from AniList, MyAnimeList, or TMDB.
 *
 * Layer: controller. Backs the Import section in Settings; the work runs as a
 * background job in services/watchlistImportService.js that the page polls, and
 * titles the sources disagree on wait as clashes for the user to resolve.
 */

import { validationResult } from 'express-validator'
import {
  assertImportSchema,
  createTmdbRequestToken,
  getImportJob,
  listImportConflicts,
  prepareSources,
  resolveImportConflicts,
  startImportJob,
} from '../services/watchlistImportService.js'
import { isAllowedCorsOrigin } from '../utils/allowedFrontends.js'
import { HttpError, assertNotDemo, sendError } from '../utils/httpError.js'

/**
 * Start an import. Body: `sources`, each `{ source }` plus `username` (anilist, mal),
 * `file` (mal_file: `{ xml }` or `{ gzipBase64 }`), or `requestToken` (tmdb); they
 * run AniList, MyAnimeList, TMDB in that order. Optional `addMissing` boolean.
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
    const { sources, addMissing = true } = req.body
    const prepared = prepareSources(sources)
    await assertImportSchema()
    const job = startImportJob(req.user._id, prepared, { addMissing: addMissing !== false })
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
    await assertImportSchema()
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

/**
 * Imported titles waiting on the user to pick a version.
 *
 * @param {import('express').Request} req
 * @param {import('express').Response} res - 200 `{ data: conflicts }`.
 * @returns {Promise<void>}
 */
export const getConflicts = async (req, res) => {
  try {
    await assertImportSchema()
    res.json({ success: true, data: await listImportConflicts(req.user._id) })
  } catch (error) {
    sendError(res, error, 'Error loading import clashes')
  }
}

/**
 * Settle clashes. Body: `choices`, each `{ contentId, choice }` where `choice` is an
 * option key (e.g. `anilist`, `anilist+mal`) or `keep`.
 *
 * @param {import('express').Request} req
 * @param {import('express').Response} res - 200 `{ data: { resolved, remaining } }`.
 * @returns {Promise<void>}
 */
export const resolveConflicts = async (req, res) => {
  try {
    const errors = validationResult(req)
    if (!errors.isEmpty()) throw new HttpError(400, errors.array()[0].msg)
    assertNotDemo(req.user)
    await assertImportSchema()
    res.json({
      success: true,
      data: await resolveImportConflicts(req.user._id, req.body.choices),
    })
  } catch (error) {
    sendError(res, error, 'Error saving your choices')
  }
}

export default { startImport, getImport, startTmdbAuthorization, getConflicts, resolveConflicts }
