/**
 * Push notifications to the iOS app through Apple Push Notification service (APNs), and
 * to the Android app through Firebase Cloud Messaging (FCM).
 *
 * Layer: service. The app registers its device token (`push_devices`, with its
 * `platform`); inbox
 * notifications, direct messages, and new releases of followed titles are pushed to
 * every device of the recipient, unless they turned that kind off in Settings
 * (`users.push_settings`). Sending never throws, so a push failure cannot undo the
 * action that caused it. Tokens Apple reports as dead are deleted.
 *
 * APNs uses token auth: a JWT signed with the team's .p8 key, reused for up to 50
 * minutes. A token is tried against the server its device last worked on
 * (production for TestFlight/App Store builds, sandbox for Xcode builds), then the other.
 *
 * FCM uses the HTTP v1 API with an OAuth token from a Firebase service account (a
 * JWT signed with its private key, exchanged for an access token that lasts an hour).
 * Android pushes go to a notification channel per kind (android/…/NotificationChannels.java),
 * so people can also mute a kind in Android's own settings.
 *
 * Env: APNS_KEY (the .p8 contents; `\n` escapes allowed), APNS_KEY_ID, APNS_TEAM_ID,
 * APNS_BUNDLE_ID (default net.anilounge.app); FCM_SERVICE_ACCOUNT (the service account
 * JSON, or base64 of it). Each platform's pushes are skipped while its key is unset.
 */

import http2 from 'node:http2'
import cron from 'node-cron'
import axios from 'axios'
import jwt from 'jsonwebtoken'
import { query } from '../../config/postgres.js'
import { withJobLock } from '../utils/jobLock.js'
import { contentPagePath, detailPath } from '../utils/slug.js'
import { HttpError } from '../utils/httpError.js'

/** Push kinds a user can turn off, and the inbox/message kinds each covers. */
export const PUSH_KINDS = ['friends', 'forum', 'messages', 'releases']
const KIND_OF = {
  friend_request: 'friends',
  friend_accepted: 'friends',
  post_comment: 'forum',
  comment_reply: 'forum',
  message: 'messages',
  release: 'releases',
}

const HOSTS = {
  production: 'https://api.push.apple.com',
  sandbox: 'https://api.sandbox.push.apple.com',
}
const JWT_TTL_MS = 50 * 60 * 1000
const BODY_MAX = 140
/** Releases posted longer ago than this are never pushed (so old rows stay quiet). */
const RELEASE_WINDOW_HOURS = 12
const DEFAULT_RELEASE_CRON = '*/15 * * * *'

/** APNs replies that mean the token will never work again. */
const DEAD_TOKEN_REASONS = new Set(['BadDeviceToken', 'Unregistered', 'DeviceTokenNotForTopic'])

function config() {
  const key = process.env.APNS_KEY?.replace(/\\n/g, '\n').trim()
  if (!key || !process.env.APNS_KEY_ID || !process.env.APNS_TEAM_ID) return null
  return {
    key,
    keyId: process.env.APNS_KEY_ID,
    teamId: process.env.APNS_TEAM_ID,
    topic: process.env.APNS_BUNDLE_ID || 'net.anilounge.app',
  }
}

function fcmConfig() {
  const raw = process.env.FCM_SERVICE_ACCOUNT?.trim()
  if (!raw) return null
  try {
    const text = raw.startsWith('{') ? raw : Buffer.from(raw, 'base64').toString('utf8')
    const account = JSON.parse(text)
    if (!account.project_id || !account.client_email || !account.private_key) return null
    return {
      projectId: account.project_id,
      clientEmail: account.client_email,
      privateKey: String(account.private_key).replace(/\\n/g, '\n'),
      tokenUri: account.token_uri || 'https://oauth2.googleapis.com/token',
    }
  } catch {
    return null
  }
}

/** Whether pushes can be sent (APNs or FCM is configured). */
export function pushEnabled() {
  return config() !== null || fcmConfig() !== null
}

/** Platforms whose pushes can be sent right now. */
function enabledPlatforms() {
  const platforms = []
  if (config()) platforms.push('ios')
  if (fcmConfig()) platforms.push('android')
  return platforms
}

// ---------------------------------------------------------------------------
// Messages
// ---------------------------------------------------------------------------

const clip = (text, max = BODY_MAX) => {
  const flat = String(text || '')
    .replace(/\s+/g, ' ')
    .trim()
  return flat.length > max ? `${flat.slice(0, max - 1).trimEnd()}…` : flat
}

