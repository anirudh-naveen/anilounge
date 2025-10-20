# Security Implementation Guide

## Overview

This document outlines the comprehensive security measures implemented in the Find Animation application to protect against common web vulnerabilities and ensure secure user data handling.

## 🔒 Security Measures Implemented

### 1. Account Lockout Protection

**Location**: `backend/src/controllers/authController.js`

**What it does**:

- Locks user accounts after 5 failed login attempts
- 30-minute lockout period
- Automatic unlock after successful login
- Detailed logging of lockout events

**How it works**:

```javascript
// Check if account is locked
const isLocked = user.lockUntil && user.lockUntil > Date.now()
if (isLocked) {
  return res.status(423).json({
    success: false,
    message: `Account is temporarily locked for 30 minutes...`,
  })
}

// On failed login
if (!isPasswordValid) {
  user.failedLoginAttempts += 1
  if (user.failedLoginAttempts >= 5) {
    user.lockUntil = Date.now() + 30 * 60 * 1000 // 30 minutes
  }
  await user.save()
}
```

### 2. JWT Token Security Enhancement

**Location**: `backend/src/middleware/auth.js`, `backend/src/models/RefreshToken.js`

**What it does**:

- Short-lived access tokens (15 minutes)
- Long-lived refresh tokens (7 days)
- Token revocation capability
- Automatic cleanup of expired tokens

**How it works**:

```javascript
// Access token (15 minutes)
export const generateAccessToken = (userId) => {
  return jwt.sign({ userId }, process.env.JWT_SECRET, { expiresIn: '15m' })
}

// Refresh token (7 days, stored in database)
export const generateRefreshToken = async (userId) => {
  const refreshToken = await RefreshToken.createToken(userId)
  return refreshToken.token
}
```

### 3. Input Validation and Sanitization

**Location**: `backend/src/middleware/security.js`

**What it does**:

- HTML sanitization using `sanitize-html`
- XSS protection using `xss` library
- MongoDB ObjectId validation
- Suspicious pattern detection

**How it works**:

```javascript
// HTML sanitization
export const sanitizeHtmlInput = (req, res, next) => {
  if (req.body) {
    Object.keys(req.body).forEach((key) => {
      if (typeof req.body[key] === 'string') {
        req.body[key] = sanitizeHtml(req.body[key], sanitizeOptions)
      }
    })
  }
  next()
}

// XSS protection
export const sanitizeXSS = (req, res, next) => {
  const fieldsToSanitize = ['username', 'email', 'notes', 'review']
  fieldsToSanitize.forEach((field) => {
    if (req.body[field] && typeof req.body[field] === 'string') {
      req.body[field] = xss(req.body[field], xssOptions)
    }
  })
  next()
}
```

### 4. Enhanced File Upload Security

**Location**: `backend/src/middleware/upload.js`

**What it does**:

- File type validation (MIME type + extension)
- File size limits (5MB)
- Cryptographically secure filenames
- Suspicious filename pattern detection
- Error handling for upload failures

**How it works**:

```javascript
// Secure filename generation
filename: (req, file, cb) => {
  const randomBytes = crypto.randomBytes(16).toString('hex')
  const timestamp = Date.now()
  const ext = path.extname(file.originalname).toLowerCase()
  const safeExt = ext.match(/^\.(jpg|jpeg|png|gif|webp)$/) ? ext : '.jpg'
  cb(null, `profile-${req.user._id}-${timestamp}-${randomBytes}${safeExt}`)
}

// Enhanced file filter
const fileFilter = (req, file, cb) => {
  const allowedMimeTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp']
  const suspiciousPatterns = /[<>:"/\\|?*]|\.(exe|bat|cmd|scr|pif|vbs|js|jar|php|asp|aspx)$/i

  if (!allowedMimeTypes.includes(file.mimetype) || suspiciousPatterns.test(file.originalname)) {
    return cb(new Error('Invalid file'), false)
  }
  cb(null, true)
}
```

### 5. Security Headers and HTTPS Enforcement

**Location**: `backend/src/server.js`

**What it does**:

- Content Security Policy (CSP)
- HTTP Strict Transport Security (HSTS)
- X-Frame-Options, X-Content-Type-Options
- Referrer Policy
- CORS configuration with origin validation

**How it works**:

```javascript
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        scriptSrc: ["'self'"],
        imgSrc: ["'self'", 'data:', 'blob:'],
        // ... more directives
      },
    },
    hsts: {
      maxAge: 31536000,
      includeSubDomains: true,
      preload: true,
    },
  }),
)
```

### 6. Rate Limiting

**Location**: `backend/src/server.js`

**What it does**:

- General rate limiting (100 requests/15 minutes)
- Auth-specific rate limiting (5 requests/15 minutes)
- Upload rate limiting (10 uploads/hour)
- IP-based tracking with proxy support

**How it works**:

