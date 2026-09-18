/**
 * JWT refresh tokens stored in Postgres.
 */
import crypto from 'crypto'
import { query } from '../../config/postgres.js'
import { DocQuery } from '../db/query.js'
import User from './User.js'

function mapRow(row) {
  return {
    _id: row.id,
    token: row.token,
    userId: row.user_id,
    expiresAt: row.expires_at,
    createdAt: row.created_at,
    isRevoked: row.is_revoked,
  }
}

function RefreshToken(data = {}) {
  Object.assign(this, data)
}

RefreshToken.prototype.save = async function save() {
  await query(
    `INSERT INTO refresh_tokens (id, token, user_id, expires_at, is_revoked, created_at)
     VALUES ($1,$2,$3,$4,$5, now())
     ON CONFLICT (token) DO UPDATE SET is_revoked = EXCLUDED.is_revoked, expires_at = EXCLUDED.expires_at`,
    [
      this._id || crypto.randomUUID(),
      this.token,
      this.userId,
      this.expiresAt,
      Boolean(this.isRevoked),
    ],
  )
  return this
}

RefreshToken.createToken = async function createToken(userId) {
  const user = await User.findById(userId)
  if (!user) throw new Error('User not found for refresh token')
  const doc = new RefreshToken({
    _id: crypto.randomUUID(),
    token: crypto.randomBytes(64).toString('hex'),
    userId: user._id,
    expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    isRevoked: false,
  })
  await doc.save()
  return doc
}

RefreshToken.revokeAllForUser = async function revokeAllForUser(userId) {
  const user = await User.findById(userId)
  if (!user) return { modifiedCount: 0 }
  const result = await query('UPDATE refresh_tokens SET is_revoked = true WHERE user_id = $1', [
    user._id,
  ])
  return { modifiedCount: result.rowCount || 0 }
}

RefreshToken.findOne = function findOne(filter = {}) {
  return new DocQuery(async (q) => {
    const clauses = []
    const params = []
    if (filter.token) {
      params.push(filter.token)
      clauses.push(`token = $${params.length}`)
    }
    if (filter.isRevoked != null) {
      params.push(filter.isRevoked)
      clauses.push(`is_revoked = $${params.length}`)
    }
    const { rows } = await query(
      `SELECT * FROM refresh_tokens ${clauses.length ? `WHERE ${clauses.join(' AND ')}` : ''} LIMIT 1`,
      params,
    )
    if (!rows[0]) return null
    const doc = new RefreshToken(mapRow(rows[0]))
    if (q._populate.some((spec) => spec === 'userId' || spec?.path === 'userId')) {
      doc.userId = await User.findById(doc.userId)
    }
    return doc
  })
}

RefreshToken.updateOne = async function updateOne(filter, update) {
  if (filter.token && update.isRevoked != null) {
    await query('UPDATE refresh_tokens SET is_revoked = $1 WHERE token = $2', [
      update.isRevoked,
      filter.token,
    ])
  }
  return { modifiedCount: 1 }
}

RefreshToken.deleteMany = async function deleteMany(filter = {}) {
  if (filter.$or) {
    const result = await query(
      `DELETE FROM refresh_tokens
       WHERE expires_at < now()
          OR (is_revoked = true AND created_at < now() - interval '30 days')`,
    )
    return { deletedCount: result.rowCount || 0 }
  }
  const result = await query('DELETE FROM refresh_tokens')
  return { deletedCount: result.rowCount || 0 }
}

export default RefreshToken
