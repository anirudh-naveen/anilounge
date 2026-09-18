/**
 * Express entry point for the Find Animation API.
 *
 * Layer: HTTP server. Loads env, connects PostgreSQL, applies security/rate-limit
 * middleware, mounts `/api` and `/admin`, and starts the content-sync scheduler.
 */

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
import {
  startContentSyncScheduler,
  getContentSyncStatus,
} from './services/contentSyncScheduler.js'
import {
  extraFrontendOriginsFromEnv,
  isAllowedCorsOrigin,
} from './utils/allowedFrontends.js'

dotenv.config()

// Production exits without JWT_SECRET and DATABASE_URL; development only warns so local work can start.
if (process.env.NODE_ENV === 'production') {
  const requiredEnvVars = ['JWT_SECRET', 'DATABASE_URL']
  const missingVars = requiredEnvVars.filter((varName) => !process.env[varName])

  if (missingVars.length > 0) {
    console.error('Missing required environment variables:', missingVars.join(', '))
    console.error('Please set these variables in your .env file or environment')
    process.exit(1)
  }
} else {
  const requiredEnvVars = ['JWT_SECRET', 'DATABASE_URL']
  const missingVars = requiredEnvVars.filter((varName) => !process.env[varName])
  if (missingVars.length > 0) {
    console.warn('Missing environment variables (development mode):', missingVars.join(', '))
    console.warn('Server will start but authentication features may not work')
  }
}

const app = express()
const PORT = process.env.PORT || 5001

/** Liveness probe: process health plus content-sync scheduler status. */
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'OK',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: process.env.NODE_ENV || 'development',
    version: '1.0.0-beta',
    contentSync: getContentSyncStatus(),
  })
})

/** Lightweight readiness payload (no sync details). */
app.get('/api/status', (req, res) => {
  res.json({
    success: true,
    message: 'Find Animation API is running',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development',
  })
})

// connectDB is non-blocking in development; production exits if the promise rejects.
connectDB().catch((error) => {
  if (process.env.NODE_ENV === 'production') {
    console.error('Failed to connect to database. Exiting...', error)
    process.exit(1)
  } else {
    console.warn('Database connection failed, but continuing in development mode', error)
  }
})

// Trust the first proxy hop so req.ip (and rate limits) reflect the client, not the proxy.
app.set('trust proxy', 1)

// Helmet: CSP and CORP are off so the SPA on a different origin can call the API.
app.use(
  helmet({
    contentSecurityPolicy: false, // Disabled to allow cross-origin API requests
    crossOriginEmbedderPolicy: false,
    crossOriginResourcePolicy: false, // Allow cross-origin resources
    hsts: {
      maxAge: 31536000,
      includeSubDomains: true,
      preload: true,
    },
  }),
)

/** 15-minute window: 100 requests per IP for all routes. */
const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // 100 requests per IP per window
  message: {
    success: false,
    message: 'Too many requests from this IP, please try again later.',
  },
  standardHeaders: true,
  legacyHeaders: false,
})

/** Auth paths: 5 attempts per IP per 15 minutes to slow credential stuffing. */
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // 5 auth requests per IP per window
  message: {
    success: false,
    message: 'Too many authentication attempts, please try again later.',
  },
  standardHeaders: true,
  legacyHeaders: false,
})

/** Profile-picture uploads: 10 per IP per hour. */
const uploadLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 10, // 10 uploads per IP per hour
  message: {
    success: false,
    message: 'Too many upload attempts, please try again later.',
  },
  standardHeaders: true,
  legacyHeaders: false,
})

app.use(generalLimiter)

/**
 * CORS allowlist: AniLounge, Vercel/Netlify, local Vite ports,
 * `FRONTEND_URL` / `ALLOWED_ORIGINS`, and `*.vercel.app` previews.
 * Requests with no Origin (curl, mobile) are allowed.
 */
const extraOrigins = extraFrontendOriginsFromEnv()

