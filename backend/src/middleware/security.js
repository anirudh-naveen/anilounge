/**
 * Input sanitization, ObjectId checks, in-memory rate limits, and upload validation.
 *
 * Layer: middleware. HTML/XSS filters run globally; ObjectId and file checks
 * are stacked on individual routes.
 */

import sanitizeHtml from 'sanitize-html'
import xss from 'xss'
import { isCatalogId } from '../db/ids.js'

const sanitizeOptions = {
  allowedTags: [],
  allowedAttributes: {},
  disallowedTagsMode: 'discard',
}

const xssOptions = {
  whiteList: {},
  stripIgnoreTag: true,
  stripIgnoreTagBody: ['script'],
}

/**
 * Strip all HTML tags from string fields on `req.body` and `req.query`.
 *
 * @param {import('express').Request} req - Mutates string values in `body` and `query`.
 * @param {import('express').Response} res - Unused; never sends a response.
 * @param {import('express').NextFunction} next - Always continues after sanitizing.
 * @returns {void}
 */
export const sanitizeHtmlInput = (req, res, next) => {
  if (req.body) {
    Object.keys(req.body).forEach((key) => {
      if (typeof req.body[key] === 'string') {
        req.body[key] = sanitizeHtml(req.body[key], sanitizeOptions)
      }
    })
  }

  if (req.query) {
    Object.keys(req.query).forEach((key) => {
      if (typeof req.query[key] === 'string') {
        req.query[key] = sanitizeHtml(req.query[key], sanitizeOptions)
      }
    })
  }

  next()
}

/**
 * Run XSS filtering on username, email, notes, and review body fields only.
 *
 * @param {import('express').Request} req - Mutates matching string fields on `body`.
 * @param {import('express').Response} res - Unused; never sends a response.
 * @param {import('express').NextFunction} next - Always continues after filtering.
 * @returns {void}
 */
export const sanitizeXSS = (req, res, next) => {
  if (req.body) {
    const fieldsToSanitize = ['username', 'email', 'notes', 'review']

    fieldsToSanitize.forEach((field) => {
      if (req.body[field] && typeof req.body[field] === 'string') {
        req.body[field] = xss(req.body[field], xssOptions)
      }
    })
  }

  next()
}

/**
 * Reject `:id` or `:contentId` params that are not a UUID or legacy Mongo ObjectId.
 *
 * @param {import('express').Request} req - Reads `params.id` or `params.contentId`.
 * @param {import('express').Response} res - 400 `{ message: 'Invalid ID format' }` when the id is malformed.
 * @param {import('express').NextFunction} next - Continues when missing (no param) or well-formed.
 * @returns {void}
 */
export const validateObjectId = (req, res, next) => {
  const { id, contentId } = req.params
  const idToCheck = id || contentId

  if (idToCheck && !isCatalogId(idToCheck)) {
    return res.status(400).json({
      success: false,
      message: 'Invalid ID format',
    })
  }

  next()
}

/**
 * Factory for a process-local IP+path rate limiter (not shared across instances).
 *
 * @param {number} windowMs - Window length in milliseconds before the counter resets.
 * @param {number} max - Maximum hits per IP+path in that window.
 * @param {string} [message] - JSON `message` on 429; defaults to `'Too many requests'`.
 * @returns {import('express').RequestHandler} Middleware that 429s when `max` is exceeded.
 */
export const createRateLimit = (windowMs, max, message) => {
  return (req, res, next) => {
    const key = `${req.ip}-${req.route?.path || req.path}`
    const now = Date.now()

    if (!global.rateLimitStore) {
      global.rateLimitStore = new Map()
    }

    const store = global.rateLimitStore
    const userLimit = store.get(key) || { count: 0, resetTime: now + windowMs }

    if (now > userLimit.resetTime) {
      userLimit.count = 0
      userLimit.resetTime = now + windowMs
    }

    if (userLimit.count >= max) {
      return res.status(429).json({
        success: false,
        message: message || 'Too many requests',
      })
    }

    userLimit.count++
    store.set(key, userLimit)

    next()
  }
}

/**
 * Reject uploaded files over 5MB, non-image MIME types, or executable-like names.
 *
 * @param {import('express').Request} req - Optional `req.file` from multer.
 * @param {import('express').Response} res - 400 when size, type, or filename fails.
 * @param {import('express').NextFunction} next - Continues when there is no file or it passes.
 * @returns {void}
 */
export const validateFileUpload = (req, res, next) => {
  if (req.file) {
    // 5MB upload cap
    if (req.file.size > 5 * 1024 * 1024) {
      return res.status(400).json({
        success: false,
        message: 'File size too large. Maximum 5MB allowed.',
      })
    }

    const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp']
    if (!allowedTypes.includes(req.file.mimetype)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid file type. Only images are allowed.',
      })
    }

    const suspiciousPatterns = /[<>:"/\\|?*]|\.(exe|bat|cmd|scr|pif|vbs|js|jar|php|asp|aspx)$/i
    if (suspiciousPatterns.test(req.file.originalname)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid filename.',
      })
    }
  }

  next()
}

export default {
  sanitizeHtmlInput,
  sanitizeXSS,
  validateObjectId,
  createRateLimit,
  validateFileUpload,
}
