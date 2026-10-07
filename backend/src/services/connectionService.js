/**
 * Linked accounts ("Connections"): AniList, MyAnimeList, and TMDB.
 *
 * Domain service behind `/connections/*` (controllers/connectionController.js). Handles
 * the sign-in flow for each site, stores the resulting tokens encrypted
 * (utils/secretBox.js) in `account_connections`, and hands fresh tokens to the sync
 * (services/connectionSync.js) and the watchlist import.
 *
 * - AniList: OAuth authorization code (`ANILIST_CLIENT_ID`, `ANILIST_CLIENT_SECRET`).
 *   Tokens last a year and can't be refreshed; the user reconnects after that.
 * - MyAnimeList: OAuth with PKCE (`MAL_CLIENT_ID`, plus `MAL_CLIENT_SECRET` for "web"
 *   apps). Tokens last a month and are refreshed here before they expire.
 * - TMDB: the user approves a request token on themoviedb.org; the session made from it
 *   is kept (until disconnect) so watchlist and rating changes can be sent.
 *
 * AniList and MyAnimeList both send the user back to CONNECTIONS_REDIRECT_URL (default
 * `${PUBLIC_APP_URL}/connections`), which must match the redirect registered with each
 * site. The `state` starts with the provider so that page knows who answered. Pending
 * sign-ins live in memory for ten minutes (like import jobs, one process is assumed).
 */
import crypto from 'node:crypto'
import { query } from '../../config/postgres.js'
import { HttpError } from '../utils/httpError.js'
import { fetchJson } from '../utils/fetchJson.js'
import { seal, unseal } from '../utils/secretBox.js'
import { anilistRequest } from './anilistService.js'

export const CONNECTION_PROVIDERS = ['anilist', 'mal', 'tmdb']

/** What each site supports: `two-way` pulls its changes back; `push` only receives ours. */
const PROVIDER_INFO = {
  anilist: { label: 'AniList', sync: 'two-way' },
  mal: { label: 'MyAnimeList', sync: 'two-way' },
  tmdb: { label: 'TMDB', sync: 'push' },
}

const ANILIST_OAUTH = 'https://anilist.co/api/v2/oauth'
const MAL_OAUTH = 'https://myanimelist.net/v1/oauth2'
export const MAL_API = 'https://api.myanimelist.net/v2'
export const TMDB_API = 'https://api.themoviedb.org/3'

const PENDING_TTL_MS = 10 * 60 * 1000
/** Refresh MAL tokens this long before they expire. */
const REFRESH_MARGIN_MS = 24 * 60 * 60 * 1000
/**
 * Status for "the linked site's sign-in expired". Not 401: the frontend reads 401 as its
 * own session expiring and refreshes and replays the request.
 */
export const RECONNECT_STATUS = 424

/** @type {Map<string, { userId: string, provider: string, verifier?: string, expires: number }>} */
const pending = new Map()

/**
 * An env value without the stray spaces or newlines a dashboard paste can leave.
 * @param {string} name
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {string}
 */
export function envValue(name, env = process.env) {
  return String(env[name] ?? '').trim()
}

/**
 * A problem the user can act on (site not set up, sign-in expired, account taken).
 */
export class ConnectionError extends HttpError {
  /**
   * @param {string} message - Shown to the user.
   * @param {number} [status=400]
   */
  constructor(message, status = 400) {
    super(status, message)
    this.name = 'ConnectionError'
  }
}

/**
 * @param {string} provider
 * @returns {string}
 */
export function providerLabel(provider) {
  return PROVIDER_INFO[provider]?.label || provider
}

/**
 * @param {string} provider
 * @returns {'two-way' | 'push' | null}
 */
export function providerSync(provider) {
  return PROVIDER_INFO[provider]?.sync || null
}

/**
 * Whether this server has the keys a provider needs. Every site also needs
 * CONNECTIONS_SECRET, which encrypts the stored tokens.
 * @param {string} provider
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {boolean}
 */
export function isProviderConfigured(provider, env = process.env) {
  if (!envValue('CONNECTIONS_SECRET', env)) return false
  switch (provider) {
    case 'anilist':
      return Boolean(envValue('ANILIST_CLIENT_ID', env) && envValue('ANILIST_CLIENT_SECRET', env))
    case 'mal':
      return Boolean(envValue('MAL_CLIENT_ID', env))
    case 'tmdb':
      return Boolean(envValue('TMDB_API_KEY', env))
    default:
      return false
  }
}

/**
 * Where AniList and MyAnimeList send the user after they approve.
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {string}
 */
