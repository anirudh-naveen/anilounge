/**
 * Multer disk storage for profile pictures under `uploads/profiles`.
 *
 * Layer: middleware. Default export is the configured `upload` instance;
 * `handleUploadError` maps multer failures to 400 JSON.
 */

import multer from 'multer'
import path from 'path'
import fs from 'fs'
import crypto from 'crypto'

const uploadsDir = path.join(process.cwd(), 'uploads', 'profiles')
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true })
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadsDir)
  },
  filename: (req, file, cb) => {
    const randomBytes = crypto.randomBytes(16).toString('hex')
    const timestamp = Date.now()
    const ext = path.extname(file.originalname).toLowerCase()

    // Non-image extensions are forced to .jpg so the stored path cannot carry an executable suffix.
    const safeExt = ext.match(/^\.(jpg|jpeg|png|gif|webp)$/) ? ext : '.jpg'

    const userId = String(req.user._id).replace(/[^a-f0-9]/gi, '')

    cb(null, `profile-${userId}-${timestamp}-${randomBytes}${safeExt}`)
  },
})

/**
 * Accept only image MIME types/extensions and reject executable-like original names.
 *
 * @param {import('express').Request} req - Authenticated request (unused except via multer).
 * @param {Express.Multer.File} file - Incoming file metadata (`mimetype`, `originalname`).
 * @param {import('multer').FileFilterCallback} cb - `cb(null, true)` to accept; `cb(Error, false)` to reject.
 * @returns {void}
 */
const fileFilter = (req, file, cb) => {
  const allowedMimeTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp']

  if (!allowedMimeTypes.includes(file.mimetype)) {
    return cb(new Error('Only image files are allowed (JPG, PNG, GIF, WebP)'), false)
  }

  const ext = path.extname(file.originalname).toLowerCase()
  const allowedExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.webp']

  if (!allowedExtensions.includes(ext)) {
    return cb(new Error('Invalid file extension'), false)
  }

  const suspiciousPatterns = /[<>:"/\\|?*]|\.(exe|bat|cmd|scr|pif|vbs|js|jar|php|asp|aspx)$/i
  if (suspiciousPatterns.test(file.originalname)) {
    return cb(new Error('Invalid filename'), false)
  }

  cb(null, true)
}

const upload = multer({
  storage: storage,
  fileFilter: fileFilter,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB limit
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
        message: 'File size too large. Maximum 5MB allowed.',
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
