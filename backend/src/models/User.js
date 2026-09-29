/**
 * App accounts stored in Postgres, with a mongoose-like document API.
 */
import crypto from 'crypto'
import bcrypt from 'bcryptjs'
import { query } from '../../config/postgres.js'
import { compileMongoFilter } from '../db/mongoFilter.js'
import { DocQuery } from '../db/query.js'
import { asId } from '../db/ids.js'
import { attachContentRelations, mapContentRow } from './Content.js'
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
    failedLoginAttempts: Number(row.failed_login_attempts || 0),
    lockUntil: row.lock_until,
    lastLogin: row.last_login_at,
    createdAt: row.created_at,
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
  return doc
}

async function populateWatchlistContent(doc, select) {
  const ids = doc.watchlist.map((item) => item.content).filter(Boolean)
  if (!ids.length) return
  const { rows } = await query('SELECT * FROM works WHERE id = ANY($1::uuid[])', [ids])
  const contents = await attachContentRelations(rows.map(mapContentRow))
  const byId = new Map(contents.map((item) => [String(item._id), item]))
  doc.watchlist = doc.watchlist.map((item) => ({
    ...item,
    content: pick(byId.get(String(item.content)), select) || item.content,
  }))
}

async function populateRatingContent(doc) {
  const ids = doc.ratings.map((item) => item.content).filter(Boolean)
  if (!ids.length) return
  const { rows } = await query('SELECT * FROM works WHERE id = ANY($1::uuid[])', [ids])
  const contents = await attachContentRelations(rows.map(mapContentRow))
  const byId = new Map(contents.map((item) => [String(item._id), item]))
  doc.ratings = doc.ratings.map((item) => ({
    ...item,
    content: byId.get(String(item.content)) || item.content,
  }))
}

async function populateFavoriteEntities(doc) {
  const ids = doc.favoriteEntities.map((item) => item.entity).filter(Boolean)
  if (!ids.length) return
  const { default: Entity } = await import('./Entity.js')
  const entities = await Entity.find({ _id: { $in: ids } })
  const byId = new Map(entities.map((item) => [String(item._id), item]))
  doc.favoriteEntities = doc.favoriteEntities.map((item) => ({
    ...item,
    entity: byId.get(String(item.entity)) || item.entity,
  }))
}

