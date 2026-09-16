/**
 * Security event logging to daily files under `logs/` plus request-body monitors.
 *
 * Layer: middleware. `securityLogger` / `securityMonitor` wrap every request;
 * the `log*` helpers are called from auth and upload controllers.
 */

import fs from 'fs'
import path from 'path'

const SECURITY_EVENTS = {
  LOGIN_FAILED: 'LOGIN_FAILED',
  LOGIN_SUCCESS: 'LOGIN_SUCCESS',
  ACCOUNT_LOCKED: 'ACCOUNT_LOCKED',
  SUSPICIOUS_ACTIVITY: 'SUSPICIOUS_ACTIVITY',
  FILE_UPLOAD: 'FILE_UPLOAD',
  RATE_LIMIT_EXCEEDED: 'RATE_LIMIT_EXCEEDED',
  INVALID_TOKEN: 'INVALID_TOKEN',
  UNAUTHORIZED_ACCESS: 'UNAUTHORIZED_ACCESS',
  SQL_INJECTION_ATTEMPT: 'SQL_INJECTION_ATTEMPT',
  XSS_ATTEMPT: 'XSS_ATTEMPT',
}

/**
 * Build a timestamped log object with a severity derived from `event`.
 *
 * @param {string} event - One of `SECURITY_EVENTS`.
 * @param {object} details - Arbitrary fields stored beside the event.
 * @returns {{ timestamp: string, event: string, details: object, severity: string }}
 */
const createSecurityLogEntry = (event, details) => {
  return {
    timestamp: new Date().toISOString(),
    event,
    details,
    severity: getSeverityLevel(event),
  }
}

/**
 * Map an event type to HIGH / MEDIUM / LOW for console and file logs.
 *
 * @param {string} event - One of `SECURITY_EVENTS`.
 * @returns {'HIGH'|'MEDIUM'|'LOW'}
 */
const getSeverityLevel = (event) => {
  const highSeverity = [
    SECURITY_EVENTS.ACCOUNT_LOCKED,
    SECURITY_EVENTS.SUSPICIOUS_ACTIVITY,
    SECURITY_EVENTS.SQL_INJECTION_ATTEMPT,
    SECURITY_EVENTS.XSS_ATTEMPT,
    SECURITY_EVENTS.UNAUTHORIZED_ACCESS,
  ]

  const mediumSeverity = [
    SECURITY_EVENTS.LOGIN_FAILED,
    SECURITY_EVENTS.RATE_LIMIT_EXCEEDED,
    SECURITY_EVENTS.INVALID_TOKEN,
  ]

  if (highSeverity.includes(event)) return 'HIGH'
  if (mediumSeverity.includes(event)) return 'MEDIUM'
  return 'LOW'
}

/**
 * Append one JSON line to `logs/security-YYYY-MM-DD.log` and echo to the console.
 *
 * @param {object} logEntry - Output of `createSecurityLogEntry`.
 * @returns {void}
 */
const writeSecurityLog = (logEntry) => {
  try {
    const logDir = path.join(process.cwd(), 'logs')
    if (!fs.existsSync(logDir)) {
      fs.mkdirSync(logDir, { recursive: true })
    }

    const logFile = path.join(logDir, `security-${new Date().toISOString().split('T')[0]}.log`)
    const logLine = JSON.stringify(logEntry) + '\n'

    fs.appendFileSync(logFile, logLine)

    console.log(`🔒 SECURITY [${logEntry.severity}]: ${logEntry.event}`, logEntry.details)
  } catch (error) {
    console.error('Failed to write security log:', error)
  }
}

/**
 * Wrap `res.send` so 4xx/5xx responses are written as UNAUTHORIZED_ACCESS (401) or SUSPICIOUS_ACTIVITY.
 *
 * @param {import('express').Request} req - Method, url, ip, User-Agent, and optional `req.user`.
 * @param {import('express').Response} res - `send` is patched for the remainder of the request.
 * @param {import('express').NextFunction} next - Always continues after installing the wrapper.
 * @returns {void}
 */
export const securityLogger = (req, res, next) => {
  const originalSend = res.send

  res.send = function (data) {
    if (res.statusCode >= 400) {
      const logEntry = createSecurityLogEntry(
        res.statusCode === 401
          ? SECURITY_EVENTS.UNAUTHORIZED_ACCESS
          : SECURITY_EVENTS.SUSPICIOUS_ACTIVITY,
        {
          method: req.method,
          url: req.url,
          statusCode: res.statusCode,
          ip: req.ip,
          userAgent: req.get('User-Agent'),
          userId: req.user?._id,
        },
      )
      writeSecurityLog(logEntry)
    }

    return originalSend.call(this, data)
  }

  next()
}

/**
 * Write an arbitrary security event through the shared file/console pipeline.
 *
 * @param {string} event - One of `SECURITY_EVENTS`.
 * @param {object} details - Fields stored on the log line.
 * @returns {void}
 */
export const logSecurityEvent = (event, details) => {
  const logEntry = createSecurityLogEntry(event, details)
  writeSecurityLog(logEntry)
}

/**
 * Record a login success or failure against `LOGIN_SUCCESS` / `LOGIN_FAILED`.
 *
 * @param {string} email - Normalized email that was attempted.
 * @param {boolean} success - True for a successful password check.
 * @param {string} ip - Client address.
 * @param {string} userAgent - Request User-Agent.
 * @param {string|null} [userId=null] - User ObjectId when known.
 * @returns {void}
 */
