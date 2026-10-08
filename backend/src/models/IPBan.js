/**
 * Temporary IP bans stored in Postgres.
 */
import crypto from 'crypto'
import { query } from '../../config/postgres.js'

/**
 * The form bans are stored under: IPv4 clients reach a dual-stack socket as
 * `::ffff:1.2.3.4`, so that prefix is dropped.
 * @param {string} ip
 * @returns {string}
 */
export function normalizeIp(ip) {
  return String(ip || '')
    .trim()
    .replace(/^::ffff:/i, '')
}

/**
 * Stored forms to match for `ip`: rows written before normalization kept the prefix.
 * @param {string} ip
 * @returns {string[]}
 */
function storedForms(ip) {
  const normalized = normalizeIp(ip)
  return normalized.includes(':') ? [normalized] : [normalized, `::ffff:${normalized}`]
}

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
      'SELECT * FROM ip_bans WHERE ip = ANY($1) AND is_active = true LIMIT 1',
      [storedForms(ip)],
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
      [crypto.randomUUID(), normalizeIp(ip), reason, expiresAt, userAgent],
    )
    return mapRow(rows[0])
  },

  async isIPBanned(ip) {
    const { rows } = await query(
      `SELECT * FROM ip_bans
       WHERE ip = ANY($1) AND is_active = true AND expires_at > now()
       LIMIT 1`,
      [storedForms(ip)],
    )
    return mapRow(rows[0])
  },

  /** Record that a banned address came back. */
  async markSeen(id) {
    await query('UPDATE ip_bans SET last_seen = now() WHERE id = $1', [id])
  },

  async unbanIP(ip) {
    const result = await query('UPDATE ip_bans SET is_active = false WHERE ip = ANY($1)', [
      storedForms(ip),
    ])
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
}

export default IPBan
