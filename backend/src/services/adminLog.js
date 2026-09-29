/**
 * Append-only admin log: who changed what, read month by month on the admin page.
 *
 * Layer: domain service. Categories: 'admin' (content and link edits, sync notice
 * decisions), 'moderation' (roles, mutes, bans), 'sync' (changes the catalog sync
 * made or was blocked from making). The table refuses UPDATE/DELETE (see schema.sql)
 * and nothing in the app edits it. Messages are plain text lines.
 */

import { query } from '../../config/postgres.js'

export const LOG_CATEGORIES = ['admin', 'moderation', 'sync']
const MAX_VALUE_LENGTH = 120
const RECHECK_MS = 60 * 1000
let tableReady = false
let checkedAt = 0

/**
 * Whether `admin_log` exists (checked up front so a missing table never aborts the
 * caller's transaction).
 * @returns {Promise<boolean>}
 */
export async function logTableReady() {
  if (tableReady || Date.now() - checkedAt < RECHECK_MS) return tableReady
  const { rows } = await query(`SELECT to_regclass('public.admin_log') IS NOT NULL AS ok`)
  tableReady = Boolean(rows[0]?.ok)
  checkedAt = Date.now()
  return tableReady
}

/**
 * A value quoted and shortened for a log line.
 * @param {unknown} value
 * @returns {string}
 */
export function quoteValue(value) {
  if (value === null || value === undefined || value === '') return '(empty)'
  const text = String(value).replace(/\s+/g, ' ').trim()
  const short = text.length > MAX_VALUE_LENGTH ? `${text.slice(0, MAX_VALUE_LENGTH - 1)}…` : text
  return `"${short}"`
}

/**
 * Human label for a catalog row, e.g. `series "Frieren"`.
 * @param {string} kind
 * @param {string} name
 * @returns {string}
 */
export function describeRow(kind, name) {
  const label = { voice: 'voice actor' }[kind] || kind
  return `${label} ${quoteValue(name)}`
}

/**
 * Append one line. Never throws: a logging failure must not undo the action it describes.
 * @param {'admin' | 'moderation' | 'sync'} category
 * @param {{ _id?: string, username?: string } | null} actor - null for the sync.
 * @param {string} message
 * @returns {Promise<void>}
 */
export async function logAction(category, actor, message) {
  try {
    if (!(await logTableReady())) return
    await query(
      'INSERT INTO admin_log (category, actor_id, actor_username, message) VALUES ($1, $2, $3, $4)',
      [category, actor?._id || null, actor?.username || null, message],
    )
  } catch (error) {
    console.error('Admin log write failed:', error.message)
  }
}

/**
 * Months that have entries, newest first.
 * @returns {Promise<Array<{ month: string, count: number }>>} `month` is `YYYY-MM` (UTC).
 */
export async function listLogMonths() {
  if (!(await logTableReady())) return []
  const { rows } = await query(
    `SELECT to_char(date_trunc('month', created_at AT TIME ZONE 'UTC'), 'YYYY-MM') AS month,
            count(*)::int AS count
     FROM admin_log GROUP BY 1 ORDER BY 1 DESC`,
  )
  return rows
}

/**
 * One month's entries, oldest first so it reads like a log file.
 * @param {string} month - `YYYY-MM`.
 * @param {string} [category]
 * @returns {Promise<Array<{ category: string, actor: string | null, message: string, createdAt: Date }>>}
 */
export async function readLogMonth(month, category) {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(String(month)) || !(await logTableReady())) return []
  const params = [`${month}-01`]
  let where = `created_at >= ($1::timestamp AT TIME ZONE 'UTC')
    AND created_at < (($1::timestamp + interval '1 month') AT TIME ZONE 'UTC')`
  if (LOG_CATEGORIES.includes(category)) {
    params.push(category)
    where += ' AND category = $2'
  }
  const { rows } = await query(
    `SELECT category, actor_username, message, created_at FROM admin_log
     WHERE ${where} ORDER BY created_at, id`,
    params,
  )
  return rows.map((row) => ({
    category: row.category,
    actor: row.actor_username,
    message: row.message,
    createdAt: row.created_at,
  }))
}

export default { logAction, listLogMonths, readLogMonth, quoteValue, describeRow, LOG_CATEGORIES }
