/**
 * Deleted accounts, listed on the admin page's Deleted Users tab.
 *
 * Layer: domain service. Every account deletion goes through `deleteUsers`, which deletes
 * and records the row in one statement, so a deletion is never lost or double-counted.
 * Only the username and dates are kept (see `deleted_users` in schema.sql).
 */

import { query } from '../../config/postgres.js'
import { escapeLike } from '../db/mongoFilter.js'

export const DELETION_REASONS = ['self', 'inactive', 'unverified']
const PAGE_SIZE = 25
const RECHECK_MS = 60 * 1000
let tableReady = false
let checkedAt = 0

/**
 * Whether `deleted_users` exists, so a deletion still works before the schema is applied.
 * @returns {Promise<boolean>}
 */
async function deletedTableReady() {
  if (tableReady || Date.now() - checkedAt < RECHECK_MS) return tableReady
  const { rows } = await query(`SELECT to_regclass('public.deleted_users') IS NOT NULL AS ok`)
  tableReady = Boolean(rows[0]?.ok)
  checkedAt = Date.now()
  return tableReady
}

/**
 * Delete the users matching `where` and record each one under `reason`.
 * @param {string} where - SQL condition on `users` (never the demo account; callers add that).
 * @param {unknown[]} params - Parameters for `where`.
 * @param {'self' | 'inactive' | 'unverified'} reason
 * @returns {Promise<number>} Rows deleted.
 */
export async function deleteUsers(where, params, reason) {
  if (!(await deletedTableReady())) {
    const { rowCount } = await query(`DELETE FROM users WHERE ${where}`, params)
    return rowCount
  }
  params.push(reason)
  const { rowCount } = await query(
    `WITH gone AS (
       DELETE FROM users WHERE ${where}
       RETURNING id, username, created_at, last_active_at
     )
     INSERT INTO deleted_users (user_id, username, reason, joined_at, last_active_at)
     SELECT id, username, $${params.length}, created_at, last_active_at FROM gone`,
    params,
  )
  return rowCount
}

/**
 * One page of deleted accounts, newest first.
 * @param {{ q?: string, reason?: string, page?: unknown }} [options]
 * @returns {Promise<{ items: object[], page: number, pageSize: number, total: number }>}
 */
export async function listDeletedUsers({ q, reason, page } = {}) {
  const parsed = Number.parseInt(String(page ?? ''), 10)
  const current = Number.isInteger(parsed) && parsed > 0 ? Math.min(parsed, 10000) : 1
  if (!(await deletedTableReady()))
    return { items: [], page: current, pageSize: PAGE_SIZE, total: 0 }

  const term = typeof q === 'string' ? q.trim().slice(0, 100) : ''
  const params = []
  const clauses = []
  if (term) {
    params.push(`%${escapeLike(term)}%`)
    clauses.push(`username ILIKE $${params.length}`)
  }
  if (DELETION_REASONS.includes(reason)) {
    params.push(reason)
    clauses.push(`reason = $${params.length}`)
  }
  const where = clauses.join(' AND ') || 'true'
  const [{ rows }, count] = await Promise.all([
    query(
      `SELECT id, user_id, username, reason, joined_at, last_active_at, deleted_at
       FROM deleted_users WHERE ${where}
       ORDER BY deleted_at DESC
       LIMIT ${PAGE_SIZE} OFFSET ${(current - 1) * PAGE_SIZE}`,
      params,
    ),
    query(`SELECT count(*)::int AS n FROM deleted_users WHERE ${where}`, params),
  ])
  return {
    items: rows.map((row) => ({
      id: String(row.id),
      userId: String(row.user_id),
      username: row.username,
      reason: row.reason,
      joinedAt: row.joined_at,
      lastActiveAt: row.last_active_at,
      deletedAt: row.deleted_at,
    })),
    page: current,
    pageSize: PAGE_SIZE,
    total: count.rows[0].n,
  }
}
