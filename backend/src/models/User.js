/**
 * App accounts stored in Postgres, with a mongoose-like document API.
 */
import crypto from 'crypto'
import bcrypt from 'bcryptjs'
import { query } from '../../config/postgres.js'
import { compileMongoFilter } from '../db/mongoFilter.js'
import { DocQuery } from '../db/query.js'
import { asId } from '../db/ids.js'
import Content, { attachContentRelations, mapContentRow } from './Content.js'

export const DEMO_USER_EMAIL = 'demo@findanimation.com'

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
    failedLoginAttempts: Number(row.failed_login_attempts || 0),
    lockUntil: row.lock_until,
    lastLogin: row.last_login_at,
    createdAt: row.created_at,
    watchlist: [],
    ratings: [],
    favoriteEntities: [],
    preferences: { favoriteGenres: [], favoriteStudios: [] },
  }
}

async function loadUserChildren(doc) {
  const id = doc._id
  const [watchlist, ratings, favs] = await Promise.all([
    query('SELECT * FROM watchlist WHERE user_id = $1 ORDER BY added_at', [id]),
    query('SELECT * FROM ratings WHERE user_id = $1', [id]),
    query('SELECT * FROM favorites WHERE user_id = $1', [id]),
  ])
  const ratingByContent = new Map(ratings.rows.map((row) => [String(row.content_id), row]))
  doc.watchlist = watchlist.rows.map((row) => {
    const rating = ratingByContent.get(String(row.content_id))
    return {
      content: String(row.content_id),
      status: row.status,
      rating: rating ? Number(rating.score) : null,
      currentEpisode: row.current_episode,
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
    addedAt: row.added_at,
  }))
  doc.preferences = { favoriteGenres: [], favoriteStudios: [] }
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
  }))
  if (data.watchlist) this.watchlist = data.watchlist
  if (data.ratings) this.ratings = data.ratings
  if (data.favoriteEntities) this.favoriteEntities = data.favoriteEntities
  if (data.preferences) this.preferences = data.preferences
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

  await query(
    `INSERT INTO users (
       id, username, email, password_hash, profile_picture, bio, is_demo,
       failed_login_attempts, lock_until, last_login_at, created_at
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10, COALESCE((SELECT created_at FROM users WHERE id=$1), now()))
     ON CONFLICT (id) DO UPDATE SET
       username = EXCLUDED.username,
       email = EXCLUDED.email,
       password_hash = EXCLUDED.password_hash,
       profile_picture = EXCLUDED.profile_picture,
       bio = EXCLUDED.bio,
       is_demo = EXCLUDED.is_demo,
       failed_login_attempts = EXCLUDED.failed_login_attempts,
       lock_until = EXCLUDED.lock_until,
       last_login_at = EXCLUDED.last_login_at`,
    [
      this._id,
      this.username,
      this.email,
      passwordHash,
      this.profilePicture || null,
      this.bio || null,
      Boolean(this.isDemoAccount) || this.email === DEMO_USER_EMAIL,
      this.failedLoginAttempts || 0,
      lockUntil,
      this.lastLogin || null,
    ],
  )

  await query('DELETE FROM watchlist WHERE user_id = $1', [this._id])
  for (const item of this.watchlist || []) {
    const contentId = asId(item.content)
    if (!contentId) continue
    const resolved = await Content.findById(contentId)
    if (!resolved) continue
    await query(
      `INSERT INTO watchlist (
         user_id, content_id, status, current_episode, current_season, notes, added_at, updated_at
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
       ON CONFLICT (user_id, content_id) DO NOTHING`,
      [
        this._id,
        resolved._id,
        item.status || 'plan_to_watch',
        item.currentEpisode ?? 0,
        item.currentSeason ?? 1,
        item.notes || null,
        item.addedAt || new Date(),
        item.updatedAt || new Date(),
      ],
    )
  }

  await query('DELETE FROM ratings WHERE user_id = $1', [this._id])
  for (const item of this.watchlist || []) {
    const contentId = asId(item.content)
    if (!contentId || item.rating == null) continue
    const resolved = await Content.findById(contentId)
    if (!resolved) continue
    await query(
      `INSERT INTO ratings (user_id, content_id, score, rated_at)
       VALUES ($1,$2,$3,$4)
       ON CONFLICT (user_id, content_id) DO UPDATE SET score = EXCLUDED.score`,
      [this._id, resolved._id, item.rating, item.updatedAt || new Date()],
    )
  }
  for (const item of this.ratings || []) {
    const contentId = asId(item.content)
    if (!contentId || item.rating == null) continue
    const resolved = await Content.findById(contentId)
    if (!resolved) continue
    await query(
      `INSERT INTO ratings (user_id, content_id, score, review, rated_at)
       VALUES ($1,$2,$3,$4,$5)
       ON CONFLICT (user_id, content_id) DO UPDATE SET
         score = EXCLUDED.score,
         review = COALESCE(EXCLUDED.review, ratings.review)`,
      [this._id, resolved._id, item.rating, item.review || null, item.watchedAt || new Date()],
    )
  }

  await query('DELETE FROM favorites WHERE user_id = $1', [this._id])
  for (const item of this.favoriteEntities || []) {
    const entityId = asId(item.entity)
    if (!entityId) continue
    await query(
      `INSERT INTO favorites (user_id, content_id, added_at)
       VALUES ($1,$2,$3) ON CONFLICT DO NOTHING`,
      [this._id, entityId, item.addedAt || new Date()],
    )
  }

  this.$isNew = false
  return this
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