const corsOptions = {
  origin: function (origin, callback) {
    if (isAllowedCorsOrigin(origin, extraOrigins)) {
      callback(null, true)
    } else {
      console.log('CORS blocked origin:', origin)
      callback(null, false)
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept'],
  exposedHeaders: ['Content-Length', 'X-Request-Id'],
  maxAge: 86400, // 24 hours
  optionsSuccessStatus: 200, // Some legacy browsers choke on 204
}

app.use(cors(corsOptions))

/** JSON/urlencoded bodies capped at 10mb; JSON is re-parsed so malformed payloads fail closed. */
app.use(
  express.json({
    limit: '10mb',
    verify: (req, res, buf) => {
      try {
        JSON.parse(buf.toString())
      } catch {
        throw new Error('Invalid JSON')
      }
    },
  }),
)
app.use(express.urlencoded({ extended: true, limit: '10mb' }))

/** Strip HTML tags and XSS payloads from inbound body/query before controllers run. */
app.use(sanitizeHtmlInput)
app.use(sanitizeXSS)

/** Security monitor/logger: swallow their own errors so a logging failure cannot 500 the request. */
app.use((req, res, next) => {
  try {
    if (securityMonitor) {
      securityMonitor(req, res, next)
    } else {
      next()
    }
  } catch (error) {
    console.error('Security monitor error:', error)
    next() // Continue on error, but log it
  }
})

app.use((req, res, next) => {
  try {
    if (securityLogger) {
      securityLogger(req, res, next)
    } else {
      next()
    }
  } catch (error) {
    console.error('Security logger error:', error)
    next()
  }
})

/** IP ban runs early. Development continues on error; production fails closed with 500. */
app.use(async (req, res, next) => {
  try {
    await checkIPBan(req, res, next)
  } catch (error) {
    console.error('IP ban check error:', error)
    // In development, allow requests through
    if (process.env.NODE_ENV === 'development') {
      return next()
    }
    // In production, fail closed for security
    if (!res.headersSent) {
      return res.status(500).json({
        success: false,
        message: 'Security check failed. Please try again later.',
      })
    }
  }
})

/** Bot UA filter, NoSQL-injection scan, then progressive delay after 50 requests / 15 min. */
app.use(antiBotProtection)
app.use(databaseProtection)
app.use(progressiveSlowdown)

/** Static `/uploads`: nosniff/DENY frame plus open CORS so poster/profile images load cross-origin. */
app.use(
  '/uploads',
  (req, res, next) => {
    res.header('X-Content-Type-Options', 'nosniff')
    res.header('X-Frame-Options', 'DENY')
    res.header('X-XSS-Protection', '1; mode=block')
    res.header('Referrer-Policy', 'strict-origin-when-cross-origin')

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

/** Duplicate health route (legacy JSON shape; does not include contentSync). */
app.get('/health', (req, res) => {
  res.json({
    success: true,
    message: 'Find Animation API is running',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV,
    version: process.env.npm_package_version || '1.0.0',
  })
})

/** Tighter limits on credential and upload paths (stacked on the general limiter). */
app.use('/api/auth', authLimiter)
app.use('/api/auth/upload-profile-picture', uploadLimiter)

/** Stamp every `/api` response with the current API version. */
app.use('/api', (req, res, next) => {
  res.setHeader('X-API-Version', '1.0.0-beta')
  next()
})

/** Public API and admin mounts, both behind apiProtection (referer/header checks). */
app.use('/api', apiProtection, apiRoutes)
app.use('/admin', apiProtection, adminRoutes)

/** Catch-all 404 for unmatched methods and paths. */
app.use('*', (req, res) => {
  res.status(404).json({
    success: false,
    message: 'API endpoint not found',
  })
})

/**
 * Express error middleware (four args). Maps Mongoose validation/duplicate-key
 * and JWT errors to 400/401; otherwise 500. Stack is included only in development.
 */
app.use((err, req, res, next) => {
  void next // Express requires 4 args to treat this as error middleware
  console.error('Global error handler:', err)

  if (err.name === 'ValidationError') {
    const errors = Object.values(err.errors).map((e) => e.message)
    return res.status(400).json({
      success: false,
      message: 'Validation error',
      errors,
    })
  }

  if (err.code === 11000) {
    const field = Object.keys(err.keyValue)[0]
    return res.status(400).json({
      success: false,
      message: `${field} already exists`,
    })
  }

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

  if (!res.headersSent) {
    res.status(err.status || 500).json({
      success: false,
      message: err.message || 'Internal server error',
      ...(process.env.NODE_ENV === 'development' && { stack: err.stack }),
    })
  }
})

// Bind PORT; EADDRINUSE exits so a stale process is obvious. Starts the content-sync scheduler on listen.
app
  .listen(PORT, () => {
    console.log(`Find Animation API server running on port ${PORT}`)
    console.log(`Environment: ${process.env.NODE_ENV || 'development'}`)
    console.log(`Health check: http://localhost:${PORT}/health`)
    startContentSyncScheduler()
  })
  .on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      console.error(`Port ${PORT} is already in use.`)
      console.error(`   Try: lsof -ti:${PORT} | xargs kill -9`)
      console.error(`   Or change the PORT in your .env file`)
      process.exit(1)
    } else {
      console.error('Server error:', err)
      process.exit(1)
    }
  })

export default app
