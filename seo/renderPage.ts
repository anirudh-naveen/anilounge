/**
 * renderPage.ts — write a page's search-engine view into the app's `index.html`.
 *
 * Used by the Vercel middleware (`/middleware.ts`) with a page description from the
 * API (`GET /api/seo/page`, backend/src/services/seoService.js). Pure string work so it
 * can be tested without Vercel.
 *
 * - `<title>` and index.html's own meta tags get the page's values; their original
 *   values stay in `data-default` / `data-default-content` for the app's usePageMeta.
 * - Tags index.html lacks (canonical, og:url, JSON-LD, robots) are added and marked
 *   `data-page-meta`, so usePageMeta adopts and later removes them.
 * - A plain summary (heading, text, links) goes inside `#app` for crawlers that don't
 *   run JavaScript; the app replaces it when it mounts.
 */

export interface PageLink {
  href: string
  label: string
}

export interface SeoPage {
  title: string
  description: string
  canonical: string
  image: string | null
  type: 'website' | 'article'
  robots: string | null
  heading: string
  intro: string
  sections: Array<{ title: string; links: PageLink[] }>
  jsonLd: Record<string, unknown> | Record<string, unknown>[] | null
}

const SITE_NAME = 'AniLounge'
const OWNED = 'data-page-meta'

const ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
}

/** Text escaped for HTML content and attribute values. */
export const escapeHtml = (value: unknown) =>
  String(value ?? '').replace(/[&<>"']/g, (char) => ESCAPES[char]!)

const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/** Decode the entities `escapeHtml` writes (for reading index.html's attribute values). */
const unescapeHtml = (value: string) =>
  value
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')

/** Insert `markup` just before `</head>`. */
const beforeHeadEnd = (html: string, markup: string) =>
  html.replace('</head>', `${markup}\n  </head>`)

/**
 * Set a `<meta name|property="key">` to `content`: index.html's tag keeps its original
 * value in `data-default-content`; a missing tag is added and marked ours.
 */
export function setMeta(
  html: string,
  attribute: 'name' | 'property',
  key: string,
  content: string,
) {
  const pattern = new RegExp(`<meta\\s[^>]*\\b${attribute}="${escapeRegExp(key)}"[^>]*>`)
  const existing = pattern.exec(html)
  if (existing) {
    const original = /\bcontent="([^"]*)"/.exec(existing[0])?.[1] ?? ''
    return html.replace(
      pattern,
      `<meta ${attribute}="${key}" content="${escapeHtml(content)}" data-default-content="${escapeHtml(unescapeHtml(original))}" />`,
    )
  }
  return beforeHeadEnd(
    html,
    `<meta ${attribute}="${key}" content="${escapeHtml(content)}" ${OWNED} />`,
  )
}

/** The `#app` placeholder content: heading, paragraphs, and link lists. */
export function pageBody(page: SeoPage) {
  const paragraphs = String(page.intro || '')
    .split(/\n{2,}/)
    .map((text) => text.trim())
    .filter(Boolean)
    .map((text) => `<p>${escapeHtml(text)}</p>`)
  const sections = page.sections
    .filter((section) => section.links.length)
    .map(
      (section) =>
        `<section><h2>${escapeHtml(section.title)}</h2><ul>${section.links
          .map(
            (item) => `<li><a href="${escapeHtml(item.href)}">${escapeHtml(item.label)}</a></li>`,
          )
          .join('')}</ul></section>`,
    )
  return [
    '<main style="max-width:960px;margin:0 auto;padding:2rem 16px;line-height:1.6">',
    `<h1>${escapeHtml(page.heading)}</h1>`,
    ...paragraphs,
    ...sections,
    '</main>',
  ].join('')
}

/**
 * index.html with the page's title, meta tags, canonical link, JSON-LD, and summary.
 * @param html - The app's index.html.
 * @param page - From `GET /api/seo/page`.
 */
export function renderPage(html: string, page: SeoPage) {
  const title = `${page.title} · ${SITE_NAME}`
  let out = html.replace(
    /<title>([^<]*)<\/title>/,
    (_match, original: string) =>
      `<title data-default="${escapeHtml(unescapeHtml(original))}">${escapeHtml(title)}</title>`,
  )
  out = setMeta(out, 'name', 'description', page.description)
  out = setMeta(out, 'property', 'og:site_name', SITE_NAME)
  out = setMeta(out, 'property', 'og:title', page.title)
  out = setMeta(out, 'property', 'og:description', page.description)
  out = setMeta(out, 'property', 'og:type', page.type || 'website')
  out = setMeta(out, 'property', 'og:url', page.canonical)
  if (page.image) {
    // The share card (backend/src/services/shareCardService.js).
    out = setMeta(out, 'property', 'og:image', page.image)
    out = setMeta(out, 'property', 'og:image:width', '1200')
    out = setMeta(out, 'property', 'og:image:height', '630')
    out = setMeta(out, 'property', 'og:image:alt', page.title)
  }
  out = setMeta(out, 'name', 'twitter:card', page.image ? 'summary_large_image' : 'summary')
  if (page.robots) out = setMeta(out, 'name', 'robots', page.robots)
  out = beforeHeadEnd(out, `<link rel="canonical" href="${escapeHtml(page.canonical)}" ${OWNED} />`)
  if (page.jsonLd) {
    // `<` escaped so text from posts or titles can't close the script element.
    const json = JSON.stringify(page.jsonLd).replace(/</g, '\\u003c')
    out = beforeHeadEnd(out, `<script type="application/ld+json" ${OWNED}>${json}</script>`)
  }
  return out.replace('<div id="app"></div>', `<div id="app">${pageBody(page)}</div>`)
}

/** index.html for a missing record: `noindex`, so a dead link isn't kept as a page. */
export function renderNotFound(html: string) {
  return setMeta(html, 'name', 'robots', 'noindex')
}

/**
 * Where to send a request whose path isn't the page's canonical one (a missing or old
 * slug, `/movie/<series id>`, a trailing slash), keeping its query; null when it already
 * is. One URL per page, as Google recommends, instead of only a canonical tag.
 * @param requestUrl - The requested URL.
 * @param canonical - The page's canonical URL (its origin is ignored, so previews and
 *   local runs redirect within themselves).
 */
export function canonicalRedirect(requestUrl: string, canonical: string) {
  const request = new URL(requestUrl)
  const target = new URL(canonical).pathname
  if (request.pathname === target) return null
  return `${request.origin}${target}${request.search}`
}
