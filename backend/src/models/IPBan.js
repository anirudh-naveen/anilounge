/**
 * Temporary IP bans stored in Postgres.
 */
import crypto from 'crypto'
import { query } from '../../config/postgres.js'

function mapRow(row) {
  if (!row) return null
  return {
    _id: row.id,
    ip: row.ip,
    reason: row.reason,
    bannedAt: row.banned_at,
    expiresAt: row.expires_at,
    attempts: Number(row.attempts || 1),
    userAgent: row.user_agent,
    lastSeen: row.last_seen,
    isActive: row.is_active,
  }
}

const IPBan = {
  async banIP(ip, reason, duration = 24 * 60 * 60 * 1000, userAgent = null) {
    const expiresAt = new Date(Date.now() + duration)
    const existing = await query(
      'SELECT * FROM ip_bans WHERE ip = $1 AND is_active = true LIMIT 1',
      [ip],
    )
    if (existing.rows[0]) {
      const { rows } = await query(
        `UPDATE ip_bans
         SET attempts = attempts + 1, last_seen = now(), expires_at = $2, user_agent = COALESCE($3, user_agent)
         WHERE id = $1
         RETURNING *`,
        [existing.rows[0].id, expiresAt, userAgent],
      )
      return mapRow(rows[0])
    }
    const { rows } = await query(
      `INSERT INTO ip_bans (id, ip, reason, expires_at, attempts, user_agent, is_active)
       VALUES ($1,$2,$3,$4,1,$5,true)
       ON CONFLICT (ip) DO UPDATE SET
         reason = EXCLUDED.reason,
         expires_at = EXCLUDED.expires_at,
         attempts = ip_bans.attempts + 1,
         user_agent = EXCLUDED.user_agent,
         is_active = true,
         last_seen = now()
       RETURNING *`,
      [crypto.randomUUID(), ip, reason, expiresAt, userAgent],
    )
    return mapRow(rows[0])
  },

  async isIPBanned(ip) {
    const { rows } = await query(
      `SELECT * FROM ip_bans
       WHERE ip = $1 AND is_active = true AND expires_at > now()
       LIMIT 1`,
      [ip],
    )
    return mapRow(rows[0])
  },

  async unbanIP(ip) {
    const result = await query('UPDATE ip_bans SET is_active = false WHERE ip = $1', [ip])
    return { modifiedCount: result.rowCount || 0 }
  },

  async getBanStats() {
    const { rows } = await query(
      `SELECT reason AS _id, count(*)::int AS count, coalesce(sum(attempts),0)::int AS "totalAttempts"
       FROM ip_bans
       WHERE is_active = true AND expires_at > now()
       GROUP BY reason`,
    )
    return rows
  },

  async find(filter = {}) {
    const clauses = ['TRUE']
    const params = []
    if (filter.isActive != null) {
      params.push(filter.isActive)
      clauses.push(`is_active = $${params.length}`)
    }
    if (filter.expiresAt?.$gt) {
      params.push(filter.expiresAt.$gt)
      clauses.push(`expires_at > $${params.length}`)
    }
    const { rows } = await query(
      `SELECT * FROM ip_bans WHERE ${clauses.join(' AND ')} ORDER BY banned_at DESC`,
      params,
    )
    return rows.map(mapRow)
  },

  async findOne(filter = {}) {
    const rows = await IPBan.find(filter)
    if (filter.ip) return rows.find((row) => row.ip === filter.ip) || null
    return rows[0] || null
  },
}

export default IPBan
