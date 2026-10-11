/**
 * Site news written on the admin page's News tab: posted to every inbox as Lounge
 * Keeper (see inboxService), with pictures uploaded here.
 *
 * Layer: service. Pictures live in `news_images` (Postgres, like avatars) and are served
 * at `/api/news-images/:id`; the news body references them as `![caption](url)` lines
 * (utils/richText.ts on the client). Admins only; posting and deleting are logged.
 */

import { query } from '../../config/postgres.js'
import { isUuid } from '../db/ids.js'
import { HttpError } from '../utils/httpError.js'
import { logAction, quoteValue } from './adminLog.js'
import { detectImageType } from './avatarService.js'
import { NEWS_DAYS, postAnnouncement } from './inboxService.js'

export const MAX_NEWS_IMAGE_BYTES = 5 * 1024 * 1024
const RECENT_LIMIT = 20
/** Postgres: `news_images` not created yet (schema not applied). */
const MISSING_TABLE = '42P01'

/**
 * Store an uploaded picture.
 * @param {object} actor - `req.user`.
 * @param {Buffer | undefined} data
 * @returns {Promise<{ id: string, url: string }>}
 * @throws {HttpError} 400 missing, too big, or not an image.
 */
export async function saveNewsImage(actor, data) {
  if (!data?.length) throw new HttpError(400, 'Choose a picture to upload.')
  if (data.length > MAX_NEWS_IMAGE_BYTES) throw new HttpError(400, 'Pictures can be up to 5 MB.')
  const contentType = detectImageType(data)
  if (!contentType) throw new HttpError(400, 'Only JPG, PNG, GIF, and WebP pictures work.')
  const { rows } = await query(
    'INSERT INTO news_images (content_type, data, uploaded_by) VALUES ($1, $2, $3) RETURNING id',
    [contentType, data, actor?._id || null],
  ).catch((error) => {
    if (error.code === MISSING_TABLE) {
      throw new HttpError(503, 'Picture uploads need a database update (npm run db:schema).')
    }
    throw error
  })
  const id = String(rows[0].id)
  return { id, url: `/api/news-images/${id}` }
}

/**
 * @param {string} id
 * @returns {Promise<{ contentType: string, data: Buffer, createdAt: Date } | null>}
 */
export async function getNewsImage(id) {
  if (!isUuid(id)) return null
  const { rows } = await query(
    'SELECT content_type, data, created_at FROM news_images WHERE id = $1',
    [id],
  ).catch((error) => {
    if (error.code === MISSING_TABLE) return { rows: [] }
    throw error
  })
  if (!rows[0]) return null
  return { contentType: rows[0].content_type, data: rows[0].data, createdAt: rows[0].created_at }
}

/**
 * Post news to every inbox and log it.
 * @param {object} actor - `req.user`.
 * @param {{ title?: unknown, body?: unknown }} input
 * @returns {Promise<{ id: string, title: string, body: string, createdAt: Date }>}
 * @throws {HttpError} 400 empty or too long.
 */
export async function postNews(actor, { title, body } = {}) {
  const news = await postAnnouncement({ title, body })
  await logAction('moderation', actor, `Posted news ${quoteValue(news.title)} as Lounge Keeper`)
  return news
}

/**
 * News still showing in inboxes, newest first, with how many have read each.
 * @returns {Promise<Array<{ id: string, title: string, body: string, createdAt: Date, reads: number }>>}
 */
export async function listRecentNews() {
  const { rows } = await query(
    `SELECT a.id, a.title, a.body, a.created_at,
            (SELECT count(*)::int FROM announcement_reads r WHERE r.announcement_id = a.id) AS reads
     FROM announcements a
     WHERE a.created_at > now() - make_interval(days => $1)
     ORDER BY a.created_at DESC
     LIMIT ${RECENT_LIMIT}`,
    [NEWS_DAYS],
  )
  return rows.map((row) => ({
    id: String(row.id),
    title: row.title,
    body: row.body,
    createdAt: row.created_at,
    reads: row.reads,
  }))
}

/**
 * Take news out of every inbox.
 * @param {object} actor - `req.user`.
 * @param {string} id
 * @returns {Promise<void>}
 * @throws {HttpError} 404 unknown news.
 */
export async function deleteNews(actor, id) {
  if (!isUuid(id)) throw new HttpError(404, 'News not found.')
  const { rows } = await query('DELETE FROM announcements WHERE id = $1 RETURNING title', [id])
  if (!rows[0]) throw new HttpError(404, 'News not found.')
  await logAction('moderation', actor, `Deleted news ${quoteValue(rows[0].title)}`)
}
