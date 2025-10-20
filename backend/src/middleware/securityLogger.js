import fs from 'fs'
import path from 'path'

// Security event types
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

// Security log entry structure
const createSecurityLogEntry = (event, details) => {
  return {
    timestamp: new Date().toISOString(),
    event,
    details,
    severity: getSeverityLevel(event),
  }
}

// Determine severity level based on event type
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

// Write security log to file
const writeSecurityLog = (logEntry) => {
  try {
    const logDir = path.join(process.cwd(), 'logs')
    if (!fs.existsSync(logDir)) {
      fs.mkdirSync(logDir, { recursive: true })
    }

    const logFile = path.join(logDir, `security-${new Date().toISOString().split('T')[0]}.log`)
    const logLine = JSON.stringify(logEntry) + '\n'

    fs.appendFileSync(logFile, logLine)

    // Also log to console for immediate visibility
    console.log(`🔒 SECURITY [${logEntry.severity}]: ${logEntry.event}`, logEntry.details)
  } catch (error) {
    console.error('Failed to write security log:', error)
  }
}

// Security logging middleware
export const securityLogger = (req, res, next) => {
  // Log all requests for monitoring
  const originalSend = res.send

  res.send = function (data) {
    // Log failed requests
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

// Specific security event loggers
export const logSecurityEvent = (event, details) => {
  const logEntry = createSecurityLogEntry(event, details)
  writeSecurityLog(logEntry)
}

// Login attempt logger
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

// Account lockout logger
export const logAccountLockout = (email, ip, userAgent, userId) => {
  logSecurityEvent(SECURITY_EVENTS.ACCOUNT_LOCKED, {
    email,
    ip,
    userAgent,
    userId,
    lockoutTime: new Date().toISOString(),
  })
}

// File upload logger
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

// Rate limit exceeded logger
export const logRateLimitExceeded = (ip, endpoint, userAgent) => {
  logSecurityEvent(SECURITY_EVENTS.RATE_LIMIT_EXCEEDED, {
    ip,
    endpoint,
    userAgent,
    timestamp: new Date().toISOString(),
  })
}

// Invalid token logger
export const logInvalidToken = (ip, userAgent, tokenType = 'access') => {
  logSecurityEvent(SECURITY_EVENTS.INVALID_TOKEN, {
    ip,
    userAgent,
    tokenType,
    timestamp: new Date().toISOString(),
  })
}

// Suspicious activity logger
export const logSuspiciousActivity = (activity, details) => {
  logSecurityEvent(SECURITY_EVENTS.SUSPICIOUS_ACTIVITY, {
    activity,
    ...details,
    timestamp: new Date().toISOString(),
  })
}

// Input validation logger
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

// Security monitoring middleware
export const securityMonitor = (req, res, next) => {
  // Monitor for suspicious patterns
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

  // Check request body
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

  // Check query parameters
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