export function connectionsRedirectUri(env = process.env) {
  if (env.CONNECTIONS_REDIRECT_URL) return env.CONNECTIONS_REDIRECT_URL.trim()
  const base =
    env.PUBLIC_APP_URL || String(env.FRONTEND_URL || '').split(',')[0] || 'http://localhost:5173'
  return `${base.trim().replace(/\/+$/, '')}/connections`
}

/**
 * @param {string} provider
 */
function assertProvider(provider) {
  if (!CONNECTION_PROVIDERS.includes(provider)) throw new ConnectionError('Unknown site.', 404)
  if (!isProviderConfigured(provider)) {
    throw new ConnectionError(`Connecting ${providerLabel(provider)} isn't set up on this server yet.`, 503)
  }
}

/** Drop expired pending sign-ins. */
function prunePending() {
  const now = Date.now()
  for (const [key, value] of pending) if (value.expires < now) pending.delete(key)
}

/**
 * Take (and forget) a pending sign-in started by this user.
 * @param {string} key
 * @param {string} userId
 * @param {string} provider
 * @returns {{ verifier?: string }}
 */
function takePending(key, userId, provider) {
  prunePending()
  const found = pending.get(String(key || ''))
  if (!found || found.userId !== String(userId) || found.provider !== provider) {
    throw new ConnectionError(
      `That ${providerLabel(provider)} sign-in expired or wasn't started here. Try connecting again.`,
    )
  }
  pending.delete(String(key))
  return found
}

/** @returns {string} */
function tmdbKey() {
  return encodeURIComponent(envValue('TMDB_API_KEY'))
}

// ---------------------------------------------------------------------------
// Sign-in
// ---------------------------------------------------------------------------

/**
 * Step 1: the address to send the user to.
 * @param {string} userId
 * @param {string} provider
 * @param {{ redirectTo?: string }} [options] - TMDB only: where it returns the user
 *   (already checked against the frontend allowlist by the controller).
 * @returns {Promise<{ authorizeUrl: string }>}
 */
export async function startConnection(userId, provider, { redirectTo } = {}) {
  assertProvider(provider)
  prunePending()
  const expires = Date.now() + PENDING_TTL_MS

  if (provider === 'tmdb') {
    const { status, body } = await fetchJson(
      `${TMDB_API}/authentication/token/new?api_key=${tmdbKey()}`,
    )
    if (status !== 200 || !body?.request_token) {
      throw new ConnectionError("TMDB didn't answer. Try again in a few minutes.", 502)
    }
    pending.set(body.request_token, { userId: String(userId), provider, expires })
    return {
      authorizeUrl:
        `https://www.themoviedb.org/authenticate/${encodeURIComponent(body.request_token)}` +
        `?redirect_to=${encodeURIComponent(redirectTo)}`,
    }
  }

  const state = `${provider}.${crypto.randomBytes(18).toString('base64url')}`
  const params = new URLSearchParams({
    response_type: 'code',
    redirect_uri: connectionsRedirectUri(),
    state,
  })
  if (provider === 'anilist') {
    params.set('client_id', envValue('ANILIST_CLIENT_ID'))
    pending.set(state, { userId: String(userId), provider, expires })
    return { authorizeUrl: `${ANILIST_OAUTH}/authorize?${params}` }
  }
  // MAL only supports the `plain` PKCE method.
  const verifier = crypto.randomBytes(48).toString('base64url')
  params.set('client_id', envValue('MAL_CLIENT_ID'))
  params.set('code_challenge', verifier)
  params.set('code_challenge_method', 'plain')
  pending.set(state, { userId: String(userId), provider, verifier, expires })
  return { authorizeUrl: `${MAL_OAUTH}/authorize?${params}` }
}

/**
 * MAL token endpoint (authorization code or refresh).
 * @param {Record<string, string>} fields
 * @returns {Promise<{ accessToken: string, refreshToken: string | null, expiresAt: Date | null } | null>}
 */
