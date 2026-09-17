/**
 * Shared frontend host allowlist for CORS Origin and Referer checks.
 * Custom domains must live here so the public site is not blocked while
 * Vercel/Netlify previews still work.
 */

export const BUILTIN_FRONTEND_ORIGINS = [
  'https://www.anilounge.net',
  'https://anilounge.net',
  'https://find-animation.vercel.app',
  'https://find-animation.netlify.app',
  'http://localhost:5173',
  'http://localhost:5174',
  'http://localhost:5175',
  'http://localhost:5176',
  'http://127.0.0.1:5173',
  'http://127.0.0.1:5174',
]

/** Host fragments allowed on Referer (same domains as CORS, plus host platforms). */
export const ALLOWED_REFERER_HOST_SNIPPETS = [
  'anilounge.net',
  'vercel.app',
  'netlify.app',
  'github.io',
  'herokuapp.com',
  'railway.app',
  'localhost',
  '127.0.0.1',
]

/**
 * Env extras: `FRONTEND_URL` plus comma-separated `ALLOWED_ORIGINS`.
 * @returns {string[]}
 */
export function extraFrontendOriginsFromEnv() {
  return [process.env.FRONTEND_URL, ...(process.env.ALLOWED_ORIGINS || '').split(',')]
    .map((origin) => origin?.trim())
    .filter(Boolean)
}

/**
 * Whether a browser Origin may call the API.
 * @param {string | undefined} origin
 * @param {string[]} [extraOrigins]
 * @returns {boolean}
 */
export function isAllowedCorsOrigin(origin, extraOrigins = extraFrontendOriginsFromEnv()) {
  if (!origin) return true
  if (BUILTIN_FRONTEND_ORIGINS.includes(origin) || extraOrigins.includes(origin)) {
    return true
  }
  return /^https:\/\/([a-z0-9-]+\.)*vercel\.app$/i.test(origin)
}

/**
 * Whether a Referer is from a known frontend. Missing referer is allowed
 * (privacy browsers and same-origin Vercel rewrites).
 * @param {string | undefined} referer
 * @returns {boolean}
 */
export function isAllowedReferer(referer) {
  if (!referer) return true
  return ALLOWED_REFERER_HOST_SNIPPETS.some((snippet) => referer.includes(snippet))
}
