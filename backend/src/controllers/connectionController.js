/**
 * HTTP handlers for linked AniList / MyAnimeList / TMDB accounts.
 *
 * Layer: controller. Backs the Connections page; sign-in and storage live in
 * services/connectionService.js, syncing in services/connectionSync.js.
 */

import { validationResult } from 'express-validator'
import {
  disconnect,
  finishConnection,
  listConnections,
  startConnection,
} from '../services/connectionService.js'
import { syncNow } from '../services/connectionSync.js'
import { isAllowedCorsOrigin } from '../utils/allowedFrontends.js'
import { HttpError, assertNotDemo, sendError } from '../utils/httpError.js'

/**
 * @param {import('express').Request} req
 */
function assertValid(req) {
  const errors = validationResult(req)
  if (!errors.isEmpty()) throw new HttpError(400, errors.array()[0].msg)
}

/**
 * Every site with the user's connection state.
 *
 * @param {import('express').Request} req
 * @param {import('express').Response} res - 200 `{ data: connections }`.
 * @returns {Promise<void>}
 */
export const list = async (req, res) => {
  try {
    res.json({ success: true, data: await listConnections(String(req.user._id)) })
  } catch (error) {
    if (error?.code === '42P01') {
      console.error('Connections: database schema is out of date; run `npm run db:schema`.')
      return sendError(res, new HttpError(503, "Connections aren't available yet."), '')
    }
    sendError(res, error, 'Error loading connections')
  }
}

/**
 * Step 1: where to send the user to approve AniLounge. TMDB also takes `redirectTo`,
 * which must be one of our frontends.
 *
 * @param {import('express').Request} req
 * @param {import('express').Response} res - 200 `{ data: { authorizeUrl } }`.
 * @returns {Promise<void>}
 */
export const start = async (req, res) => {
  try {
    assertValid(req)
    assertNotDemo(req.user)
    const { provider } = req.params
    let redirectTo
    if (provider === 'tmdb') {
      let redirect
      try {
        redirect = new URL(String(req.body?.redirectTo || ''))
      } catch {
        redirect = null
      }
      if (!redirect || !isAllowedCorsOrigin(redirect.origin)) {
        throw new HttpError(400, 'Invalid return address for TMDB.')
      }
      redirectTo = redirect.toString()
    }
    res.json({
      success: true,
      data: await startConnection(String(req.user._id), provider, { redirectTo }),
    })
  } catch (error) {
    sendError(res, error, 'Error starting the connection')
  }
}

/**
 * Step 2: what the site sent back (`code` + `state`, or TMDB's `requestToken`).
 *
 * @param {import('express').Request} req
 * @param {import('express').Response} res - 200 `{ data: connection }`.
 * @returns {Promise<void>}
 */
export const callback = async (req, res) => {
  try {
    assertValid(req)
    assertNotDemo(req.user)
    const { code, state, requestToken } = req.body || {}
    res.json({
      success: true,
      data: await finishConnection(String(req.user._id), req.params.provider, {
        code,
        state,
        requestToken,
      }),
    })
  } catch (error) {
    sendError(res, error, 'Error finishing the connection')
  }
}

/**
 * Pull a two-way site's recent changes now.
 *
 * @param {import('express').Request} req
 * @param {import('express').Response} res - 200 `{ data: { applied, checked } }`.
 * @returns {Promise<void>}
 */
export const sync = async (req, res) => {
  try {
    assertNotDemo(req.user)
    res.json({ success: true, data: await syncNow(String(req.user._id), req.params.provider) })
  } catch (error) {
    sendError(res, error, 'Error syncing')
  }
}

/**
 * Disconnect a site. Nothing already on either list is removed.
 *
 * @param {import('express').Request} req
 * @param {import('express').Response} res - 200 `{ data: { removed } }`.
 * @returns {Promise<void>}
 */
export const remove = async (req, res) => {
  try {
    res.json({
      success: true,
      data: { removed: await disconnect(String(req.user._id), req.params.provider) },
    })
  } catch (error) {
    sendError(res, error, 'Error disconnecting')
  }
}

export default { list, start, callback, sync, remove }