```javascript
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // limit each IP to 5 auth requests per windowMs
  message: {
    success: false,
    message: 'Too many authentication attempts, please try again later.',
  },
})

app.use('/api/auth', authLimiter)
```

### 7. Security Monitoring and Logging

**Location**: `backend/src/middleware/securityLogger.js`

**What it does**:

- Comprehensive security event logging
- Suspicious activity detection
- Failed login attempt tracking
- File upload monitoring
- Rate limit violation logging

**How it works**:

```javascript
// Security event logging
export const logSecurityEvent = (event, details) => {
  const logEntry = createSecurityLogEntry(event, details)
  writeSecurityLog(logEntry)
}

// Login attempt logging
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

// Suspicious activity detection
export const securityMonitor = (req, res, next) => {
  const suspiciousPatterns = [
    /<script/i,
    /javascript:/i,
    /union\s+select/i,
    /drop\s+table/i,
    // ... more patterns
  ]

  // Check request body and query for suspicious patterns
  // Log and potentially block suspicious requests
}
```

## 🛡️ Security Features by Category

### Authentication Security

- ✅ Account lockout after failed attempts
- ✅ Password strength requirements
- ✅ JWT token expiration (15 minutes)
- ✅ Refresh token system
- ✅ Token revocation on logout
- ✅ Login attempt logging

### Input Security

- ✅ HTML sanitization
- ✅ XSS protection
- ✅ SQL injection prevention
- ✅ MongoDB ObjectId validation
- ✅ Suspicious pattern detection
- ✅ File upload validation

### Network Security

- ✅ HTTPS enforcement (HSTS)
- ✅ CORS configuration
- ✅ Security headers (CSP, X-Frame-Options, etc.)
- ✅ Rate limiting
- ✅ Proxy trust configuration

### File Security

- ✅ File type validation
- ✅ File size limits
- ✅ Secure filename generation
- ✅ Upload error handling
- ✅ File access logging

### Monitoring & Logging

- ✅ Security event logging
- ✅ Failed login tracking
- ✅ Suspicious activity detection
- ✅ File upload monitoring
- ✅ Rate limit violation logging

## 🔧 Configuration Requirements

### Environment Variables

```bash
# Required for JWT tokens
JWT_SECRET=your-super-secret-jwt-key

# Required for database
MONGODB_URI=your-mongodb-connection-string

# Optional for production
NODE_ENV=production
```

### Dependencies Added

```json
{
  "sanitize-html": "^2.11.0",
  "xss": "^1.0.14",
  "express-rate-limit": "^7.1.5"
}
```

## 📊 Security Monitoring

### Log Files

Security logs are stored in `backend/logs/security-YYYY-MM-DD.log` with the following structure:

```json
{
  "timestamp": "2024-01-15T10:30:00.000Z",
  "event": "LOGIN_FAILED",
  "details": {
    "email": "user@example.com",
    "success": false,
    "ip": "192.168.1.1",
    "userAgent": "Mozilla/5.0...",
    "userId": "507f1f77bcf86cd799439011"
  },
  "severity": "MEDIUM"
}
```

### Security Events Tracked

- `LOGIN_FAILED` - Failed login attempts
- `LOGIN_SUCCESS` - Successful logins
- `ACCOUNT_LOCKED` - Account lockouts
- `SUSPICIOUS_ACTIVITY` - Detected suspicious patterns
- `FILE_UPLOAD` - File upload attempts
- `RATE_LIMIT_EXCEEDED` - Rate limit violations
- `INVALID_TOKEN` - Invalid JWT tokens
- `UNAUTHORIZED_ACCESS` - Unauthorized access attempts

## 🚀 Deployment Security Checklist

### Pre-Deployment

- [ ] Set strong JWT_SECRET
- [ ] Configure production CORS origins
- [ ] Enable HTTPS in production
- [ ] Set NODE_ENV=production
- [ ] Configure MongoDB with authentication
- [ ] Set up log rotation for security logs

### Post-Deployment

- [ ] Monitor security logs regularly
- [ ] Set up alerts for HIGH severity events
- [ ] Regular security updates
- [ ] Backup security logs
- [ ] Monitor rate limiting effectiveness

## 🔍 Security Testing

### Manual Testing

1. **Account Lockout**: Try 5+ failed logins
2. **Rate Limiting**: Make 100+ requests quickly
3. **File Upload**: Try uploading non-image files
4. **XSS Protection**: Submit scripts in forms
5. **Token Expiration**: Wait 15+ minutes after login

### Automated Testing

Consider implementing:

- Unit tests for security functions
- Integration tests for auth flows
- Penetration testing tools
- Security scanning tools

## 📈 Security Metrics to Monitor

- Failed login attempts per hour
- Account lockouts per day
- Rate limit violations per hour
- Suspicious activity detections
- File upload success/failure rates
- Token refresh frequency

This comprehensive security implementation provides multiple layers of protection against common web vulnerabilities while maintaining a good user experience.