async function malTokenRequest(fields) {
  const form = new URLSearchParams({ client_id: envValue('MAL_CLIENT_ID'), ...fields })
  if (envValue('MAL_CLIENT_SECRET')) form.set('client_secret', envValue('MAL_CLIENT_SECRET'))
  const { status, body } = await fetchJson(`${MAL_OAUTH}/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: form.toString(),
  })
  if (status !== 200 || !body?.access_token) return null
  return {
    accessToken: body.access_token,
    refreshToken: body.refresh_token || null,
    expiresAt: body.expires_in ? new Date(Date.now() + Number(body.expires_in) * 1000) : null,
  }
}

/**
 * Step 2: trade what the site sent back for tokens and save the connection.
 * @param {string} userId
 * @param {string} provider
 * @param {{ code?: string, state?: string, requestToken?: string }} body
 * @returns {Promise<object>} The public connection.
 */
export async function finishConnection(userId, provider, body = {}) {
  assertProvider(provider)
  const label = providerLabel(provider)

  if (provider === 'tmdb') {
    takePending(body.requestToken, userId, provider)
    const session = await fetchJson(`${TMDB_API}/authentication/session/new?api_key=${tmdbKey()}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ request_token: body.requestToken }),
    })
    const sessionId = session.body?.session_id
    if (!sessionId) throw new ConnectionError('TMDB access was not approved. Try connecting again.')
    const account = await fetchJson(
      `${TMDB_API}/account?api_key=${tmdbKey()}&session_id=${encodeURIComponent(sessionId)}`,
    )
    if (!account.body?.id) throw new ConnectionError("Couldn't read your TMDB account.", 502)
    return saveConnection(userId, provider, {
      externalId: String(account.body.id),
      externalName: account.body.username || null,
      accessToken: sessionId,
    })
  }

  const { verifier } = takePending(body.state, userId, provider)
  const code = String(body.code || '')
  if (!code) throw new ConnectionError(`${label} didn't send a sign-in code. Try connecting again.`)

  if (provider === 'anilist') {
    const { status, body: token } = await fetchJson(`${ANILIST_OAUTH}/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({
        grant_type: 'authorization_code',
        client_id: envValue('ANILIST_CLIENT_ID'),
        client_secret: envValue('ANILIST_CLIENT_SECRET'),
        redirect_uri: connectionsRedirectUri(),
        code,
      }),
    })
    if (status !== 200 || !token?.access_token) {
      throw new ConnectionError('AniList turned down the sign-in. Try connecting again.', 502)
    }
    const viewer = await anilistRequest('query { Viewer { id name } }', {}, { token: token.access_token })
    if (!viewer?.Viewer?.id) throw new ConnectionError("Couldn't read your AniList account.", 502)
    return saveConnection(userId, provider, {
      externalId: String(viewer.Viewer.id),
      externalName: viewer.Viewer.name || null,
      accessToken: token.access_token,
      expiresAt: token.expires_in ? new Date(Date.now() + Number(token.expires_in) * 1000) : null,
    })
  }

  const tokens = await malTokenRequest({
    grant_type: 'authorization_code',
    code,
    redirect_uri: connectionsRedirectUri(),
    code_verifier: verifier,
  })
  if (!tokens) throw new ConnectionError('MyAnimeList turned down the sign-in. Try connecting again.', 502)
  const me = await fetchJson(`${MAL_API}/users/@me`, {
    headers: { Authorization: `Bearer ${tokens.accessToken}` },
  })
  if (!me.body?.id) throw new ConnectionError("Couldn't read your MyAnimeList account.", 502)
  return saveConnection(userId, provider, {
    externalId: String(me.body.id),
    externalName: me.body.name || null,
    ...tokens,
  })
}

/**
 * Insert or replace the user's connection to a site. Sync starts from now: older
 * entries come over through an import, not the poll.
 * @param {string} userId
 * @param {string} provider
 * @param {{ externalId: string, externalName: string | null, accessToken: string,
 *   refreshToken?: string | null, expiresAt?: Date | null }} account
 * @returns {Promise<object>}
 */
async function saveConnection(userId, provider, account) {
  try {
    const { rows } = await query(
      `INSERT INTO account_connections
         (user_id, provider, external_id, external_name, access_token, refresh_token,
          token_expires_at, sync_cursor)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       ON CONFLICT (user_id, provider) DO UPDATE SET
         external_id = EXCLUDED.external_id, external_name = EXCLUDED.external_name,
         access_token = EXCLUDED.access_token, refresh_token = EXCLUDED.refresh_token,
         token_expires_at = EXCLUDED.token_expires_at, sync_cursor = EXCLUDED.sync_cursor,
         last_error = NULL, last_polled_at = NULL, created_at = now(), updated_at = now()
       RETURNING *`,
      [
        userId,
        provider,
        account.externalId,
        account.externalName,
        seal(account.accessToken),
        account.refreshToken ? seal(account.refreshToken) : null,
        account.expiresAt || null,
        Date.now(),
      ],
    )
    return publicConnection(provider, rows[0])
  } catch (error) {
    if (error?.code === '23505') {
      throw new ConnectionError(
        `That ${providerLabel(provider)} account is already connected to another AniLounge account.`,
        409,
      )
    }
    throw error
  }
}

// ---------------------------------------------------------------------------
// Reading and removing
// ---------------------------------------------------------------------------

/**
 * @param {string} provider
 * @param {object | null} row - `account_connections` row.
 * @returns {object}
 */
function publicConnection(provider, row) {
  return {
    provider,
    label: providerLabel(provider),
    sync: providerSync(provider),
    available: isProviderConfigured(provider),
    connected: Boolean(row),
    username: row?.external_name || null,
    externalId: row?.external_id || null,
    connectedAt: row?.created_at || null,
    lastSyncedAt: row?.last_synced_at || null,
    lastError: row?.last_error || null,
    expiresAt: provider === 'anilist' ? row?.token_expires_at || null : null,
  }
}

/**
 * Every site with the user's connection state.
 * @param {string} userId
 * @returns {Promise<object[]>}
 */
export async function listConnections(userId) {
  const rows = await loadConnections(userId)
  const byProvider = new Map(rows.map((row) => [row.provider, row]))
  return CONNECTION_PROVIDERS.map((provider) =>
    publicConnection(provider, byProvider.get(provider) || null),
  )
}

/**
 * The user's connection rows (tokens still sealed).
 * @param {string} userId
 * @returns {Promise<object[]>}
 */
export async function loadConnections(userId) {
  const { rows } = await query('SELECT * FROM account_connections WHERE user_id = $1', [userId])
  return rows
}

/**
 * @param {string} userId
 * @param {string} provider
 * @returns {Promise<object | null>}
 */
export async function loadConnection(userId, provider) {
  const { rows } = await query(
    'SELECT * FROM account_connections WHERE user_id = $1 AND provider = $2',
    [userId, provider],
  )
  return rows[0] || null
}

/**
 * Forget a connection. TMDB's session is also deleted on their side; AniList and MAL
 * have no revoke call (the user can remove AniLounge under the site's app settings).
 * @param {string} userId
 * @param {string} provider
 * @returns {Promise<boolean>} Whether a connection was removed.
 */
export async function disconnect(userId, provider) {
  const { rows } = await query(
    'DELETE FROM account_connections WHERE user_id = $1 AND provider = $2 RETURNING *',
    [userId, provider],
  )
  const row = rows[0]
  if (row && provider === 'tmdb' && envValue('TMDB_API_KEY')) {
    const sessionId = unseal(row.access_token)
    if (sessionId) {
      await fetchJson(`${TMDB_API}/authentication/session?api_key=${tmdbKey()}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ session_id: sessionId }),
      })
    }
  }
  return Boolean(row)
}

