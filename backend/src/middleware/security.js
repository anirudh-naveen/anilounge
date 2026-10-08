/**
 * Input sanitization and id checks.
 *
 * Layer: middleware. HTML/XSS filters run globally; the id check is stacked on
 * individual routes.
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
