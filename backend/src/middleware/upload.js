/**
 * Multer in-memory upload for profile pictures (stored in Postgres by avatarService).
 *
 * Layer: middleware. Default export is the configured `upload` instance;
 * `handleUploadError` maps multer failures to 400 JSON.
 */

import multer from 'multer'
import path from 'path'
import { MAX_AVATAR_BYTES } from '../services/avatarService.js'

const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp']
const ALLOWED_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.gif', '.webp']
const SUSPICIOUS_NAME = /[<>:"/\\|?*]|\.(exe|bat|cmd|scr|pif|vbs|js|jar|php|asp|aspx)$/i

// Kept in memory: the controller validates the bytes and stores them in Postgres.
const storage = multer.memoryStorage()

/**
 * Accept only image MIME types/extensions and reject executable-like original names.
 *
 * @param {import('express').Request} req - Authenticated request (unused except via multer).
 * @param {Express.Multer.File} file - Incoming file metadata (`mimetype`, `originalname`).
 * @param {import('multer').FileFilterCallback} cb - `cb(null, true)` to accept; `cb(Error, false)` to reject.
 * @returns {void}
 */
const fileFilter = (req, file, cb) => {
  if (!ALLOWED_MIME_TYPES.includes(file.mimetype)) {
    return cb(new Error('Only image files are allowed (JPG, PNG, GIF, WebP)'), false)
  }
  if (!ALLOWED_EXTENSIONS.includes(path.extname(file.originalname).toLowerCase())) {
    return cb(new Error('Invalid file extension'), false)
  }
  if (SUSPICIOUS_NAME.test(file.originalname)) {
    return cb(new Error('Invalid filename'), false)
  }
  cb(null, true)
}

const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: MAX_AVATAR_BYTES, // the client uploads a 300x300 crop
    files: 1, // Only one file at a time
  },
})

/**
 * Translate multer size/count errors and filter `Error` messages into 400 JSON.
 *
 * @param {Error} error - MulterError or filter Error from the previous middleware.
 * @param {import('express').Request} req - Unused; signature required for Express error middleware.
 * @param {import('express').Response} res - 400 JSON for known upload failures.
 * @param {import('express').NextFunction} next - Forwards unknown errors to the global handler.
 * @returns {void}
 */
export const handleUploadError = (error, req, res, next) => {
  if (error instanceof multer.MulterError) {
    if (error.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({
        success: false,
        message: 'File size too large. Maximum 2MB allowed.',
      })
    }
    if (error.code === 'LIMIT_FILE_COUNT') {
      return res.status(400).json({
        success: false,
        message: 'Too many files. Only one file allowed.',
      })
    }
  }

  if (error.message) {
    return res.status(400).json({
      success: false,
      message: error.message,
    })
  }

  next(error)
}

export default upload