/**
 * Title, body, and in-app path of a push.
 * @param {string} kind - An inbox kind, `message`, or `release`.
 * @param {{ actor?: string, actorId?: string, postId?: string, postTitle?: string, commentId?: string, text?: string, releases?: Array<{ name: string, label: string | null, path: string }> }} info
 * @returns {{ title: string, body: string, path: string } | null} Null for kinds that aren't pushed.
 */
export function describePush(kind, info = {}) {
  const actor = info.actor || 'Someone'
  const postPath = info.postId
    ? detailPath('/forum/post', info.postId, info.postTitle) +
      (info.commentId ? `#comment-${info.commentId}` : '')
    : '/forum'
  switch (kind) {
    case 'friend_request':
      return { title: 'Friend request', body: `${actor} wants to be friends.`, path: '/friends' }
    case 'friend_accepted':
      return {
        title: 'New friend',
        body: `${actor} accepted your friend request.`,
        path: `/u/${encodeURIComponent(actor)}`,
      }
    case 'post_comment':
      return {
        title: clip(info.postTitle || 'Your post', 60),
        body: `${actor} commented on your post.`,
        path: postPath,
      }
    case 'comment_reply':
      return {
        title: clip(info.postTitle || 'Forum', 60),
        body: `${actor} replied to your comment.`,
        path: postPath,
      }
    case 'message':
      return {
        title: actor,
        body: clip(info.text),
        path: `/friends?user=${encodeURIComponent(info.actorId || '')}`,
      }
    case 'release': {
      const releases = info.releases || []
      if (!releases.length) return null
      if (releases.length === 1) {
        const [only] = releases
        return {
          title: only.label ? 'New episode' : 'Out now',
          body: only.label ? `${only.label} of ${only.name} is out.` : `${only.name} is out.`,
          path: only.path,
        }
      }
      const names = releases.map((release) => release.name)
      const listed =
        names.length === 2
          ? `${names[0]} and ${names[1]}`
          : `${names[0]}, ${names[1]}, and ${names.length - 2} more`
      return {
        title: `${releases.length} new releases`,
        body: `New from your watchlist: ${listed}.`,
        path: '/watchlist',
      }
    }
    default:
      return null
  }
}

/**
 * Season/episode label for a release (null for movies and specials).
 * @param {{ season_number: number | null, episode_number: number | null, season_count?: number | null }} release
 * @returns {string | null}
 */
export function releaseLabel(release) {
  const { season_number: season, episode_number: episode } = release
  if (episode == null) return null
  const showSeason = season != null && (season > 1 || (release.season_count ?? 1) > 1)
  return showSeason ? `Season ${season} Episode ${episode}` : `Episode ${episode}`
}

// ---------------------------------------------------------------------------
// Devices and settings
// ---------------------------------------------------------------------------

const PLATFORMS = ['ios', 'android']
/** APNs tokens are hex; FCM registration tokens are longer and case-sensitive. */
const TOKEN_PATTERNS = {
  ios: /^[0-9a-f]{64,200}$/,
  android: /^[A-Za-z0-9_:-]{100,4096}$/,
}

/**
 * A device token as stored: APNs tokens lowercased, FCM tokens as given.
 * @param {unknown} token
 * @param {string} platform - `ios` or `android`.
 * @returns {string | null} Null when it isn't a valid token for that platform.
 */
export function normalizeDeviceToken(token, platform = 'ios') {
  if (typeof token !== 'string' || !PLATFORMS.includes(platform)) return null
  const trimmed = token.trim()
  const value = platform === 'ios' ? trimmed.toLowerCase() : trimmed
  return TOKEN_PATTERNS[platform].test(value) ? value : null
}

/**
 * Register this device for `userId`'s pushes. A token signed in under another account
 * moves to this one.
 * @param {string} userId
 * @param {unknown} token - Hex APNs device token, or an FCM registration token.
 * @param {unknown} [platform] - `ios` (default, for app builds that don't send it) or `android`.
 * @returns {Promise<void>}
 * @throws {HttpError} 400 malformed token or platform.
 */
export async function registerDevice(userId, token, platform = 'ios') {
  const kind = platform ?? 'ios'
  const value = normalizeDeviceToken(token, kind)
  if (!value) throw new HttpError(400, 'Invalid device token.')
  await query(
    `INSERT INTO push_devices (token, user_id, platform) VALUES ($1, $2, $3)
     ON CONFLICT (token) DO UPDATE
       SET user_id = EXCLUDED.user_id, platform = EXCLUDED.platform, last_seen_at = now(),
           created_at = CASE WHEN push_devices.user_id = EXCLUDED.user_id
                             THEN push_devices.created_at ELSE now() END`,
    [value, userId, kind],
  )
}

