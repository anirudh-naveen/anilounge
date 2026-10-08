/**
 * App accounts stored in Postgres, with a mongoose-like document API.
 */
import crypto from 'crypto'
import { comparePassword as checkPassword, hashPassword } from '../utils/passwordHash.js'
import { query, withTransaction } from '../../config/postgres.js'
import { compileMongoFilter } from '../db/mongoFilter.js'
import { DocQuery } from '../db/query.js'
import { asId, isUuid } from '../db/ids.js'
import { loadWorksById, pick } from './Content.js'
import { normalizePreferences, normalizeProfileSettings } from '../utils/profileSettings.js'

export const DEMO_USER_EMAIL = 'demo@findanimation.com'

/**
 * Whether an email (as typed at login) belongs to the shared demo account.
 * @param {unknown} email
 * @returns {boolean}
 */
export function isDemoEmail(email) {
  return typeof email === 'string' && email.trim().toLowerCase() === DEMO_USER_EMAIL
}

/** Optional `users` columns added after the base schema; saves skip any a database lacks. */
const OPTIONAL_USER_COLUMNS = ['preferences', 'profile_settings']
let optionalColumnsPromise = null

/**
 * Optional `users` columns present in the connected database, looked up once per process.
 * Lets the API keep saving users (and logging in) before `npm run db:schema` has run.
 * @returns {Promise<Set<string>>}
 */
function presentOptionalColumns() {
  if (!optionalColumnsPromise) {
    optionalColumnsPromise = query(
      `SELECT column_name FROM information_schema.columns
       WHERE table_schema = current_schema() AND table_name = 'users'
         AND column_name = ANY($1::text[])`,
      [OPTIONAL_USER_COLUMNS],
    )
      .then(({ rows }) => {
        const present = new Set(rows.map((row) => row.column_name))
        const missing = OPTIONAL_USER_COLUMNS.filter((column) => !present.has(column))
        if (missing.length) {
          console.warn(`users table is missing ${missing.join(', ')}; run npm run db:schema`)
        }
        return present
      })
      .catch((error) => {
        optionalColumnsPromise = null
        throw error
      })
  }
  return optionalColumnsPromise
}

function mapUserRow(row) {
  return {
    _id: row.id,
    id: row.id,
    username: row.username,
    email: row.email,
    password: row.password_hash,
    profilePicture: row.profile_picture,
    bio: row.bio,
    isDemoAccount: Boolean(row.is_demo),
    // Missing column (schema not applied yet) reads as a regular user.
    role: ['admin', 'creator'].includes(row.role) ? row.role : 'user',
    mutedUntil: row.muted_until || null,
    muteReason: row.mute_reason || null,
    bannedAt: row.banned_at || null,
    // Granted badges and the emblem pick (see utils/badges.js).
    cosmeticRoles: Array.isArray(row.cosmetic_roles) ? row.cosmetic_roles : [],
    featuredBadge: row.featured_badge || null,
    failedLoginAttempts: Number(row.failed_login_attempts || 0),
    lockUntil: row.lock_until,
    lastLogin: row.last_login_at,
    createdAt: row.created_at,
    // Missing column (schema not applied yet) reads as never imported.
    watchlistImportedAt: row.watchlist_imported_at ?? null,
    // A missing column (schema not applied yet) reads as verified / 2FA off.
    emailVerified: row.email_verified_at === undefined ? true : Boolean(row.email_verified_at),
    twoFactorEnabled: Boolean(row.two_factor_enabled),
    pendingSignup: Boolean(row.pending_signup),
    watchlist: [],
    ratings: [],
    favoriteEntities: [],
    preferences: normalizePreferences(row.preferences),
    profileSettings: normalizeProfileSettings(row.profile_settings),
  }
}

/**
 * `YYYY-MM-DD` for a DATE column. node-postgres reads DATE as local midnight, so the
 * local getters give back the stored day.
 * @param {Date|string|null|undefined} value
 * @returns {string|null}
 */
