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
import { connectPostgres } from '../config/postgres.js'
import apiRoutes from './routes/api.js'
import adminRoutes from './routes/admin.js'
import emailRoutes from './routes/email.js'
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
  getCatalogMaintenanceStatus,
  startCatalogMaintenance,
} from './services/catalogMaintenance.js'
import {
  extraFrontendOriginsFromEnv,
  isAllowedCorsOrigin,
} from './utils/allowedFrontends.js'
import { authLimiter } from './middleware/authRateLimit.js'
import { rateLimitKey, rateLimitMax, trustProxySetting } from './middleware/rateLimitKey.js'
import { rateLimitStore } from './middleware/pgRateLimitStore.js'
import { ensureDemoAccount } from './services/demoAccount.js'
import { startInactiveAccountScheduler } from './services/inactiveAccountService.js'
import { startUnverifiedAccountScheduler } from './services/unverifiedAccountService.js'
import { startFriendRequestCleanupScheduler } from './services/friendService.js'
import { startConnectionSync } from './services/connectionSync.js'
import { startSessionCleanupScheduler } from './services/sessionService.js'
import { startHotScoreScheduler } from './services/forumService.js'
import { startAiUsageCleanupScheduler } from './services/aiUsageService.js'
import { emailProvider } from './services/emailService.js'

dotenv.config()

// Production exits without JWT_SECRET and DATABASE_URL; development only warns so local work can start.
const missingVars = ['JWT_SECRET', 'DATABASE_URL'].filter((varName) => !process.env[varName])
if (missingVars.length > 0) {
  if (process.env.NODE_ENV === 'production') {
    console.error('Missing required environment variables:', missingVars.join(', '))
    console.error('Please set these variables in your .env file or environment')
    process.exit(1)
  }
  console.warn('Missing environment variables (development mode):', missingVars.join(', '))
  console.warn('Server will start but authentication features may not work')
}

/** Short HMAC secrets make access tokens forgeable by brute force. */
if (process.env.JWT_SECRET && process.env.JWT_SECRET.length < 32) {
  if (process.env.NODE_ENV === 'production') {
    console.error('JWT_SECRET must be at least 32 characters in production.')
    process.exit(1)
  }
  console.warn('JWT_SECRET is shorter than 32 characters; use a long random value.')
}

const app = express()
const PORT = process.env.PORT || 5001

/** Liveness probe: process health plus content-sync and catalog-maintenance status. */
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'OK',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: process.env.NODE_ENV || 'development',
    version: '1.0.0-beta',
    contentSync: getContentSyncStatus(),
    catalogMaintenance: getCatalogMaintenanceStatus(),
  })
})

/**
 * Lightweight readiness payload (no sync details). `clientIp` is the address rate limits
 * and IP bans use for the caller: request this through the live site and it should be
 * your own IP. If it is a Vercel/Railway address instead, adjust TRUST_PROXY.
 */
app.get('/api/status', (req, res) => {
  res.json({
    success: true,
    message: 'Find Animation API is running',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development',
    clientIp: req.ip,
  })
})

// API requests should never run a statement for minutes; scripts keep no limit.
process.env.PG_STATEMENT_TIMEOUT_MS ??= '60000'

// Non-blocking: production exits on failure, development logs and keeps serving.
connectPostgres()

// Trust the proxy hops in front of the app so req.ip (and rate limits) reflect the
// client, not the proxy. TRUST_PROXY overrides the default of one hop.
app.set('trust proxy', trustProxySetting())

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

/**
 * 15-minute window for all routes, counted per account when signed in and per IP
 * otherwise (middleware/rateLimitKey.js). The old 100-per-IP cap was spent by one
 * person browsing for ~15 minutes, given the unread polls and several calls per page.
 */
const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: rateLimitMax,
  keyGenerator: rateLimitKey,
  // Versioned avatar images are immutable and edge-cached; a page of avatars shouldn't
  // spend the budget.
  skip: (req) => req.method === 'GET' && req.path.startsWith('/api/avatars/'),
  ...rateLimitStore('general'),
  message: {
    success: false,
    message: 'Too many requests from this IP, please try again later.',
  },
  standardHeaders: true,
  legacyHeaders: false,
})

/** Profile-picture uploads: 10 per IP per hour. */
const uploadLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 10, // 10 uploads per IP per hour
  ...rateLimitStore('upload'),
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

/** JSON/urlencoded bodies capped at 10mb; malformed JSON is a 400 (see the error handler). */
app.use(express.json({ limit: '10mb' }))
app.use(express.urlencoded({ extended: true, limit: '10mb' }))

/** Strip HTML tags and XSS payloads from inbound body/query before controllers run. */
app.use(sanitizeHtmlInput)
app.use(sanitizeXSS)

/** Security monitor/logger: swallow their own errors so a logging failure cannot 500 the request. */
app.use((req, res, next) => {
  try {
    securityMonitor(req, res, next)
  } catch (error) {
    console.error('Security monitor error:', error)
    next()
  }
})
app.use(securityLogger)

/** IP ban runs early; a failed lookup lets the request through (see checkIPBan). */
app.use(checkIPBan)

/**
 * Email links (announcement unsubscribe) skip the bot and referer checks: mail providers
 * POST one-click unsubscribes from their own servers. Links are HMAC-signed.
 */
app.use('/api/email', emailRoutes)

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
 * Express error middleware (four args). Malformed JSON is a 400, JWT errors a 401;
 * otherwise the error's status or 500. Stack is included only in development.
 */
app.use((err, req, res, next) => {
  void next // Express requires 4 args to treat this as error middleware

  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({ success: false, message: 'Invalid JSON' })
  }

  console.error('Global error handler:', err)

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

// Bind PORT; EADDRINUSE exits so a stale process is obvious. Starts the content-sync and
// catalog-maintenance schedulers
// and makes sure the README demo login exists and is unlocked.
app
  .listen(PORT, () => {
    console.log(`Find Animation API server running on port ${PORT}`)
    console.log(`Environment: ${process.env.NODE_ENV || 'development'}`)
    console.log(`Health check: http://localhost:${PORT}/health`)
    startContentSyncScheduler()
    startCatalogMaintenance()
    startInactiveAccountScheduler()
    startUnverifiedAccountScheduler()
    startFriendRequestCleanupScheduler()
    startConnectionSync()
    startSessionCleanupScheduler()
    startHotScoreScheduler()
    startAiUsageCleanupScheduler()
    console.log(`Email delivery: ${emailProvider()}`)
    ensureDemoAccount()
      .then((result) => {
        if (result !== 'ok') console.log(`Demo account ${result}`)
      })
      .catch((error) => console.error('Demo account check failed:', error.message))
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