/**
 * Stop pushing to a device (signing out on it).
 * @param {string} userId
 * @param {unknown} token
 * @returns {Promise<void>}
 */
export async function unregisterDevice(userId, token) {
  const value = typeof token === 'string' ? token.trim() : ''
  // APNs tokens are stored lowercased; FCM tokens exactly as given.
  await query('DELETE FROM push_devices WHERE token IN ($1, lower($1)) AND user_id = $2', [
    value,
    userId,
  ])
}

/**
 * Stop pushing to every device of `userId` (signing out everywhere).
 * @param {string} userId
 * @returns {Promise<void>}
 */
export async function unregisterAllDevices(userId) {
  await query('DELETE FROM push_devices WHERE user_id = $1', [userId])
}

/**
 * Settings with every kind filled in (missing = on).
 * @param {unknown} stored - `users.push_settings`.
 * @returns {Record<string, boolean>}
 */
export function normalizePushSettings(stored) {
  const source = stored && typeof stored === 'object' ? stored : {}
  return Object.fromEntries(PUSH_KINDS.map((kind) => [kind, source[kind] !== false]))
}

/**
 * @param {string} userId
 * @returns {Promise<Record<string, boolean>>}
 */
export async function getPushSettings(userId) {
  const { rows } = await query('SELECT push_settings FROM users WHERE id = $1', [userId])
  return normalizePushSettings(rows[0]?.push_settings)
}

/**
 * Save the kinds given in `input` (others keep their value).
 * @param {string} userId
 * @param {unknown} input - `{ friends?: boolean, ... }`.
 * @returns {Promise<Record<string, boolean>>}
 * @throws {HttpError} 400 when a value isn't a boolean.
 */
export async function setPushSettings(userId, input) {
  const changes = {}
  for (const kind of PUSH_KINDS) {
    const value = input?.[kind]
    if (value === undefined) continue
    if (typeof value !== 'boolean') throw new HttpError(400, `${kind} must be true or false.`)
    changes[kind] = value
  }
  const { rows } = await query(
    `UPDATE users SET push_settings = push_settings || $2::jsonb WHERE id = $1
     RETURNING push_settings`,
    [userId, JSON.stringify(changes)],
  )
  return normalizePushSettings(rows[0]?.push_settings)
}

// ---------------------------------------------------------------------------
// Sending
// ---------------------------------------------------------------------------

let cachedJwt = null

function providerToken(settings) {
  if (cachedJwt && Date.now() - cachedJwt.at < JWT_TTL_MS) return cachedJwt.token
  const token = jwt.sign(
    { iss: settings.teamId, iat: Math.floor(Date.now() / 1000) },
    settings.key,
    {
      algorithm: 'ES256',
      keyid: settings.keyId,
      noTimestamp: true,
    },
  )
  cachedJwt = { token, at: Date.now() }
  return token
}

/** One HTTP/2 session per APNs host, reopened when it closes. */
const sessions = new Map()

function sessionFor(environment) {
  const existing = sessions.get(environment)
  if (existing && !existing.closed && !existing.destroyed) return existing
  const session = http2.connect(HOSTS[environment])
  session.on('error', () => sessions.delete(environment))
  session.on('close', () => sessions.delete(environment))
  session.unref()
  sessions.set(environment, session)
  return session
}

/**
 * POST one notification to APNs (exported for the live format check in tests).
 * @returns {Promise<{ status: number, reason: string | null }>}
 */
export function postToApns(settings, environment, token, payload) {
  return new Promise((resolve) => {
    let request
    try {
      request = sessionFor(environment).request({
        ':method': 'POST',
        ':path': `/3/device/${token}`,
        authorization: `bearer ${providerToken(settings)}`,
        'apns-topic': settings.topic,
        'apns-push-type': 'alert',
        'apns-priority': '10',
        'content-type': 'application/json',
      })
    } catch (error) {
      resolve({ status: 0, reason: error.message })
      return
    }
    let status = 0
    let body = ''
    request.setEncoding('utf8')
    request.setTimeout(10_000, () => request.close(http2.constants.NGHTTP2_CANCEL))
    request.on('response', (headers) => {
      status = Number(headers[':status']) || 0
    })
    request.on('data', (chunk) => {
      body += chunk
    })
    request.on('end', () => {
      let reason = null
      try {
        reason = body ? JSON.parse(body).reason || null : null
      } catch {
        reason = null
      }
      resolve({ status, reason })
    })
    request.on('error', (error) => resolve({ status: 0, reason: error.message }))
    request.end(JSON.stringify(payload))
  })
}

