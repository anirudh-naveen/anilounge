/**
 * Share cards: the 1200×630 image link previews show (Discord, X, iMessage, Slack,
 * Reddit) for a public page.
 *
 * Layer: domain service. Each page description from seoService carries a `card`
 * (eyebrow, title, facts, poster, rating); this draws it with satori (layout to SVG)
 * and resvg (SVG to PNG). Served at `GET /api/seo/card.png?path=…` (routes/seo.js) and
 * named as the page's `og:image` by the middleware and by usePageMeta.
 */

import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { Resvg } from '@resvg/resvg-js'
import satori from 'satori'

const require = createRequire(import.meta.url)
const font = (pkg, file) => readFileSync(require.resolve(`@fontsource/${pkg}/files/${file}`))

const FONTS = [
  { name: 'Fraunces', data: font('fraunces', 'fraunces-latin-700-normal.woff'), weight: 700 },
  { name: 'Outfit', data: font('outfit', 'outfit-latin-400-normal.woff'), weight: 400 },
  { name: 'Outfit', data: font('outfit', 'outfit-latin-600-normal.woff'), weight: 600 },
]

export const CARD_WIDTH = 1200
export const CARD_HEIGHT = 630
const POSTER_WIDTH = 340
const POSTER_HEIGHT = 510
const PADDING = 60
const GAP = 56

/** Site dark theme (src/assets/styles). */
const COLORS = {
  background: '#0f1726',
  backgroundEnd: '#1c273b',
  text: '#eef2f8',
  secondary: '#aab3c5',
  muted: '#8b93a6',
  accent: '#e07a5f',
  chip: '#27334b',
}

const svgData = (svg) => `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`

/** public/favicon.svg with the navy chair lightened for the dark card. */
const LOGO = svgData(
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" fill="none">
  <path d="M20.6 8.2h22.8l4.6 26.6H16L20.6 8.2Z" fill="#e8edf5"/>
  <path d="M7.2 29.2h13.4v7H6.8L3.4 51.2h12.4V58h32.4v-6.8h12.4L57.2 36.2H43.4v-7h13.4L53.6 53c-.4 2.4-2.4 4-4.8 4H15.2c-2.4 0-4.4-1.6-4.8-4L7.2 29.2Z" fill="#e8edf5"/>
  <rect x="17.6" y="32.8" width="28.8" height="10.8" rx="2" fill="#E07A5F"/>
</svg>`,
)

const STAR = svgData(
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path fill="${COLORS.accent}" d="M12 2.5l2.9 6.2 6.8.8-5 4.6 1.3 6.7L12 17.5l-6 3.3 1.3-6.7-5-4.6 6.8-.8z"/></svg>`,
)

const POSTER_TIMEOUT_MS = 3000
const POSTER_MAX_BYTES = 4 * 1024 * 1024
const POSTER_TYPES = ['image/jpeg', 'image/png']

/** A satori element (the React-element shape, without React). */
const h = (type, style, ...children) => ({
  type,
  props: { style, children: children.flat().filter((child) => child != null && child !== false) },
})
const img = (src, style) => ({ type: 'img', props: { src, style } })

/** Text cut to `length` characters on a word boundary. */
export function clip(text, length) {
  const flat = String(text || '')
    .replace(/\s+/g, ' ')
    .trim()
  if (flat.length <= length) return flat
  const cut = flat.slice(0, length - 1)
  const space = cut.lastIndexOf(' ')
  return `${(space > length * 0.6 ? cut.slice(0, space) : cut).trimEnd()}…`
}

/** Title font size: long titles step down so they stay within three lines. */
export function titleSize(title, wide) {
  const length = String(title || '').length
  const sizes = wide ? [84, 72, 60, 52] : [72, 62, 54, 46]
  if (length <= 18) return sizes[0]
  if (length <= 36) return sizes[1]
  if (length <= 60) return sizes[2]
  return sizes[3]
}

/**
 * The poster as a data URI, or null when it can't be fetched (the card is then drawn
 * without it). Only http(s) JPEG/PNG under a size cap.
 * @param {string | null} url
 */
async function loadPoster(url) {
  if (!url || !/^https:\/\//.test(url)) return null
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), POSTER_TIMEOUT_MS)
  try {
    const response = await fetch(url, { signal: controller.signal })
    const type = String(response.headers.get('content-type') || '')
      .split(';')[0]
      .trim()
    if (!response.ok || !POSTER_TYPES.includes(type)) return null
    const bytes = Buffer.from(await response.arrayBuffer())
    if (bytes.length > POSTER_MAX_BYTES) return null
    return `data:${type};base64,${bytes.toString('base64')}`
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}