export const logLoginAttempt = (email, success, ip, userAgent, userId = null) => {
  const event = success ? SECURITY_EVENTS.LOGIN_SUCCESS : SECURITY_EVENTS.LOGIN_FAILED
  logSecurityEvent(event, {
    email,
    success,
    ip,
    userAgent,
    userId,
  })
}

/**
 * Record an account lockout after repeated failed logins.
 *
 * @param {string} email - Locked account email.
 * @param {string} ip - Client address.
 * @param {string} userAgent - Request User-Agent.
 * @param {string} userId - User ObjectId.
 * @returns {void}
 */
export const logAccountLockout = (email, ip, userAgent, userId) => {
  logSecurityEvent(SECURITY_EVENTS.ACCOUNT_LOCKED, {
    email,
    ip,
    userAgent,
    userId,
    lockoutTime: new Date().toISOString(),
  })
}

/**
 * Record a profile-picture upload outcome.
 *
 * @param {string} filename - Stored or attempted filename.
 * @param {string} userId - Uploading user ObjectId.
 * @param {string} ip - Client address.
 * @param {boolean} success - Whether the file was saved.
 * @param {Error|null} [error=null] - Failure cause; `message` is logged when present.
 * @returns {void}
 */
export const logFileUpload = (filename, userId, ip, success, error = null) => {
  logSecurityEvent(SECURITY_EVENTS.FILE_UPLOAD, {
    filename,
    userId,
    ip,
    success,
    error: error?.message,
    uploadTime: new Date().toISOString(),
  })
}

/**
 * Record that an IP exceeded a rate limit on `endpoint`.
 *
 * @param {string} ip - Client address.
 * @param {string} endpoint - Path or route that was limited.
 * @param {string} userAgent - Request User-Agent.
 * @returns {void}
 */
export const logRateLimitExceeded = (ip, endpoint, userAgent) => {
  logSecurityEvent(SECURITY_EVENTS.RATE_LIMIT_EXCEEDED, {
    ip,
    endpoint,
    userAgent,
    timestamp: new Date().toISOString(),
  })
}

/**
 * Record a rejected or malformed token.
 *
 * @param {string} ip - Client address.
 * @param {string} userAgent - Request User-Agent.
 * @param {string} [tokenType='access'] - `access` or `refresh`.
 * @returns {void}
 */
export const logInvalidToken = (ip, userAgent, tokenType = 'access') => {
  logSecurityEvent(SECURITY_EVENTS.INVALID_TOKEN, {
    ip,
    userAgent,
    tokenType,
    timestamp: new Date().toISOString(),
  })
}

/**
 * Record a free-form suspicious-activity event.
 *
 * @param {string} activity - Short label for the activity.
 * @param {object} details - Extra fields merged onto the log line.
 * @returns {void}
 */
export const logSuspiciousActivity = (activity, details) => {
  logSecurityEvent(SECURITY_EVENTS.SUSPICIOUS_ACTIVITY, {
    activity,
    ...details,
    timestamp: new Date().toISOString(),
  })
}

/**
 * If sanitization changed a field, log it as an XSS_ATTEMPT.
 *
 * @param {string} input - Original value.
 * @param {string} sanitizedInput - Value after HTML/XSS filters.
 * @param {string} field - Field name for the log.
 * @returns {void}
 */
export const logInputValidation = (input, sanitizedInput, field) => {
  if (input !== sanitizedInput) {
    logSecurityEvent(SECURITY_EVENTS.XSS_ATTEMPT, {
      field,
      originalInput: input,
      sanitizedInput,
      timestamp: new Date().toISOString(),
    })
  }
}

/**
 * Scan JSON body and query for script/SQL-ish patterns and log without blocking.
 *
 * @param {import('express').Request} req - Inspects `body` and `query`.
 * @param {import('express').Response} res - Unused; never sends a response.
 * @param {import('express').NextFunction} next - Always continues after scanning.
 * @returns {void}
 */
export const securityMonitor = (req, res, next) => {
  const suspiciousPatterns = [
    /<script/i,
    /javascript:/i,
    /on\w+\s*=/i,
    /union\s+select/i,
    /drop\s+table/i,
    /insert\s+into/i,
    /delete\s+from/i,
    /update\s+set/i,
  ]

  if (req.body) {
    const bodyString = JSON.stringify(req.body)
    for (const pattern of suspiciousPatterns) {
      if (pattern.test(bodyString)) {
        logSuspiciousActivity('Suspicious input detected', {
          pattern: pattern.toString(),
          input: bodyString,
          ip: req.ip,
          userAgent: req.get('User-Agent'),
          userId: req.user?._id,
        })
        break
      }
    }
  }

  if (req.query) {
    const queryString = JSON.stringify(req.query)
    for (const pattern of suspiciousPatterns) {
      if (pattern.test(queryString)) {
        logSuspiciousActivity('Suspicious query detected', {
          pattern: pattern.toString(),
          query: queryString,
          ip: req.ip,
          userAgent: req.get('User-Agent'),
          userId: req.user?._id,
        })
        break
      }
    }
  }

  next()
}

export { SECURITY_EVENTS }
export default {
  securityLogger,
  logSecurityEvent,
  logLoginAttempt,
  logAccountLockout,
  logFileUpload,
  logRateLimitExceeded,
  logInvalidToken,
  logSuspiciousActivity,
  logInputValidation,
  securityMonitor,
}
