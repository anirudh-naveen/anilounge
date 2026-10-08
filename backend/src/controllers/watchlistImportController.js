/**
 * HTTP handlers for importing a watchlist from AniList, MyAnimeList, or TMDB.
 *
 * Layer: controller. Backs the Connections page; the work runs as a
 * background job in services/watchlistImportService.js that the page polls, and
 * titles the sources disagree on wait as clashes for the user to resolve.
 */

import { validationResult } from 'express-validator'
import {
  assertImportSchema,
  getImportJob,
  listImportConflicts,
  prepareSources,
  resolveImportConflicts,
  startImportJob,
} from '../services/watchlistImportService.js'
import { HttpError, assertNotDemo, sendError } from '../utils/httpError.js'

/**
 * Start an import. Body: `sources`, each `{ source }` plus `connected: true` (read the
 * user's connected account; TMDB always is), `username` (anilist, mal), or `file`
 * (mal_file: `{ xml }` or `{ gzipBase64 }`); they run AniList, MyAnimeList, TMDB in
 * that order. Optional `addMissing` boolean.
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
    const prepared = prepareSources(sources, String(req.user._id))
    await assertImportSchema()
    const job = await startImportJob(req.user._id, prepared, { addMissing: addMissing !== false })
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
  try {
    res.json({ success: true, data: await getImportJob(req.user._id) })
  } catch (error) {
    sendError(res, error, 'Error loading the import')
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

export default { startImport, getImport, getConflicts, resolveConflicts }