function footer() {
  return h(
    'div',
    { display: 'flex', alignItems: 'center', gap: 14 },
    img(LOGO, { width: 44, height: 44 }),
    h(
      'div',
      { display: 'flex', fontFamily: 'Outfit', fontWeight: 600, fontSize: 30, color: COLORS.text },
      'AniLounge',
    ),
    h(
      'div',
      { display: 'flex', fontFamily: 'Outfit', fontSize: 24, color: COLORS.muted, marginLeft: 6 },
      'anilounge.net',
    ),
  )
}

function rating(value) {
  if (!value) return null
  return h(
    'div',
    { display: 'flex', alignItems: 'center', gap: 10, fontFamily: 'Outfit' },
    img(STAR, { width: 34, height: 34 }),
    h(
      'div',
      { display: 'flex', fontSize: 36, fontWeight: 600, color: COLORS.text },
      value.value.toFixed(1),
    ),
    h(
      'div',
      { display: 'flex', fontSize: 24, color: COLORS.secondary, marginLeft: 4 },
      `${value.count} rating${value.count === 1 ? '' : 's'} on AniLounge`,
    ),
  )
}

/**
 * The card layout for `card` (see seoService's page builders).
 * @param {object} card
 * @param {string | null} poster - Data URI, or null for the text-only layout.
 */
export function cardElement(card, poster) {
  const wide = !poster
  const tags = (card.tags || []).slice(0, 3)
  const body = h(
    'div',
    { display: 'flex', flexDirection: 'column', gap: 20 },
    card.eyebrow &&
      h(
        'div',
        {
          display: 'flex',
          fontFamily: 'Outfit',
          fontWeight: 600,
          fontSize: 24,
          letterSpacing: 3,
          textTransform: 'uppercase',
          color: COLORS.accent,
        },
        clip(card.eyebrow, 48),
      ),
    h(
      'div',
      {
        display: 'flex',
        fontFamily: 'Fraunces',
        fontWeight: 700,
        fontSize: titleSize(card.title, wide),
        lineHeight: 1.08,
        color: COLORS.text,
      },
      clip(card.title, 90),
    ),
    card.meta &&
      h(
        'div',
        { display: 'flex', fontFamily: 'Outfit', fontSize: 28, color: COLORS.secondary },
        clip(card.meta, 70),
      ),
    card.text &&
      h(
        'div',
        {
          display: 'flex',
          fontFamily: 'Outfit',
          fontSize: 27,
          lineHeight: 1.4,
          color: COLORS.secondary,
        },
        clip(card.text, wide ? 170 : 120),
      ),
    tags.length > 0 &&
      h(
        'div',
        { display: 'flex', flexWrap: 'wrap', gap: 10 },
        tags.map((tag) =>
          h(
            'div',
            {
              display: 'flex',
              fontFamily: 'Outfit',
              fontSize: 22,
              color: COLORS.text,
              backgroundColor: COLORS.chip,
              borderRadius: 999,
              padding: '6px 18px',
            },
            clip(tag, 40),
          ),
        ),
      ),
    rating(card.rating),
  )
  return h(
    'div',
    {
      display: 'flex',
      width: CARD_WIDTH,
      height: CARD_HEIGHT,
      padding: PADDING,
      gap: GAP,
      backgroundImage: `linear-gradient(135deg, ${COLORS.backgroundEnd} 0%, ${COLORS.background} 70%)`,
    },
    poster &&
      img(poster, {
        width: POSTER_WIDTH,
        height: POSTER_HEIGHT,
        objectFit: 'cover',
        borderRadius: 18,
        boxShadow: '0 20px 50px rgba(0, 0, 0, 0.45)',
      }),
    h(
      'div',
      {
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        // Explicit size: satori doesn't shrink text to a flex item's width.
        width: CARD_WIDTH - PADDING * 2 - (poster ? POSTER_WIDTH + GAP : 0),
        height: CARD_HEIGHT - PADDING * 2,
      },
      body,
      footer(),
    ),
  )
}

/**
 * PNG of a page's share card.
 * @param {object} card - From a page description (`page.card`).
 * @returns {Promise<Buffer>}
 */
export async function renderCard(card) {
  const poster = await loadPoster(card.poster)
  const svg = await satori(cardElement(card, poster), {
    width: CARD_WIDTH,
    height: CARD_HEIGHT,
    fonts: FONTS,
  })
  return new Resvg(svg, { fitTo: { mode: 'width', value: CARD_WIDTH } }).render().asPng()
}

export default { renderCard, cardElement, clip, titleSize }
