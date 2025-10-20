import multer from 'multer'
import path from 'path'
import fs from 'fs'
import crypto from 'crypto'

// Ensure uploads directory exists
const uploadsDir = path.join(process.cwd(), 'uploads', 'profiles')
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true })
}

// Configure multer for profile picture uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadsDir)
  },
  filename: (req, file, cb) => {
    // Generate cryptographically secure filename
    const randomBytes = crypto.randomBytes(16).toString('hex')
    const timestamp = Date.now()
    const ext = path.extname(file.originalname).toLowerCase()

    // Ensure extension is safe
    const safeExt = ext.match(/^\.(jpg|jpeg|png|gif|webp)$/) ? ext : '.jpg'

    cb(null, `profile-${req.user._id}-${timestamp}-${randomBytes}${safeExt}`)
  },
})

// Enhanced file filter with security checks
const fileFilter = (req, file, cb) => {
  const allowedMimeTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp']

  // Check MIME type
  if (!allowedMimeTypes.includes(file.mimetype)) {
    return cb(new Error('Only image files are allowed (JPG, PNG, GIF, WebP)'), false)
  }

  // Check file extension
  const ext = path.extname(file.originalname).toLowerCase()
  const allowedExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.webp']

  if (!allowedExtensions.includes(ext)) {
    return cb(new Error('Invalid file extension'), false)
  }

  // Check filename for suspicious patterns
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

// Error handling middleware for multer
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
