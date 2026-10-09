/**
 * middleware.ts — Vercel Routing Middleware: public pages arrive with their content.
 *
 * The site is a single-page app, so every URL served the same empty index.html, and
 * search engines that don't run JavaScript (and link previews) saw nothing. For the
 * public pages below, this asks the API what the page is (`GET /api/seo/page`,
 * backend/src/services/seoService.js) and writes it into index.html
 * (seo/renderPage.ts): title, description, canonical link, image, schema.org data,
 * `noindex` for thin pages, and a short summary the app replaces when it starts.
 *
 * It fails open: if the API is slow, down, or doesn't know the path, the request goes
 * on to the plain app as before. A record that doesn't exist gets a 404 status, and a
 * URL that isn't the page's canonical one (no slug, an old slug) is redirected to it.
 */

import { canonicalRedirect, renderNotFound, renderPage, type SeoPage } from './seo/renderPage'

export const config = {
  matcher: [
    '/',
    '/movies',
    '/tv',
    '/forum',
    '/search',
    '/movie/:path*',
    '/tv-show/:path*',
    '/character/:path*',
    '/voice-actor/:path*',
    '/studio/:path*',
    '/franchise/:path*',
    '/forum/post/:path*',
  ],
}

/** List pages (the rest of the matcher is detail pages). */
const STATIC_PATHS = new Set(['/', '/movies', '/tv', '/forum', '/search'])

/** Railway API origin (vercel.json rewrites `/api` there too). */
const API_ORIGIN = (
  process.env.SEO_API_ORIGIN || 'https://anilounge-production.up.railway.app'
).replace(/\/+$/, '')
const API_TIMEOUT_MS = 2500
const SHELL_TTL_MS = 60 * 1000

/** Same as the static headers in vercel.json (they don't reach middleware responses). */
const SECURITY_HEADERS: Record<string, string> = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=()',
}

/** index.html of this deployment, cached briefly per instance. */
let shell: { html: string; at: number } | null = null

async function loadShell(origin: string) {
  if (shell && Date.now() - shell.at < SHELL_TTL_MS) return shell.html
  const response = await fetch(`${origin}/index.html`)
  if (!response.ok) throw new Error(`index.html: ${response.status}`)
  const html = await response.text()
  if (!html.includes('<div id="app"></div>')) throw new Error('index.html: unexpected shape')
  shell = { html, at: Date.now() }
  return html
}

async function describe(pathname: string, visitorIp: string | null, visitorAgent: string | null) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), API_TIMEOUT_MS)
  try {
    const response = await fetch(
      `${API_ORIGIN}/api/seo/page?path=${encodeURIComponent(pathname)}`,
      {
        signal: controller.signal,
        // The API rate-limits per visitor (backend/src/middleware/clientIp.js) and lets
        // verified Google/Bing crawlers through (backend/src/middleware/searchCrawler.js).
        headers: {
          ...(visitorIp ? { 'x-vercel-forwarded-for': visitorIp } : {}),
          ...(visitorAgent ? { 'user-agent': visitorAgent } : {}),
        },
      },
    )
    if (response.status !== 200 && response.status !== 404) return null
    const body = (await response.json()) as { data?: SeoPage; notFound?: boolean }
    // A bare 404 (e.g. an API without this route yet) must not mark pages missing.
    if (response.status === 404) return body.notFound === true ? { found: false as const } : null
    return body.data ? { found: true as const, page: body.data } : null
  } finally {
    clearTimeout(timer)
  }
}

const htmlResponse = (html: string, status: number) =>
  new Response(html, {
    status,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'public, max-age=0, must-revalidate',
      ...SECURITY_HEADERS,
    },
  })

export default async function middleware(request: Request) {
  if (request.method !== 'GET' && request.method !== 'HEAD') return
  const url = new URL(request.url)
  // List pages with a query (`/forum?tag=…`, `/movies?tab=…`) set their own canonical
  // link in the browser; leave them to the app.
  if (STATIC_PATHS.has(url.pathname.replace(/\/+$/, '') || '/') && url.search) return
  try {
    const visitorIp =
      request.headers.get('x-real-ip') ||
      request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
      null
    const [result, html] = await Promise.all([
      describe(url.pathname, visitorIp, request.headers.get('user-agent')),
      loadShell(url.origin),
    ])
    if (!result) return
    if (!result.found) return htmlResponse(renderNotFound(html), 404)
    const redirect = canonicalRedirect(request.url, result.page.canonical)
    if (redirect) {
      return new Response(null, {
        status: 308,
        headers: {
          Location: redirect,
          'Cache-Control': 'public, max-age=3600',
          ...SECURITY_HEADERS,
        },
      })
    }
    return htmlResponse(renderPage(html, result.page), 200)
  } catch (error) {
    console.error('SEO middleware:', error instanceof Error ? error.message : error)
    return
  }
}
