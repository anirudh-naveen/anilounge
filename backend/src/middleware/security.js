import sanitizeHtml from 'sanitize-html'
import xss from 'xss'

// HTML sanitization options
const sanitizeOptions = {
  allowedTags: [],
  allowedAttributes: {},
  disallowedTagsMode: 'discard',
}

// XSS filter options
const xssOptions = {
  whiteList: {},
  stripIgnoreTag: true,
  stripIgnoreTagBody: ['script'],
}

// Sanitize HTML content
export const sanitizeHtmlInput = (req, res, next) => {
  if (req.body) {
    // Sanitize all string fields in req.body
    Object.keys(req.body).forEach((key) => {
      if (typeof req.body[key] === 'string') {
        req.body[key] = sanitizeHtml(req.body[key], sanitizeOptions)
      }
    })
  }

  if (req.query) {
    // Sanitize all string fields in req.query
    Object.keys(req.query).forEach((key) => {
      if (typeof req.query[key] === 'string') {
        req.query[key] = sanitizeHtml(req.query[key], sanitizeOptions)
      }
    })
  }

  next()
}

// XSS protection for specific fields
export const sanitizeXSS = (req, res, next) => {
  if (req.body) {
    // Apply XSS filtering to specific fields
    const fieldsToSanitize = ['username', 'email', 'notes', 'review']

    fieldsToSanitize.forEach((field) => {
      if (req.body[field] && typeof req.body[field] === 'string') {
        req.body[field] = xss(req.body[field], xssOptions)
      }
    })
  }

  next()
}

// Validate MongoDB ObjectId
export const validateObjectId = (req, res, next) => {
  const { id, contentId } = req.params
  const idToCheck = id || contentId

  if (idToCheck && !/^[0-9a-fA-F]{24}$/.test(idToCheck)) {
    return res.status(400).json({
      success: false,
      message: 'Invalid ID format',
    })
  }

  next()
}

// Rate limiting for specific endpoints
export const createRateLimit = (windowMs, max, message) => {
  return (req, res, next) => {
    // Simple in-memory rate limiting (in production, use Redis)
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

// File upload validation
export const validateFileUpload = (req, res, next) => {
  if (req.file) {
    // Check file size (5MB limit)
    if (req.file.size > 5 * 1024 * 1024) {
      return res.status(400).json({
        success: false,
        message: 'File size too large. Maximum 5MB allowed.',
      })
    }

    // Check file type
    const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp']
    if (!allowedTypes.includes(req.file.mimetype)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid file type. Only images are allowed.',
      })
    }

    // Check filename for suspicious patterns
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