function dateOnly(value) {
  if (!value) return null
  if (typeof value === 'string') return value.slice(0, 10)
  const pad = (n) => String(n).padStart(2, '0')
  return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}`
}

async function loadUserChildren(doc) {
  const id = doc._id
  const [watchlist, ratings, favs] = await Promise.all([
    query('SELECT * FROM watchlist WHERE user_id = $1 ORDER BY added_at', [id]),
    query('SELECT * FROM ratings WHERE user_id = $1', [id]),
    query(
      `SELECT f.*, c.kind, c.name
       FROM favorites f
       JOIN content c ON c.id = f.content_id
       WHERE f.user_id = $1`,
      [id],
    ),
  ])
  const ratingByContent = new Map(ratings.rows.map((row) => [String(row.content_id), row]))
  doc.watchlist = watchlist.rows.map((row) => {
    const rating = ratingByContent.get(String(row.content_id))
    return {
      content: String(row.content_id),
      status: row.status,
      rating: rating ? Number(rating.score) : null,
      currentEpisode: row.current_episode,
      previousEpisode: row.previous_episode ?? 0,
      currentSeason: row.current_season,
      notes: row.notes,
      startedOn: dateOnly(row.started_on),
      completedOn: dateOnly(row.completed_on),
      rewatchCount: row.rewatch_count ?? 0,
      importedAt: row.imported_at ?? null,
      addedAt: row.added_at,
      updatedAt: row.updated_at,
    }
  })
  doc.ratings = ratings.rows.map((row) => ({
    content: String(row.content_id),
    rating: Number(row.score),
    review: row.review,
    watchedAt: row.rated_at,
  }))
  doc.favoriteEntities = favs.rows.map((row) => ({
    entity: String(row.content_id),
    kind: row.kind,
    name: row.name,
    addedAt: row.added_at,
  }))
  rememberChildren(doc)
  return doc
}

async function populateWatchlistContent(doc, select) {
  const byId = await loadWorksById(doc.watchlist.map((item) => item.content).filter(Boolean))
  doc.watchlist = doc.watchlist.map((item) => ({
    ...item,
    content: pick(byId.get(String(item.content)), select) || item.content,
  }))
}

function isBcrypt(value) {
  return typeof value === 'string' && value.startsWith('$2')
}

function User(data = {}, options = {}) {
  Object.assign(this, mapUserRow({
    id: data._id || data.id || crypto.randomUUID(),
    username: data.username,
    email: data.email,
    password_hash: data.password,
    profile_picture: data.profilePicture || null,
    bio: data.bio || null,
    is_demo: data.isDemoAccount || false,
    failed_login_attempts: data.failedLoginAttempts || 0,
    lock_until: data.lockUntil || null,
    last_login_at: data.lastLogin || null,
    created_at: data.createdAt || new Date(),
    preferences: data.preferences,
    profile_settings: data.profileSettings,
  }))
  if (data.watchlist) this.watchlist = data.watchlist
  if (data.ratings) this.ratings = data.ratings
  if (data.favoriteEntities) this.favoriteEntities = data.favoriteEntities
  this.$isNew = !options.fromDb
}

/**
 * A user document for a `users` row as loaded (no child lists yet).
 * @param {object} row
 * @returns {User}
 */
function userFromRow(row) {
  const doc = Object.create(User.prototype)
  Object.assign(doc, mapUserRow(row))
  doc.$isNew = false
  return doc
}

User.prototype.isDemo = function isDemo() {
  return this.isDemoAccount === true || this.email === DEMO_USER_EMAIL
}

User.prototype.comparePassword = function comparePassword(candidate) {
  return checkPassword(candidate, this.password)
}

User.prototype.toJSON = function toJSON() {
  const { password, $isNew, ...rest } = this
  rest.isDemoAccount = this.isDemo()
  rest._id = this._id
  rest.id = this._id
  return rest
}

User.prototype.toObject = function toObject() {
  return this.toJSON()
}

/**
 * Persist the user and replace their watchlist, ratings, and favorites. The child
 * tables are rewritten delete-then-insert, so it runs in a transaction: a failed
 * insert must roll back rather than leave the user with an empty list.
 * @param {{ session?: object }} [options] - A caller's open transaction to join.
 * @returns {Promise<User>}
 */
User.prototype.save = function save(options = {}) {
  if (options.session) return writeUser(this)
  return withTransaction(() => writeUser(this))
}

/** Hidden marker on a user document: its child rows as loaded (or last saved). */
const CHILDREN_KEY = Symbol('childrenKey')

/**
 * Remember the child rows a document holds, so `save` writes only what changed.
 * @param {object} user
 * @param {ReturnType<typeof childRows>} [rows]
 * @returns {void}
 */
function rememberChildren(user, rows = childRows(user)) {
  Object.defineProperty(user, CHILDREN_KEY, {
    value: { key: JSON.stringify(rows), rows },
    writable: true,
    configurable: true,
  })
}

/**
 * Rows of `next` that are new or differ from `previous`, and ids `previous` had that
 * `next` dropped (both keyed by content_id).
 * @param {object[]} previous
 * @param {object[]} next
 * @returns {{ upserts: object[], removed: string[] }}
 */
function diffRows(previous, next) {
  const before = new Map(previous.map((row) => [row.content_id, JSON.stringify(row)]))
  const after = new Set(next.map((row) => row.content_id))
  return {
    upserts: next.filter((row) => before.get(row.content_id) !== JSON.stringify(row)),
    removed: [...before.keys()].filter((id) => !after.has(id)),
  }
}

/**
 * Normalized watchlist, rating, and favorite rows for a user document.
 * @param {object} user
 * @returns {{ watchlistRows: object[], ratingRows: object[], favoriteRows: object[] }}
 */
function childRows(user) {
  const watchlistRows = firstByContentId(
    (user.watchlist || []).map((item) => ({
      content_id: asId(item.content),
      status: item.status || 'plan_to_watch',
      current_episode: item.currentEpisode ?? 0,
      previous_episode: item.previousEpisode ?? 0,
      current_season: item.currentSeason ?? 1,
      notes: item.notes || null,
      started_on: item.startedOn || null,
      completed_on: item.completedOn || null,
      rewatch_count: item.rewatchCount ?? 0,
      imported_at: item.importedAt || null,
      added_at: item.addedAt || new Date(),
      updated_at: item.updatedAt || new Date(),
    })),
  )

  // Legacy `ratings` entries override watchlist ratings for the same title.
  const ratingRows = new Map()
  for (const item of user.watchlist || []) {
    const contentId = asId(item.content)
    if (!contentId || item.rating == null) continue
    ratingRows.set(contentId, {
      content_id: contentId,
      score: item.rating,
      review: null,
      rated_at: item.updatedAt || new Date(),
    })
  }
  for (const item of user.ratings || []) {
    const contentId = asId(item.content)
    if (!contentId || item.rating == null) continue
    const previous = ratingRows.get(contentId)
    ratingRows.set(contentId, {
      content_id: contentId,
      score: item.rating,
      review: item.review || previous?.review || null,
      rated_at: previous ? previous.rated_at : item.watchedAt || new Date(),
    })
  }

  const favoriteRows = firstByContentId(
    (user.favoriteEntities || []).map((item) => ({
      content_id: asId(item.entity),
      added_at: item.addedAt || new Date(),
    })),
  )
  return { watchlistRows, ratingRows: [...ratingRows.values()], favoriteRows }
}

/**
 * Write a user's watchlist, ratings, and favorites. With `previous` (the rows as loaded),
 * only changed rows are upserted and dropped ones deleted, so editing one title touches
 * one row (and one title's rating totals) instead of rewriting the whole list. Without
 * it (a new user), the lists are replaced outright.
 * @param {string} userId
 * @param {ReturnType<typeof childRows>} rows
 * @param {ReturnType<typeof childRows> | null} previous
 * @returns {Promise<void>}
 */
async function writeChildren(userId, rows, previous) {
  const valid = (list) => list.filter((row) => isUuid(row.content_id))
  const plan = (name) =>
    previous
      ? diffRows(valid(previous[name]), valid(rows[name]))
      : { upserts: valid(rows[name]), removed: null }

  const watch = plan('watchlistRows')
  if (watch.removed === null) await query('DELETE FROM watchlist WHERE user_id = $1', [userId])
  else if (watch.removed.length) {
    await query('DELETE FROM watchlist WHERE user_id = $1 AND content_id = ANY($2::uuid[])', [
      userId,
      watch.removed,
    ])
  }
  if (watch.upserts.length) {
    await query(
      `INSERT INTO watchlist (
         user_id, content_id, status, current_episode, previous_episode, current_season, notes,
         started_on, completed_on, rewatch_count, imported_at, added_at, updated_at
       )
       SELECT $1, c.id, r.status, r.current_episode, r.previous_episode, r.current_season, r.notes,
              r.started_on, r.completed_on, r.rewatch_count, r.imported_at, r.added_at, r.updated_at
       FROM jsonb_to_recordset($2::jsonb) AS r(
         content_id uuid, status text, current_episode int, previous_episode int,
         current_season int, notes text, started_on date, completed_on date, rewatch_count int,
         imported_at timestamptz, added_at timestamptz, updated_at timestamptz
       )
       JOIN content c ON c.id = r.content_id AND c.kind IN ('movie', 'series', 'special')
       ON CONFLICT (user_id, content_id) DO UPDATE SET
         status = EXCLUDED.status, current_episode = EXCLUDED.current_episode,
         previous_episode = EXCLUDED.previous_episode, current_season = EXCLUDED.current_season,
         notes = EXCLUDED.notes, started_on = EXCLUDED.started_on,
         completed_on = EXCLUDED.completed_on, rewatch_count = EXCLUDED.rewatch_count,
         imported_at = EXCLUDED.imported_at, added_at = EXCLUDED.added_at,
         updated_at = EXCLUDED.updated_at`,
      [userId, JSON.stringify(watch.upserts)],
    )
  }

  const rated = plan('ratingRows')
  if (rated.removed === null) await query('DELETE FROM ratings WHERE user_id = $1', [userId])
  else if (rated.removed.length) {
    await query('DELETE FROM ratings WHERE user_id = $1 AND content_id = ANY($2::uuid[])', [
      userId,
      rated.removed,
    ])
  }
  if (rated.upserts.length) {
    await query(
      `INSERT INTO ratings (user_id, content_id, score, review, rated_at)
       SELECT $1, c.id, r.score, r.review, r.rated_at
       FROM jsonb_to_recordset($2::jsonb) AS r(
         content_id uuid, score numeric, review text, rated_at timestamptz
       )
       JOIN content c ON c.id = r.content_id AND c.kind IN ('movie', 'series', 'special')
       ON CONFLICT (user_id, content_id) DO UPDATE SET
         score = EXCLUDED.score, review = EXCLUDED.review, rated_at = EXCLUDED.rated_at`,
      [userId, JSON.stringify(rated.upserts)],
    )
  }

  const faves = plan('favoriteRows')
  if (faves.removed === null) await query('DELETE FROM favorites WHERE user_id = $1', [userId])
  else if (faves.removed.length) {
    await query('DELETE FROM favorites WHERE user_id = $1 AND content_id = ANY($2::uuid[])', [
      userId,
      faves.removed,
    ])
  }
  if (faves.upserts.length) {
    await query(
      `INSERT INTO favorites (user_id, content_id, added_at)
       SELECT $1, r.content_id, r.added_at
       FROM jsonb_to_recordset($2::jsonb) AS r(content_id uuid, added_at timestamptz)
       JOIN content c ON c.id = r.content_id
       ON CONFLICT (user_id, content_id) DO UPDATE SET added_at = EXCLUDED.added_at`,
      [userId, JSON.stringify(faves.upserts)],
    )
  }
}

async function writeUser(user) {
  let passwordHash = user.password
  if (passwordHash && !isBcrypt(passwordHash)) {
    passwordHash = await hashPassword(passwordHash)
    user.password = passwordHash
  }
  const lockUntil =
    user.lockUntil == null
      ? null
      : user.lockUntil instanceof Date
        ? user.lockUntil
        : new Date(user.lockUntil)

  const columns = {
    id: user._id,
    username: user.username,
    email: user.email,
    password_hash: passwordHash,
    profile_picture: user.profilePicture || null,
    bio: user.bio || null,
    is_demo: Boolean(user.isDemoAccount) || user.email === DEMO_USER_EMAIL,
    failed_login_attempts: user.failedLoginAttempts || 0,
    lock_until: lockUntil,
    last_login_at: user.lastLogin || null,
  }
  const optional = await presentOptionalColumns()
  if (optional.has('preferences')) {
    columns.preferences = JSON.stringify(normalizePreferences(user.preferences))
  }
  if (optional.has('profile_settings')) {
    columns.profile_settings = JSON.stringify(normalizeProfileSettings(user.profileSettings))
  }
  const names = Object.keys(columns)
  const placeholders = names.map((_, index) => `$${index + 1}`)
  const updates = names
    .filter((name) => name !== 'id')
    .map((name) => `${name} = EXCLUDED.${name}`)
  await query(
    `INSERT INTO users (${names.join(', ')}, created_at)
     VALUES (${placeholders.join(', ')}, COALESCE((SELECT created_at FROM users WHERE id=$1), now()))
     ON CONFLICT (id) DO UPDATE SET ${updates.join(', ')}`,
    Object.values(columns),
  )

  const isNew = user.$isNew
  const rows = childRows(user)
  const loaded = user[CHILDREN_KEY]
  // Lists are written only when this document holds them (new, or loaded with them) and
  // they changed; a user loaded without them (the auth middleware's `findAuthUser`)
  // must never empty them on save.
  if (isNew && !loaded) {
    await writeChildren(user._id, rows, null)
    rememberChildren(user, rows)
  } else if (loaded && loaded.key !== JSON.stringify(rows)) {
    await writeChildren(user._id, rows, loaded.rows)
    rememberChildren(user, rows)
  }

  user.$isNew = false
  return user
}

/**
 * Drop rows without a `content_id` and keep the first row per id.
 * @param {Array<{ content_id: string }>} rows
 * @returns {Array<{ content_id: string }>}
 */
function firstByContentId(rows) {
  const byId = new Map()
  for (const row of rows) {
    if (row.content_id && !byId.has(row.content_id)) byId.set(row.content_id, row)
  }
  return [...byId.values()]
}

async function execUserFind(filter, q) {
  const compiled = compileMongoFilter(filter, 'users')
  const { rows } = await query(
    `SELECT u.* FROM users u WHERE ${compiled.sql} LIMIT 1`,
    compiled.params,
  )
  if (!rows[0]) return null
  const doc = userFromRow(rows[0])
  await loadUserChildren(doc)
  for (const spec of q._populate) {
    const path = typeof spec === 'string' ? spec : spec.path
    if (path === 'watchlist.content' || path?.includes('watchlist')) {
      await populateWatchlistContent(doc, typeof spec === 'object' ? spec.select : null)
    }
  }
  return q._lean ? doc.toJSON() : doc
}

User.findOne = function findOne(filter = {}) {
  return new DocQuery((q) => execUserFind(filter, q))
}

User.findById = function findById(id) {
  if (!id) return new DocQuery(async () => null)
  return User.findOne({ _id: String(id) })
}

/**
 * The `users` row alone, without watchlist, ratings, or favorites: what the auth
 * middleware attaches to every request. Saving it writes only the `users` row.
 * Handlers that need the lists load them with `User.findById`.
 * @param {string} id
 * @returns {Promise<User|null>}
 */
User.findAuthUser = async function findAuthUser(id) {
  if (!isUuid(id)) return null
  const { rows } = await query('SELECT * FROM users WHERE id = $1::uuid', [String(id)])
  return rows[0] ? userFromRow(rows[0]) : null
}

/**
 * Whether any user matches `filter`, without loading their lists.
 * @param {object} filter - Mongo-style filter (see db/mongoFilter.js).
 * @returns {Promise<boolean>}
 */
User.exists = async function exists(filter = {}) {
  const compiled = compileMongoFilter(filter, 'users')
  const { rows } = await query(
    `SELECT 1 FROM users u WHERE ${compiled.sql} LIMIT 1`,
    compiled.params,
  )
  return rows.length > 0
}

User.distinct = async function distinct(path) {
  if (path === 'watchlist.content') {
    const { rows } = await query('SELECT DISTINCT content_id FROM watchlist')
    return rows.map((row) => row.content_id)
  }
  if (path === 'ratings.content') {
    const { rows } = await query('SELECT DISTINCT content_id FROM ratings')
    return rows.map((row) => row.content_id)
  }
  return []
}

export default User