/**
 * Deliver to one device, trying its last environment first and the other on a token
 * the first rejects; dead tokens are deleted.
 */
async function sendToApnsDevice(settings, device, payload) {
  const order =
    device.environment === 'sandbox' ? ['sandbox', 'production'] : ['production', 'sandbox']
  for (const environment of order) {
    const { status, reason } = await postToApns(settings, environment, device.token, payload)
    if (status === 200) {
      if (environment !== device.environment) {
        await query('UPDATE push_devices SET environment = $2 WHERE token = $1', [
          device.token,
          environment,
        ])
      }
      return
    }
    const dead = status === 410 || DEAD_TOKEN_REASONS.has(reason)
    if (!dead) {
      // Outage, rate limit, or bad key: keep the token for next time.
      console.error(`APNs push failed (${status || 'no response'}${reason ? ` ${reason}` : ''}).`)
      return
    }
    // A token from the other environment looks dead here; try there before giving up.
  }
  await query('DELETE FROM push_devices WHERE token = $1', [device.token])
}

let cachedFcmToken = null

/** An OAuth access token for FCM, reused until a few minutes before it expires. */
async function fcmAccessToken(settings) {
  if (cachedFcmToken && Date.now() < cachedFcmToken.expiresAt) return cachedFcmToken.token
  const now = Math.floor(Date.now() / 1000)
  const assertion = jwt.sign(
    {
      iss: settings.clientEmail,
      scope: 'https://www.googleapis.com/auth/firebase.messaging',
      aud: settings.tokenUri,
      iat: now,
      exp: now + 3600,
    },
    settings.privateKey,
    { algorithm: 'RS256', noTimestamp: true },
  )
  const { data } = await axios.post(
    settings.tokenUri,
    new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion }),
    { timeout: 10_000 },
  )
  const lifetimeMs = (Number(data.expires_in) || 3600) * 1000
  cachedFcmToken = { token: data.access_token, expiresAt: Date.now() + lifetimeMs - 5 * 60 * 1000 }
  return cachedFcmToken.token
}

/**
 * The FCM v1 message for one Android device (exported for tests).
 * @param {string} token - FCM registration token.
 * @param {{ title: string, body: string, path: string }} message
 * @param {string} group - Push kind; also the Android notification channel.
 */
export function fcmMessage(token, message, group) {
  return {
    message: {
      token,
      notification: { title: message.title, body: message.body },
      // Tapping the notification opens `path` (utils/nativeApp.ts).
      data: { path: message.path, kind: group },
      android: {
        priority: 'high',
        notification: { channel_id: group, sound: 'default' },
      },
    },
  }
}

/** FCM error codes that mean the token will never work again. */
const FCM_DEAD_CODES = new Set(['UNREGISTERED', 'SENDER_ID_MISMATCH'])

async function sendToFcmDevice(settings, device, message, group) {
  try {
    const accessToken = await fcmAccessToken(settings)
    await axios.post(
      `https://fcm.googleapis.com/v1/projects/${settings.projectId}/messages:send`,
      fcmMessage(device.token, message, group),
      { headers: { authorization: `Bearer ${accessToken}` }, timeout: 10_000 },
    )
  } catch (error) {
    const status = error.response?.status || 0
    const details = error.response?.data?.error?.details || []
    const code = details.find((detail) => detail?.errorCode)?.errorCode || null
    const invalidToken =
      status === 400 &&
      code === 'INVALID_ARGUMENT' &&
      /registration token/i.test(error.response?.data?.error?.message || '')
    if (status === 404 || FCM_DEAD_CODES.has(code) || invalidToken) {
      await query('DELETE FROM push_devices WHERE token = $1', [device.token])
      return
    }
    if (status === 401) cachedFcmToken = null
    console.error(`FCM push failed (${status || 'no response'}${code ? ` ${code}` : ''}).`)
  }
}

/**
 * Push to every device of `userId` when they allow `kind`. Never throws.
 * @param {string} userId
 * @param {string} kind - An inbox kind, `message`, or `release`.
 * @param {object} info - See `describePush`.
 * @returns {Promise<void>}
 */
