import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import rateLimit from 'express-rate-limit'
import dotenv from 'dotenv'
import connectDB from '../config/database.js'
import apiRoutes from './routes/api.js'
import adminRoutes from './routes/admin.js'
import { sanitizeHtmlInput, sanitizeXSS } from './middleware/security.js'
import { securityLogger, securityMonitor } from './middleware/securityLogger.js'
import {
  antiBotProtection,
  progressiveSlowdown,
  databaseProtection,
  apiProtection,
} from './middleware/antiBot.js'
import { checkIPBan } from './middleware/ipBan.js'

// Load environment variables
dotenv.config()

const app = express()
const PORT = process.env.PORT || 5000

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'OK',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: process.env.NODE_ENV || 'development',
    version: '1.0.0-beta',
  })
})

// Basic API status endpoint
app.get('/api/status', (req, res) => {
  res.json({
    success: true,
    message: 'Find Animation API is running',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development',
  })
})

// Connect to MongoDB
connectDB()

// Trust proxy for accurate IP addresses (important for rate limiting)
app.set('trust proxy', 1)

// Enhanced security middleware
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        scriptSrc: ["'self'"],
        imgSrc: ["'self'", 'data:', 'blob:'],
        connectSrc: ["'self'"],
        fontSrc: ["'self'"],
        objectSrc: ["'none'"],
        mediaSrc: ["'self'"],
        frameSrc: ["'none'"],
      },
    },
    crossOriginEmbedderPolicy: false,
    hsts: {
      maxAge: 31536000,
      includeSubDomains: true,
      preload: true,
    },
  }),
)

// Enhanced rate limiting with different limits for different endpoints
const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  message: {
    success: false,
    message: 'Too many requests from this IP, please try again later.',
  },
  standardHeaders: true,
  legacyHeaders: false,
})

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // limit each IP to 5 auth requests per windowMs
  message: {
    success: false,
    message: 'Too many authentication attempts, please try again later.',
  },
  standardHeaders: true,
  legacyHeaders: false,
})

const uploadLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 10, // limit each IP to 10 uploads per hour
  message: {
    success: false,
    message: 'Too many upload attempts, please try again later.',
  },
  standardHeaders: true,
  legacyHeaders: false,
})

// Apply general rate limiting
app.use(generalLimiter)

// CORS configuration with enhanced security
app.use(
  cors({
    origin: (origin, callback) => {
      const allowedOrigins =
        process.env.NODE_ENV === 'production'
          ? [
              'https://your-frontend-domain.com',
              'https://find-animation.vercel.app',
              'https://find-animation.netlify.app',
              'https://find-animation.herokuapp.com',
              // Allow all Vercel domains
              /^https:\/\/.*\.vercel\.app$/,
            ]
          : [
              'http://localhost:3000',
              'http://localhost:5173',
              'http://localhost:5174',
              'http://localhost:5175',
              'http://localhost:5176',
              'http://127.0.0.1:5173',
              'http://127.0.0.1:5174',
              'http://127.0.0.1:5175',
              'http://127.0.0.1:5176',
              'file://', // Allow local file:// requests for testing
            ]

      // Allow requests with no origin (mobile apps, Postman, etc.) or file:// origin
      if (!origin || origin.startsWith('file://')) return callback(null, true)

      // Check if origin matches any allowed origin (including regex patterns)
      const isAllowed = allowedOrigins.some((allowedOrigin) => {
        if (typeof allowedOrigin === 'string') {
          return allowedOrigin === origin
        } else if (allowedOrigin instanceof RegExp) {
          return allowedOrigin.test(origin)
        }
        return false
      })

      if (isAllowed) {
        callback(null, true)
      } else {
        callback(new Error('Not allowed by CORS'))
      }
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
    maxAge: 86400, // 24 hours
  }),
)

// Body parsing middleware with size limits
app.use(
  express.json({
    limit: '10mb',
    verify: (req, res, buf) => {
      // Additional JSON parsing security
      try {
        JSON.parse(buf.toString())
      } catch {
        throw new Error('Invalid JSON')
      }
    },
  }),
)
app.use(express.urlencoded({ extended: true, limit: '10mb' }))

// Input sanitization middleware
app.use(sanitizeHtmlInput)
app.use(sanitizeXSS)

// Security monitoring and logging
app.use(securityMonitor)
app.use(securityLogger)

// IP ban checking (must be early in the chain)
app.use(checkIPBan)

// Anti-bot and database protection
app.use(antiBotProtection)
app.use(databaseProtection)
app.use(progressiveSlowdown)

// Serve static files from uploads directory with enhanced security
app.use(
  '/uploads',
  (req, res, next) => {
    // Security headers for uploaded files
    res.header('X-Content-Type-Options', 'nosniff')
    res.header('X-Frame-Options', 'DENY')
    res.header('X-XSS-Protection', '1; mode=block')
    res.header('Referrer-Policy', 'strict-origin-when-cross-origin')

    // CORS headers
    res.header('Access-Control-Allow-Origin', '*')
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS')
    res.header(
      'Access-Control-Allow-Headers',
      'Origin, X-Requested-With, Content-Type, Accept, Authorization',
    )
    res.header('Cross-Origin-Resource-Policy', 'cross-origin')
    next()
  },
  express.static('uploads'),
)

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    success: true,
    message: 'Find Animation API is running',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV,
    version: process.env.npm_package_version || '1.0.0',
  })
})

// Apply specific rate limiting to auth routes
app.use('/api/auth', authLimiter)

// Apply upload rate limiting to upload routes
app.use('/api/auth/upload-profile-picture', uploadLimiter)

// API routes with protection
app.use('/api', apiProtection, apiRoutes)

// Admin routes (protected)
app.use('/admin', apiProtection, adminRoutes)

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({
    success: false,
    message: 'API endpoint not found',
  })
})

// Global error handler
app.use((err, req, res) => {
  console.error('Global error handler:', err)

  // Mongoose validation error
  if (err.name === 'ValidationError') {
    const errors = Object.values(err.errors).map((e) => e.message)
    return res.status(400).json({
      success: false,
      message: 'Validation error',
      errors,
    })
  }

  // Mongoose duplicate key error
  if (err.code === 11000) {
    const field = Object.keys(err.keyValue)[0]
    return res.status(400).json({
      success: false,
      message: `${field} already exists`,
    })
  }

  // JWT errors
  if (err.name === 'JsonWebTokenError') {
    return res.status(401).json({
      success: false,
      message: 'Invalid token',
    })
  }

  if (err.name === 'TokenExpiredError') {
    return res.status(401).json({
      success: false,
      message: 'Token expired',
    })
  }

  // Default error
  res.status(err.status || 500).json({
    success: false,
    message: err.message || 'Internal server error',
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack }),
  })
})

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Find Animation API server running on port ${PORT}`)
  console.log(`📊 Environment: ${process.env.NODE_ENV}`)
  console.log(`🔗 Health check: http://localhost:${PORT}/health`)
})

export default app
