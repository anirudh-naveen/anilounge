/**
 * Security event logging (stdout, plus daily files when SECURITY_LOG_DIR is set) and
 * request-body monitors.
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
  UNAUTHORIZED_ACCESS: 'UNAUTHORIZED_ACCESS',
  ACCOUNT_DELETED: 'ACCOUNT_DELETED',
}

const HIGH_SEVERITY = new Set([
  SECURITY_EVENTS.ACCOUNT_LOCKED,
  SECURITY_EVENTS.SUSPICIOUS_ACTIVITY,
  SECURITY_EVENTS.UNAUTHORIZED_ACCESS,
])
const MEDIUM_SEVERITY = new Set([SECURITY_EVENTS.LOGIN_FAILED, SECURITY_EVENTS.ACCOUNT_DELETED])

/** Script and SQL shapes worth logging (never blocked here; see antiBot.js). */
const SUSPICIOUS_INPUT = [
  /<script/i,
  /javascript:/i,
  /on\w+\s*=/i,
  /union\s+select/i,
  /drop\s+table/i,
  /insert\s+into/i,
  /delete\s+from/i,
  /update\s+set/i,
]

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
  if (HIGH_SEVERITY.has(event)) return 'HIGH'
  if (MEDIUM_SEVERITY.has(event)) return 'MEDIUM'
  return 'LOW'
}

/** Open append stream for the current day's file, when file logging is on. */
let logStream = null
let logStreamDay = null

/**
 * Write one security event: a JSON line on stdout (what Railway keeps), plus a daily file
 * under SECURITY_LOG_DIR when that is set. Never blocks the request: the old
 * appendFileSync ran on every 4xx, including each expired-token 401, and a container
 * filesystem is wiped on redeploy anyway.
 *
 * @param {object} logEntry - Output of `createSecurityLogEntry`.
 * @returns {void}
 */
const writeSecurityLog = (logEntry) => {
  try {
    const line = JSON.stringify(logEntry)
    console.log(`SECURITY [${logEntry.severity}] ${line}`)

    const dir = process.env.SECURITY_LOG_DIR
    if (!dir) return
    const day = logEntry.timestamp.slice(0, 10)
    if (!logStream || logStreamDay !== day) {
      logStream?.end()
      fs.mkdirSync(dir, { recursive: true })
      logStream = fs.createWriteStream(path.join(dir, `security-${day}.log`), { flags: 'a' })
      logStream.on('error', (error) => console.error('Security log file error:', error.message))
      logStreamDay = day
    }
    logStream.write(line + '\n')
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
 * Record a user permanently deleting their own account.
 *
 * @param {string} userId - Deleted user's id.
 * @param {string} ip - Client address.
 * @param {string} userAgent - Request User-Agent.
 * @returns {void}
 */
export const logAccountDeletion = (userId, ip, userAgent) => {
  logSecurityEvent(SECURITY_EVENTS.ACCOUNT_DELETED, { userId, ip, userAgent })
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
 * Scan JSON body and query for script/SQL-ish patterns and log without blocking.
 *
 * @param {import('express').Request} req - Inspects `body` and `query`.
 * @param {import('express').Response} res - Unused; never sends a response.
 * @param {import('express').NextFunction} next - Always continues after scanning.
 * @returns {void}
 */
export const securityMonitor = (req, res, next) => {
  const scan = (value, label, key) => {
    if (!value) return
    const text = JSON.stringify(value)
    const pattern = SUSPICIOUS_INPUT.find((candidate) => candidate.test(text))
    if (!pattern) return
    logSuspiciousActivity(`Suspicious ${label} detected`, {
      pattern: pattern.toString(),
      [key]: text,
      ip: req.ip,
      userAgent: req.get('User-Agent'),
      userId: req.user?._id,
    })
  }
  scan(req.body, 'input', 'input')
  scan(req.query, 'query', 'query')
  next()
}