function pick(doc, select) {
  if (!doc) return null
  if (!select || typeof select !== 'string') return doc
  const fields = select.split(/\s+/).filter(Boolean)
  const out = { _id: doc._id, id: doc._id }
  for (const field of fields) out[field] = doc[field]
  return out
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

User.prototype.isDemo = function isDemo() {
  return this.isDemoAccount === true || this.email === DEMO_USER_EMAIL
}

User.prototype.comparePassword = function comparePassword(candidate) {
  return bcrypt.compare(candidate, this.password)
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

User.prototype.save = async function save() {
  let passwordHash = this.password
  if (passwordHash && !isBcrypt(passwordHash)) {
    passwordHash = await bcrypt.hash(passwordHash, 12)
    this.password = passwordHash
  }
  const lockUntil =
    this.lockUntil == null || this.lockUntil === undefined
      ? null
      : this.lockUntil instanceof Date
        ? this.lockUntil
        : new Date(this.lockUntil)

  const columns = {
    id: this._id,
    username: this.username,
    email: this.email,
    password_hash: passwordHash,
    profile_picture: this.profilePicture || null,
    bio: this.bio || null,
    is_demo: Boolean(this.isDemoAccount) || this.email === DEMO_USER_EMAIL,
    failed_login_attempts: this.failedLoginAttempts || 0,
    lock_until: lockUntil,
    last_login_at: this.lastLogin || null,
  }
  const optional = await presentOptionalColumns()
  if (optional.has('preferences')) {
    columns.preferences = JSON.stringify(normalizePreferences(this.preferences))
  }
  if (optional.has('profile_settings')) {
    columns.profile_settings = JSON.stringify(normalizeProfileSettings(this.profileSettings))
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

  const watchlistRows = firstByContentId(
    (this.watchlist || []).map((item) => ({
      content_id: asId(item.content),
      status: item.status || 'plan_to_watch',
      current_episode: item.currentEpisode ?? 0,
      previous_episode: item.previousEpisode ?? 0,
      current_season: item.currentSeason ?? 1,
      notes: item.notes || null,
      added_at: item.addedAt || new Date(),
      updated_at: item.updatedAt || new Date(),
    })),
  )
  await query('DELETE FROM watchlist WHERE user_id = $1', [this._id])
  if (watchlistRows.length) {
    await query(
      `INSERT INTO watchlist (
         user_id, content_id, status, current_episode, previous_episode, current_season, notes,
         added_at, updated_at
       )
       SELECT $1, w.id, r.status, r.current_episode, r.previous_episode, r.current_season, r.notes,
              r.added_at, r.updated_at
       FROM jsonb_to_recordset($2::jsonb) AS r(
         content_id text, status text, current_episode int, previous_episode int,
         current_season int, notes text, added_at timestamptz, updated_at timestamptz
       )
       JOIN works w ON w.id::text = r.content_id
       ON CONFLICT (user_id, content_id) DO NOTHING`,
      [this._id, JSON.stringify(watchlistRows)],
    )
  }

  // Legacy `ratings` entries override watchlist ratings for the same title.
  const ratingRows = new Map()
  for (const item of this.watchlist || []) {
    const contentId = asId(item.content)
    if (!contentId || item.rating == null) continue
    ratingRows.set(contentId, {
      content_id: contentId,
      score: item.rating,
      review: null,
      rated_at: item.updatedAt || new Date(),
    })
  }
  for (const item of this.ratings || []) {
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
  await query('DELETE FROM ratings WHERE user_id = $1', [this._id])
  if (ratingRows.size) {
    await query(
      `INSERT INTO ratings (user_id, content_id, score, review, rated_at)
       SELECT $1, w.id, r.score, r.review, r.rated_at
       FROM jsonb_to_recordset($2::jsonb) AS r(
         content_id text, score numeric, review text, rated_at timestamptz
       )
       JOIN works w ON w.id::text = r.content_id`,
      [this._id, JSON.stringify([...ratingRows.values()])],
    )
  }

  const favoriteRows = firstByContentId(
    (this.favoriteEntities || []).map((item) => ({
      content_id: asId(item.entity),
      added_at: item.addedAt || new Date(),
    })),
  )
  await query('DELETE FROM favorites WHERE user_id = $1', [this._id])
  if (favoriteRows.length) {
    await query(
      `INSERT INTO favorites (user_id, content_id, added_at)
       SELECT $1, r.content_id::uuid, r.added_at
       FROM jsonb_to_recordset($2::jsonb) AS r(content_id text, added_at timestamptz)
       ON CONFLICT DO NOTHING`,
      [this._id, JSON.stringify(favoriteRows)],
    )
  }

  this.$isNew = false
  return this
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
  const doc = new User(mapUserRow(rows[0]), { fromDb: true })
  Object.assign(doc, mapUserRow(rows[0]))
  await loadUserChildren(doc)
  if (q._select === '-password') {
    // still keep hash internally for compare; strip on toJSON
  }
  for (const spec of q._populate) {
    const path = typeof spec === 'string' ? spec : spec.path
    if (path === 'watchlist.content' || path?.includes('watchlist')) {
      await populateWatchlistContent(doc, typeof spec === 'object' ? spec.select : null)
    }
    if (path === 'ratings.content' || path === 'ratings') {
      await populateRatingContent(doc)
    }
    if (path === 'favoriteEntities.entity' || path?.includes('favoriteEntities')) {
      await populateFavoriteEntities(doc)
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

User.find = function find(filter = {}) {
  return new DocQuery(async (q) => {
    const compiled = compileMongoFilter(filter, 'users')
    const { rows } = await query(`SELECT u.* FROM users u WHERE ${compiled.sql}`, compiled.params)
    const docs = []
    for (const row of rows) {
      const doc = new User(mapUserRow(row), { fromDb: true })
      Object.assign(doc, mapUserRow(row))
      await loadUserChildren(doc)
      docs.push(q._lean ? doc.toJSON() : doc)
    }
    return docs
  })
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

User.findByIdAndUpdate = async function findByIdAndUpdate(id, update = {}, options = {}) {
  const doc = await User.findById(id)
  if (!doc) return null
  if (update.preferences) {
    doc.preferences = { ...doc.preferences, ...update.preferences }
    delete update.preferences
  }
  Object.assign(doc, update)
  await doc.save()
  if (options.new === false) return doc
  return options.select === '-password' || true ? doc : doc
}

export default User
