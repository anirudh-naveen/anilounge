/**
 * Beta feedback (bug reports, feature requests) HTTP handlers.
 *
 * Layer: controller. Each submission is stored in the `feedback` table (read by admins
 * in the admin page's Log tab) and emailed to the support inbox (SUPPORT_EMAIL,
 * default support@anilounge.net).
 */

import { query } from '../../config/postgres.js'
import { sendFeedbackEmail } from '../services/emailService.js'
import { sendError } from '../utils/httpError.js'

export const FEEDBACK_TYPES = ['bug', 'feature', 'improvement', 'other']
const MESSAGE_MAX = 5000
const PAGE_SIZE = 25

/**
 * @param {unknown} value
 * @param {number} max
 * @returns {string | null} Trimmed text cut to `max`, or null when empty.
 */
function clip(value, max) {
  const text = typeof value === 'string' ? value.trim().slice(0, max) : ''
  return text || null
}

/**
 * Insert a submission. Before `npm run db:schema` has created the table, fall back to
 * an unsaved id so the email still goes out and the form still succeeds.
 * @param {unknown[]} values - type, message, email, user_id, page_url, user_agent
 * @returns {Promise<{ id: string, created_at: Date }>}
 */
async function storeFeedback(values) {
  try {
    const { rows } = await query(
      `INSERT INTO feedback (type, message, email, user_id, page_url, user_agent)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, created_at`,
      values,
    )
    return rows[0]
  } catch (error) {
    if (error.code !== '42P01') throw error
    console.error('feedback table missing; run npm run db:schema. Emailing only.')
    return { id: `unsaved-${Date.now()}`, created_at: new Date() }
  }
}

/**
 * Validate and store a feedback submission, then email it to support.
 *
 * @param {import('express').Request} req - `body.type` (bug|feature|improvement|other) and `body.message` required; `body.email`, `body.url` optional. `req.user` when signed in.
 * @param {import('express').Response} res - 200 `{ data: { id } }`, 400, or 500.
 * @returns {Promise<void>}
 */
export const submitFeedback = async (req, res) => {
  try {
    const { type } = req.body || {}
    const message = clip(req.body?.message, MESSAGE_MAX)
    if (!FEEDBACK_TYPES.includes(type) || !message) {
      return res.status(400).json({
        success: false,
        message: 'Feedback type and message are required',
      })
    }
    const email = clip(req.body?.email, 320) || req.user?.email || null
    const pageUrl = clip(req.body?.url, 500)
    const userAgent = clip(req.get('User-Agent') || req.body?.userAgent, 500)

    const saved = await storeFeedback([
      type,
      message,
      email,
      req.user?._id || null,
      pageUrl,
      userAgent,
    ])

    // A mail outage should not lose the submission or fail the form.
    await sendFeedbackEmail({
      id: saved.id,
      type,
      message,
      email: email || 'anonymous',
      timestamp: new Date(saved.created_at).toISOString(),
      userAgent: userAgent || 'unknown',
      url: pageUrl || 'unknown',
    }).catch((error) => {
      console.error('Feedback email failed:', error)
    })

    res.json({
      success: true,
      message: 'Feedback submitted successfully! Thank you for helping us improve.',
      data: { id: saved.id },
    })
  } catch (error) {
    sendError(res, error, 'Failed to submit feedback. Please try again.')
  }
}

/**
 * Stored feedback, newest first. The route restricts this to admins (it holds emails).
 *
 * @param {import('express').Request} req - Optional `query.type`, `query.page`.
 * @param {import('express').Response} res - 200 `{ data: { items, page, pageSize, total } }` or 500.
 * @returns {Promise<void>}
 */
export const getFeedback = async (req, res) => {
  try {
    const page = Math.min(Math.max(Number.parseInt(req.query.page, 10) || 1, 1), 10000)
    const type = FEEDBACK_TYPES.includes(req.query.type) ? req.query.type : null
    const [{ rows }, count] = await Promise.all([
      query(
        `SELECT f.id, f.type, f.message, f.email, f.page_url, f.created_at, u.username
         FROM feedback f LEFT JOIN users u ON u.id = f.user_id
         WHERE $1::text IS NULL OR f.type = $1
         ORDER BY f.created_at DESC
         LIMIT ${PAGE_SIZE} OFFSET ${(page - 1) * PAGE_SIZE}`,
        [type],
      ),
      query('SELECT count(*)::int AS n FROM feedback WHERE $1::text IS NULL OR type = $1', [type]),
    ])
    res.json({
      success: true,
      data: {
        items: rows.map((row) => ({
          id: row.id,
          type: row.type,
          message: row.message,
          email: row.email,
          username: row.username || null,
          pageUrl: row.page_url,
          createdAt: row.created_at,
        })),
        page,
        pageSize: PAGE_SIZE,
        total: count.rows[0].n,
      },
    })
  } catch (error) {
    sendError(res, error, 'Failed to retrieve feedback')
  }
}