export async function pushToUser(userId, kind, info) {
  const apns = config()
  const fcm = fcmConfig()
  const group = KIND_OF[kind]
  if ((!apns && !fcm) || !group || !userId) return
  try {
    const message = describePush(kind, info)
    if (!message) return
    const { rows } = await query(
      `SELECT d.token, d.environment, d.platform FROM push_devices d JOIN users u ON u.id = d.user_id
       WHERE d.user_id = $1 AND u.banned_at IS NULL AND d.platform = ANY($3::text[])
         AND COALESCE((u.push_settings ->> $2)::boolean, true)`,
      [userId, group, enabledPlatforms()],
    )
    if (!rows.length) return
    const payload = {
      aps: {
        alert: { title: message.title, body: message.body },
        sound: 'default',
        'thread-id': group,
      },
      path: message.path,
    }
    await Promise.all(
      rows.map((device) =>
        device.platform === 'android'
          ? sendToFcmDevice(fcm, device, message, group)
          : sendToApnsDevice(apns, device, payload),
      ),
    )
  } catch (error) {
    console.error(`Push (${kind}) failed:`, error.message)
  }
}

/**
 * Push for a new inbox notification, looking up the names it mentions. Never throws.
 * @param {string} userId
 * @param {string} kind
 * @param {{ actorId?: string | null, postId?: string | null, commentId?: string | null }} refs
 * @returns {Promise<void>}
 */
export async function pushForNotification(userId, kind, { actorId, postId, commentId } = {}) {
  if (!pushEnabled() || !KIND_OF[kind]) return
  try {
    const { rows } = await query(
      `SELECT (SELECT username FROM users WHERE id = $1::uuid) AS actor,
              (SELECT title FROM posts WHERE id = $2::uuid) AS post_title`,
      [actorId || null, postId || null],
    )
    await pushToUser(userId, kind, {
      actor: rows[0]?.actor,
      actorId,
      postId,
      postTitle: rows[0]?.post_title,
      commentId,
    })
  } catch (error) {
    console.error(`Push (${kind}) failed:`, error.message)
  }
}

/**
 * Tell followers about releases whose threads were posted recently: one push per user,
 * naming the release, or a summary when several came out together.
 * @returns {Promise<{ releases: number, users: number }>}
 */
export async function pushNewReleases() {
  if (!pushEnabled()) return { releases: 0, users: 0 }
  const { rows: releases } = await query(
    `UPDATE release_threads rt SET notified_at = now()
     FROM content c LEFT JOIN series s ON s.content_id = c.id
     WHERE c.id = rt.content_id AND rt.notified_at IS NULL AND rt.posted_at IS NOT NULL
       AND rt.posted_at > now() - make_interval(hours => $1)
     RETURNING rt.id, rt.content_id, rt.season_number, rt.episode_number,
               c.kind, c.name, s.season_count`,
    [RELEASE_WINDOW_HOURS],
  )
  if (!releases.length) return { releases: 0, users: 0 }

  const { rows: followers } = await query(
    // Following a series counts for its seasons' releases.
    `SELECT DISTINCT wl.user_id, r.id AS content_id
     FROM unnest($1::uuid[]) AS r(id)
     LEFT JOIN seasons sn ON sn.content_id = r.id
     JOIN watchlist wl ON wl.content_id IN (r.id, sn.series_id)
     JOIN users u ON u.id = wl.user_id
     WHERE wl.status <> 'dropped'
       AND NOT u.is_demo AND u.banned_at IS NULL
       AND EXISTS (SELECT 1 FROM push_devices d WHERE d.user_id = wl.user_id)`,
    [releases.map((release) => release.content_id)],
  )
  const byContent = new Map(
    releases.map((release) => [
      String(release.content_id),
      {
        name: release.name,
        label: releaseLabel(release),
        path: contentPagePath({ kind: release.kind, id: release.content_id, name: release.name }),
      },
    ]),
  )
  const byUser = new Map()
  for (const { user_id: userId, content_id: contentId } of followers) {
    const list = byUser.get(String(userId)) || []
    list.push(byContent.get(String(contentId)))
    byUser.set(String(userId), list)
  }
  for (const [userId, list] of byUser) {
    await pushToUser(userId, 'release', { releases: list.filter(Boolean) })
  }
  return { releases: releases.length, users: byUser.size }
}

/** Run `pushNewReleases` on a schedule (RELEASE_PUSH_CRON, default every 15 minutes). */
export function startReleasePushScheduler() {
  if (!pushEnabled()) return
  cron.schedule(process.env.RELEASE_PUSH_CRON || DEFAULT_RELEASE_CRON, () => {
    withJobLock('release-push', pushNewReleases).catch((error) =>
      console.error('Release push run failed:', error.message),
    )
  })
}

export default {
  registerDevice,
  unregisterDevice,
  unregisterAllDevices,
  getPushSettings,
  setPushSettings,
  pushToUser,
  pushForNotification,
  pushNewReleases,
  pushEnabled,
}
