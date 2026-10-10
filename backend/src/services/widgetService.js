/**
 * Data for the iOS home screen widgets: "Watchlist updates" (the viewer's and friends'
 * recent watchlist changes, as on the home page) and "Recent releases" (new episodes
 * and premieres for the viewer's watchlist, or trending ones).
 *
 * Layer: service. Widgets run outside the app and can't use its session cookie, so the
 * signed-in app asks for a widget token: a random secret, stored hashed, that can only
 * read this feed. Each device gets its own token; signing out on a device revokes it,
 * and signing out everywhere revokes them all. Without a token the feed has only
 * trending releases.
 */

import crypto from 'node:crypto'
import { query } from '../../config/postgres.js'
import { HttpError } from '../utils/httpError.js'
import { contentPagePath } from '../utils/slug.js'
import { getActivityFeed, getReleaseUpdates } from './homeService.js'

/** Most tokens one account keeps (one per device); older ones are dropped. */
const TOKENS_PER_USER = 10
const ACTIVITY_LIMIT = 8
const RELEASE_LIMIT = 8

const hashToken = (token) => crypto.createHash('sha256').update(token).digest('hex')

/**
 * Issue a widget token for `userId`.
 * @param {string} userId
 * @returns {Promise<string>} The token (only ever returned here).
 */
export async function issueWidgetToken(userId) {
  const token = crypto.randomBytes(32).toString('base64url')
  await query('INSERT INTO widget_tokens (token_hash, user_id) VALUES ($1, $2)', [
    hashToken(token),
    userId,
  ])
  await query(
    `DELETE FROM widget_tokens WHERE user_id = $1 AND token_hash NOT IN (
       SELECT token_hash FROM widget_tokens WHERE user_id = $1
       ORDER BY created_at DESC LIMIT $2
     )`,
    [userId, TOKENS_PER_USER],
  )
  return token
}

/**
 * Revoke one widget token (signing out on a device).
 * @param {unknown} token
 * @returns {Promise<void>}
 */
export async function revokeWidgetToken(token) {
  if (typeof token !== 'string' || !token) return
  await query('DELETE FROM widget_tokens WHERE token_hash = $1', [hashToken(token)])
}

/**
 * Revoke every widget token of `userId` (signing out everywhere).
 * @param {string} userId
 * @returns {Promise<void>}
 */
export async function revokeAllWidgetTokens(userId) {
  await query('DELETE FROM widget_tokens WHERE user_id = $1', [userId])
}

/**
 * The account a widget token belongs to.
 * @param {unknown} token
 * @returns {Promise<string | null>} User id, or null for a missing/unknown token or banned user.
 */
export async function userForWidgetToken(token) {
  if (typeof token !== 'string' || !token) return null
  const { rows } = await query(
    `UPDATE widget_tokens t SET last_used_at = now()
     FROM users u
     WHERE t.token_hash = $1 AND u.id = t.user_id AND u.banned_at IS NULL
     RETURNING t.user_id`,
    [hashToken(token)],
  )
  return rows[0] ? String(rows[0].user_id) : null
}

/**
 * What someone did, worded as on the home page ("watched episode 5 of").
 * Mirrors `describeActivity` in src/utils/homeFeed.ts.
 * @param {{ action: string, status: string, currentEpisode: number, previousEpisode: number, user?: { isSelf?: boolean } }} entry
 * @returns {string}
 */
export function describeActivity(entry) {
  switch (entry.status) {
    case 'watching': {
      const latest = entry.currentEpisode
      if (latest <= 0) {
        if (entry.action === 'added') return 'started watching'
        return entry.user?.isSelf ? 'are watching' : 'is watching'
      }
      const first = (entry.previousEpisode || 0) + 1
      if (first >= latest) return `watched episode ${latest} of`
      return `watched episodes ${first}–${latest} of`
    }
    case 'completed':
      return 'completed'
    case 'on_hold':
      return 'put on hold'
    case 'dropped':
      return 'dropped'
    default:
      return 'planned to watch'
  }
}

const pathOf = (content) =>
  contentPagePath({
    kind: content.contentType === 'tv' ? 'series' : content.contentType,
    id: content._id,
    name: content.title,
  })

/**
 * One activity entry as the widget shows it.
 * @param {object} entry - From `getActivityFeed`.
 * @returns {{ id: string, who: string, isSelf: boolean, did: string, title: string, at: string, path: string }}
 */
export function widgetActivity(entry) {
  return {
    id: entry.id,
    who: entry.user.isSelf ? 'You' : entry.user.username,
    isSelf: entry.user.isSelf,
    did: describeActivity(entry),
    title: entry.content.title,
    at: entry.at,
    path: pathOf(entry.content),
  }
}

/**
 * One release update as the widget shows it.
 * @param {object} item - From `getReleaseUpdates`.
 * @returns {{ id: string, title: string, kind: 'episode' | 'premiere', episode: number | null, at: string | null, path: string }}
 */
export function widgetRelease(item) {
  return {
    id: item.content._id,
    title: item.content.title,
    kind: item.kind,
    episode: item.kind === 'episode' ? item.content.nextEpisodeNumber || null : null,
    at: item.at,
    path: pathOf(item.content),
  }
}

/**
 * Both widgets' data for `userId` (null when signed out: trending releases only).
 * @param {string | null} userId
 * @returns {Promise<{ signedIn: boolean, activity: object[], releases: { source: string, items: object[] } }>}
 */
export async function getWidgetFeed(userId) {
  const [feed, releases] = await Promise.all([
    userId ? getActivityFeed(userId, { limit: ACTIVITY_LIMIT }) : null,
    getReleaseUpdates(userId),
  ])
  const activity = feed
    ? [...feed.personal, ...feed.friends]
        .sort((left, right) => new Date(right.at).getTime() - new Date(left.at).getTime())
        .slice(0, ACTIVITY_LIMIT)
        .map(widgetActivity)
    : []
  return {
    signedIn: Boolean(userId),
    activity,
    releases: {
      source: releases.source,
      items: releases.items.slice(0, RELEASE_LIMIT).map(widgetRelease),
    },
  }
}

/**
 * Read the widget token from `Authorization: Widget <token>`.
 * @param {import('express').Request} req
 * @returns {string | null}
 */
export function widgetTokenFrom(req) {
  const header = req.get('authorization') || ''
  const match = /^Widget\s+(\S+)$/i.exec(header)
  return match ? match[1] : null
}

/**
 * Feed for a request: signed-in when it carries a valid widget token.
 * @param {import('express').Request} req
 * @returns {Promise<object>}
 * @throws {HttpError} 401 when a token is sent but no longer valid (the widget then
 *   shows "open the app to sign in").
 */
export async function widgetFeedFor(req) {
  const token = widgetTokenFrom(req)
  if (!token) return getWidgetFeed(null)
  const userId = await userForWidgetToken(token)
  if (!userId) throw new HttpError(401, 'Widget sign-in expired.', 'WIDGET_TOKEN_INVALID')
  return getWidgetFeed(userId)
}

export default {
  widgetTokenFrom,
  issueWidgetToken,
  revokeWidgetToken,
  revokeAllWidgetTokens,
  widgetFeedFor,
}