/**
 * Note how the last sync of a connection went.
 * @param {object} row
 * @param {{ cursor?: number, error?: string | null, synced?: boolean }} result
 * @returns {Promise<void>}
 */
export async function recordSync(row, { cursor, error = null, synced = !error } = {}) {
  await query(
    `UPDATE account_connections SET
       sync_cursor = GREATEST(sync_cursor, $3::bigint),
       last_error = $4,
       last_synced_at = CASE WHEN $5 THEN now() ELSE last_synced_at END,
       updated_at = now()
     WHERE user_id = $1 AND provider = $2`,
    [row.user_id, row.provider, Number(cursor) || 0, error, synced],
  )
}

/**
 * A usable access token for a connection, refreshing MyAnimeList's when it is close to
 * expiring (or when `force` is set after a 401).
 * @param {object} row
 * @param {{ force?: boolean }} [options]
 * @returns {Promise<string>}
 * @throws {ConnectionError} When the user has to reconnect.
 */
export async function accessTokenFor(row, { force = false } = {}) {
  const label = providerLabel(row.provider)
  const token = unseal(row.access_token)
  const expiresAt = row.token_expires_at ? new Date(row.token_expires_at).getTime() : null
  const expiring = expiresAt != null && expiresAt - Date.now() < REFRESH_MARGIN_MS

  if (row.provider === 'mal' && (force || expiring || !token)) {
    const refreshToken = unseal(row.refresh_token)
    const tokens = refreshToken
      ? await malTokenRequest({ grant_type: 'refresh_token', refresh_token: refreshToken })
      : null
    if (!tokens) throw new ConnectionError(`Your ${label} sign-in expired. Reconnect ${label}.`, RECONNECT_STATUS)
    await query(
      `UPDATE account_connections SET access_token = $3, refresh_token = COALESCE($4, refresh_token),
         token_expires_at = $5, updated_at = now()
       WHERE user_id = $1 AND provider = $2`,
      [
        row.user_id,
        row.provider,
        seal(tokens.accessToken),
        tokens.refreshToken ? seal(tokens.refreshToken) : null,
        tokens.expiresAt,
      ],
    )
    row.access_token = seal(tokens.accessToken)
    row.token_expires_at = tokens.expiresAt
    return tokens.accessToken
  }
  if (!token || (expiresAt != null && expiresAt <= Date.now())) {
    throw new ConnectionError(`Your ${label} sign-in expired. Reconnect ${label}.`, RECONNECT_STATUS)
  }
  return token
}

/** Forget pending sign-ins (tests). */
export function resetPendingConnections() {
  pending.clear()
}
