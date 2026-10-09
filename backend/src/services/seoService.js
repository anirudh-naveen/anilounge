/**
 * What a public page looks like to search engines and link previews, before any
 * JavaScript runs.
 *
 * Layer: domain service. The site is a single-page app, so every URL used to return the
 * same empty `index.html`. The Vercel middleware (`/middleware.js`) asks this service
 * about the requested path and writes the answer into the HTML: title, description,
 * canonical link, image, schema.org data, `noindex` for thin pages, and a short
 * summary with links inside `#app` (the app replaces it when it starts). Mirrors what
 * the pages set themselves in the browser (`src/utils/pageMeta.ts`).
 */

import { query } from '../../config/postgres.js'
import { isUuid } from '../db/ids.js'
import { stripFormatting } from '../utils/richText.js'
import { INDEXABLE_SQL } from '../utils/seoIndexing.js'
import { contentDisplayName, contentPagePath, detailPath } from '../utils/slug.js'

const SITE_NAME = 'AniLounge'
const DESCRIPTION_MAX = 160
const LIST_MAX = 24
const CACHE_TTL_MS = 10 * 60 * 1000
const CACHE_MAX = 5000

/** Pages without their own data. Keep in step with the views' `usePageMeta` calls. */
const STATIC_PAGES = {
  '/': {
    title: 'Discover, track, and discuss anime',
    description:
      "Find new anime and animated films, track everything you've watched, and talk about it with fans around the world.",
    heading: 'AniLounge: discover, track, and discuss anime',
  },
  '/movies': {
    title: 'Animated Movies',
    description: 'Trending animated movies: what fans are watching now on AniLounge.',
    heading: 'Animated Movies',
    list: { title: 'Popular movies', kinds: ['movie', 'special'] },
  },
  '/tv': {
    title: 'Animated Series',
    description: 'Trending anime and animated series: what fans are watching now on AniLounge.',
    heading: 'Animated Series',
    list: { title: 'Popular series', kinds: ['series'] },
  },
  '/forum': {
    title: 'Forum',
    description:
      'Discussions, reviews, guides, and episode threads about anime and animated films.',
    heading: 'AniLounge Forum',
    posts: true,
  },
  '/search': {
    title: 'Search anime',
    description:
      'Search animated movies, series, characters, voice actors, and studios by title, genre, year, season, and rating.',
    heading: 'Search anime',
  },
}

const HOME_SECTIONS = [
  {
    title: 'Explore',
    links: [
      { href: '/movies', label: 'Animated movies' },
      { href: '/tv', label: 'Animated series' },
      { href: '/forum', label: 'Forum' },
      { href: '/search', label: 'Search' },
    ],
  },
]

const POST_KIND_LABELS = {
  discussion: 'Discussion',
  review: 'Review',
  guide: 'Guide',
  article: 'Article',
}

/** Text cut to a meta-description length on a word boundary. */
export function metaDescription(text, length = DESCRIPTION_MAX) {
  const flat = String(text || '')
    .replace(/\s+/g, ' ')
    .trim()
  if (flat.length <= length) return flat
  const cut = flat.slice(0, length - 1)
  const space = cut.lastIndexOf(' ')
  return `${(space > length * 0.6 ? cut.slice(0, space) : cut).trimEnd()}…`
}

/**
 * Absolute image URL for a stored poster/picture path (same rules as the frontend's
 * `getImageUrl`), or null.
 * @param {unknown} path
 * @returns {string | null}
 */
export function imageUrl(path) {
  const value = String(path || '').trim()
  if (!value) return null
  if (value.startsWith('//')) return `https:${value}`
  if (value.startsWith('http://') && /myanimelist\.net/i.test(value)) {
    return `https://${value.slice('http://'.length)}`
  }
  if (value.startsWith('http')) return value
  if (value.startsWith('/uploads/')) return null
  return `https://image.tmdb.org/t/p/w500${value}`
}

const yearOf = (value) => {
  const date = value ? new Date(value) : null
  return date && !Number.isNaN(date.getTime()) ? date.getUTCFullYear() : null
}

const isoDate = (value) => {
  const date = value ? new Date(value) : null
  return date && !Number.isNaN(date.getTime()) ? date.toISOString().slice(0, 10) : undefined
}

const link = (row) => ({
  href: contentPagePath(row),
  label: contentDisplayName(row.kind, row.name),
})

/** Fewest AniLounge ratings before a title's schema.org data carries its average (stars). */
export const RATING_MIN_COUNT = 3

/**
 * schema.org AggregateRating from AniLounge's own ratings (1–10), or null with too few.
 * Only ratings made on the site count: Google's review snippets don't allow scores
 * copied from other sites (MAL, TMDB).
 * @param {unknown} count
 * @param {unknown} sum
 * @returns {object | null}
 */
export function aggregateRating(count, sum) {
  const ratings = Number(count || 0)
  if (ratings < RATING_MIN_COUNT) return null
  return {
    '@type': 'AggregateRating',
    ratingValue: Math.round((Number(sum) / ratings) * 10) / 10,
    bestRating: 10,
    worstRating: 1,
    ratingCount: ratings,
  }
}

/**
 * schema.org BreadcrumbList (shown as the path above a search result).
 * @param {Array<{ name: string, path: string }>} items - Home first; in-site paths.
 * @returns {object}
 */
export function breadcrumbList(items) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: item.name,
      item: item.path,
    })),
  }
}

const HOME_CRUMB = { name: SITE_NAME, path: '/' }

/**
 * Which page a path is.
 * @param {unknown} path - Pathname (query and hash ignored).
 * @returns {{ type: 'static', key: string } | { type: 'content', prefix: string, id: string }
 *   | { type: 'post', id: string } | null} null for paths this service doesn't describe.
 */
export function parsePagePath(path) {
  const clean = String(path || '').split(/[?#]/)[0]
  const pathname = clean.length > 1 ? clean.replace(/\/+$/, '') : clean
  if (STATIC_PAGES[pathname]) return { type: 'static', key: pathname }
  // `/<kind>/<slug>/<id>`, `/<kind>/<id>`, or the older `/<kind>/<id>/<slug>`: the id is
  // whichever segment is one.
  const match =
    /^\/(forum\/post|movie|tv-show|character|voice-actor|studio|franchise)\/([^/]+)(?:\/([^/]+))?$/.exec(
      pathname,
    )
  if (!match) return null
  const ids = [match[2], match[3]].filter((segment) => segment && isUuid(segment))
  if (ids.length !== 1) return null
  const id = ids[0].toLowerCase()
  return match[1] === 'forum/post'
    ? { type: 'post', id }
    : { type: 'content', prefix: `/${match[1]}`, id }
}

/** Content kinds each detail route shows. */
const ROUTE_KINDS = {
  '/movie': ['movie', 'special', 'series'],
  '/tv-show': ['series', 'movie', 'special'],
  '/character': ['character'],
  '/voice-actor': ['voice'],
  '/studio': ['studio'],
  '/franchise': ['franchise'],
}

async function rows(sql, params) {
  return (await query(sql, params)).rows
}

async function staticPage(key) {
  const page = STATIC_PAGES[key]
  const sections = key === '/' ? [...HOME_SECTIONS] : []
  if (page.list) {
    const titles = await rows(
      `SELECT c.id, c.kind, c.name FROM content c
       WHERE c.kind = ANY ($1) ORDER BY c.catalog_score DESC LIMIT ${LIST_MAX}`,
      [page.list.kinds],
    )
    if (titles.length) sections.push({ title: page.list.title, links: titles.map(link) })
  }
  if (page.posts || key === '/') {
    const posts = await rows(
      `SELECT p.id, p.title FROM posts p JOIN users u ON u.id = p.user_id
       WHERE u.banned_at IS NULL ORDER BY p.hot_score DESC, p.last_activity_at DESC LIMIT ${LIST_MAX}`,
    )
    if (posts.length) {
      sections.push({
        title: 'Popular in the forum',
        links: posts.map((post) => ({
          href: detailPath('/forum/post', post.id, post.title),
          label: post.title,
        })),
      })
    }
  }
  return {
    title: page.title,
    description: page.description,
    path: key,
    image: null,
    type: 'website',
    robots: null,
    heading: page.heading,
    intro: page.description,
    sections,
    jsonLd:
      key === '/'
        ? { '@context': 'https://schema.org', '@type': 'WebSite', name: SITE_NAME, url: '/' }
        : null,
  }
}

async function titlePage(row) {
  const [genres, studios, characters, franchise] = await Promise.all([
    rows(
      `SELECT g.name FROM content_genres cg JOIN genres g ON g.id = cg.genre_id
       WHERE cg.content_id = $1 ORDER BY g.name`,
      [row.id],
    ),
    rows(
      `SELECT c.id, c.kind, c.name FROM studio_credits sc JOIN content c ON c.id = sc.studio_id
       WHERE sc.work_id = $1 ORDER BY c.name LIMIT 10`,
      [row.id],
    ),
    rows(
      `SELECT c.id, c.kind, c.name FROM appearances a JOIN content c ON c.id = a.character_id
       WHERE a.work_id = $1
       ORDER BY (a.role = 'main') DESC, a.position NULLS LAST, a.importance DESC
       LIMIT ${LIST_MAX}`,
      [row.id],
    ),
    rows(
      `SELECT c.id, c.kind, c.name FROM franchise_members m JOIN content c ON c.id = m.franchise_id
       WHERE m.member_id = $1 LIMIT 1`,
      [row.id],
    ),
  ])
  const name = contentDisplayName(row.kind, row.name)
  const series = row.kind === 'series'
  const year = yearOf(row.release_date)
  const genreNames = genres.map((genre) => genre.name)
  const noun = series ? 'anime series' : row.kind === 'special' ? 'special' : 'movie'
  const overview = String(row.about || '').trim()
  const summary =
    overview ||
    `${name}${year ? ` (${year})` : ''}: an animated ${noun}${
      genreNames.length ? ` · ${genreNames.slice(0, 3).join(', ')}` : ''
    }.`
  const path = contentPagePath(row)
  const image = imageUrl(row.image_path)
  const rating = aggregateRating(row.rating_count, row.rating_sum)
  const facts = [
    year && `Released ${year}`,
    series && row.episode_count && `${row.episode_count} episodes`,
    genreNames.length && genreNames.join(', '),
  ].filter(Boolean)
  return {
    title: year ? `${name} (${year})` : name,
    description: `${summary} Track it, rate it, and discuss it on AniLounge.`,
    path,
    image,
    type: 'website',
    robots: null,
    heading: name,
    intro: [overview, facts.join(' · ')].filter(Boolean).join('\n\n'),
    sections: [
      franchise.length && { title: 'Franchise', links: franchise.map(link) },
      studios.length && { title: 'Studios', links: studios.map(link) },
      characters.length && { title: 'Characters', links: characters.map(link) },
    ].filter(Boolean),
    jsonLd: [
      {
        '@context': 'https://schema.org',
        '@type': series ? 'TVSeries' : 'Movie',
        name,
        ...(row.native_name && row.native_name !== name ? { alternateName: row.native_name } : {}),
        url: path,
        ...(overview ? { description: overview } : {}),
        ...(image ? { image } : {}),
        ...(genreNames.length ? { genre: genreNames } : {}),
        ...(isoDate(row.release_date)
          ? { [series ? 'startDate' : 'datePublished']: isoDate(row.release_date) }
          : {}),
        ...(series && row.episode_count ? { numberOfEpisodes: Number(row.episode_count) } : {}),
        ...(studios.length
          ? {
              productionCompany: studios.map((studio) => ({
                '@type': 'Organization',
                name: contentDisplayName(studio.kind, studio.name),
              })),
            }
          : {}),
        ...(rating ? { aggregateRating: rating } : {}),
      },
      breadcrumbList([
        HOME_CRUMB,
        series
          ? { name: 'Animated Series', path: '/tv' }
          : { name: 'Animated Movies', path: '/movies' },
        { name, path },
      ]),
    ],
  }
}

const ENTITY_TYPE = {
  character: 'Person',
  voice: 'Person',
  studio: 'Organization',
  franchise: 'CreativeWorkSeries',
}

/** Fallback descriptions; same wording as `entityPageMeta` in src/utils/pageMeta.ts. */
const ENTITY_FALLBACK = {
  character: (name, works) =>
    `${name}${works.length ? `, a character from ${works.slice(0, 3).join(', ')}` : ''}: profile, voice actors, and appearances.`,
  voice: (name, works) =>
    `${name}, voice actor${works.length ? ` in ${works.slice(0, 3).join(', ')}` : ''}: roles and characters voiced.`,
  studio: (name, works) =>
    `${name}, animation studio${works.length ? ` behind ${works.slice(0, 3).join(', ')}` : ''}: every title they made.`,
  franchise: (name, works) =>
    `The ${name} franchise${works.length ? `: ${works.slice(0, 3).join(', ')}` : ''}. Every movie, series, and special in watch order.`,
}

async function entitySections(row) {
  if (row.kind === 'character') {
    const [works, voices] = await Promise.all([
      rows(
        `SELECT w.id, w.kind, w.name FROM appearances a JOIN content w ON w.id = a.work_id
         WHERE a.character_id = $1
         ORDER BY (a.role = 'main') DESC, w.catalog_score DESC LIMIT ${LIST_MAX}`,
        [row.id],
      ),
      rows(
        `SELECT DISTINCT v.id, v.kind, v.name FROM appearances a
         JOIN voice_credits vc ON vc.appearance_id = a.id
         JOIN content v ON v.id = vc.voice_id
         WHERE a.character_id = $1 LIMIT 8`,
        [row.id],
      ),
    ])
    return {
      // Grouped by franchise on the page; titles are close enough for the summary.
      works: works.map((work) => work.name),
      parent: works[0] || null,
      sections: [
        works.length && { title: 'Appears in', links: works.map(link) },
        voices.length && { title: 'Voice actors', links: voices.map(link) },
      ].filter(Boolean),
    }
  }
  if (row.kind === 'voice') {
    const voiced = await rows(
      `SELECT ch.id, ch.kind, ch.name, max(w.name) AS work, max(w.catalog_score) AS score
       FROM voice_credits vc
       JOIN appearances a ON a.id = vc.appearance_id
       JOIN content ch ON ch.id = a.character_id
       JOIN content w ON w.id = a.work_id
       WHERE vc.voice_id = $1
       GROUP BY ch.id ORDER BY score DESC NULLS LAST LIMIT ${LIST_MAX}`,
      [row.id],
    )
    return {
      works: [...new Set(voiced.map((item) => item.work).filter(Boolean))],
      sections: voiced.length
        ? [
            {
              title: 'Characters voiced',
              links: voiced.map((item) => ({
                ...link(item),
                label: `${contentDisplayName(item.kind, item.name)}${item.work ? ` (${item.work})` : ''}`,
              })),
            },
          ]
        : [],
    }
  }
  const works =
    row.kind === 'studio'
      ? await rows(
          `SELECT w.id, w.kind, w.name FROM studio_credits sc JOIN content w ON w.id = sc.work_id
           WHERE sc.studio_id = $1 ORDER BY w.catalog_score DESC LIMIT ${LIST_MAX * 2}`,
          [row.id],
        )
      : await rows(
          `SELECT w.id, w.kind, w.name FROM franchise_members m
           JOIN content w ON w.id = m.member_id
           LEFT JOIN works wv ON wv.id = w.id
           WHERE m.franchise_id = $1
           ORDER BY wv.release_date NULLS LAST, w.name LIMIT ${LIST_MAX * 2}`,
          [row.id],
        )
  return {
    works: works.map((work) => work.name),
    sections: works.length ? [{ title: 'Titles', links: works.map(link) }] : [],
  }
}

async function entityPage(row) {
  const name = contentDisplayName(row.kind, row.name)
  const about = String(row.about || '').trim()
  const { works, sections, parent = null } = await entitySections(row)
  const path = contentPagePath(row)
  const image = imageUrl(row.image_path)
  return {
    title: name,
    description: about || ENTITY_FALLBACK[row.kind](name, works),
    path,
    image,
    type: 'website',
    robots: row.indexable ? null : 'noindex',
    heading: name,
    intro: about,
    sections,
    jsonLd: [
      {
        '@context': 'https://schema.org',
        '@type': ENTITY_TYPE[row.kind],
        ...(row.kind === 'character' ? { additionalType: 'FictionalCharacter' } : {}),
        name,
        ...(row.native_name && row.native_name !== name ? { alternateName: row.native_name } : {}),
        url: path,
        ...(about ? { description: about } : {}),
        ...(image ? { image } : {}),
      },
      breadcrumbList([
        HOME_CRUMB,
        ...(parent
          ? [{ name: contentDisplayName(parent.kind, parent.name), path: contentPagePath(parent) }]
          : []),
        { name, path },
      ]),
    ],
  }
}

async function contentPage({ prefix, id }) {
  const kinds = ROUTE_KINDS[prefix]
  const indexable = Object.entries(INDEXABLE_SQL)
    .map(([kind, sql]) => `WHEN '${kind}' THEN ${sql}`)
    .join(' ')
  const [row] = await rows(
    `SELECT c.id, c.kind, c.name, c.native_name, c.about, c.image_path, c.rating_count, c.rating_sum,
       (CASE c.kind ${indexable} ELSE false END) AS indexable,
       w.release_date, w.episode_count
     FROM content c LEFT JOIN works w ON w.id = c.id
     WHERE c.id = $1 AND c.kind = ANY ($2)`,
    [id, kinds],
  )
  if (!row) return null
  return ['movie', 'series', 'special'].includes(row.kind) ? titlePage(row) : entityPage(row)
}

async function postPage(id) {
  const [post] = await rows(
    `SELECT p.id, p.title, p.body, p.kind, p.spoiler, p.created_at, p.edited_at,
       p.like_count, p.comment_count, u.username
     FROM posts p JOIN users u ON u.id = p.user_id
     WHERE p.id = $1 AND u.banned_at IS NULL`,
    [id],
  )
  if (!post) return null
  const tags = await rows(
    `SELECT c.id, c.kind, c.name, c.image_path FROM post_tags t JOIN content c ON c.id = t.content_id
     WHERE t.post_id = $1 ORDER BY t.is_top DESC, t.id`,
    [id],
  )
  const kind = POST_KIND_LABELS[post.kind] || 'Post'
  const text = stripFormatting(post.body).replace(/\s+/g, ' ').trim()
  const about = tags.map((tag) => contentDisplayName(tag.kind, tag.name)).join(', ')
  const description = post.spoiler
    ? `${kind} by ${post.username}${about ? ` about ${about}` : ''}. Contains spoilers.`
    : text
  const path = detailPath('/forum/post', post.id, post.title)
  const image = imageUrl(tags.find((tag) => tag.image_path)?.image_path)
  const author = {
    '@type': 'Person',
    name: post.username,
    url: `/u/${encodeURIComponent(post.username)}`,
  }
  return {
    title: post.title,
    description,
    path,
    image,
    type: 'article',
    robots: null,
    heading: post.title,
    intro: `${kind} by ${post.username}\n\n${post.spoiler ? description : text}`,
    sections: tags.length ? [{ title: 'About', links: tags.map(link) }] : [],
    jsonLd: [
      {
        '@context': 'https://schema.org',
        '@type': 'DiscussionForumPosting',
        headline: post.title,
        text: post.spoiler ? description : text,
        url: path,
        datePublished: new Date(post.created_at).toISOString(),
        ...(post.edited_at ? { dateModified: new Date(post.edited_at).toISOString() } : {}),
        author,
        ...(image ? { image } : {}),
        ...(about
          ? {
              about: tags.map((tag) => ({
                '@type': 'Thing',
                name: contentDisplayName(tag.kind, tag.name),
              })),
            }
          : {}),
        interactionStatistic: [
          {
            '@type': 'InteractionCounter',
            interactionType: 'https://schema.org/LikeAction',
            userInteractionCount: Number(post.like_count || 0),
          },
          {
            '@type': 'InteractionCounter',
            interactionType: 'https://schema.org/CommentAction',
            userInteractionCount: Number(post.comment_count || 0),
          },
        ],
      },
      breadcrumbList([HOME_CRUMB, { name: 'Forum', path: '/forum' }, { name: post.title, path }]),
    ],
  }
}

/**
 * Make every in-site URL in the page absolute (`url` and breadcrumb `item` fields in
 * schema.org data).
 * @param {object} page
 * @param {string} base - Site origin.
 */
function absolutize(page, base) {
  const fix = (value) => {
    if (Array.isArray(value)) return value.map(fix)
    if (!value || typeof value !== 'object') return value
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [
        key,
        (key === 'url' || key === 'item') && typeof item === 'string' && item.startsWith('/')
          ? base + item
          : fix(item),
      ]),
    )
  }
  return {
    ...page,
    description: metaDescription(page.description),
    canonical: base + page.path,
    jsonLd: page.jsonLd ? fix(page.jsonLd) : null,
  }
}

/** path → { at, value } */
const cache = new Map()

/**
 * Search-engine view of a public page.
 * @param {string} path - Requested pathname.
 * @param {string} base - Site origin for canonical links.
 * @returns {Promise<{ found: boolean, page?: object } | null>} null when the path isn't a
 *   page this service describes; `found: false` when it is, but nothing exists there.
 */
export async function describePage(path, base) {
  const parsed = parsePagePath(path)
  if (!parsed) return null
  const key = `${base}|${parsed.type}|${parsed.key || parsed.prefix || ''}|${parsed.id || ''}`
  const hit = cache.get(key)
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.value

  let page = null
  if (parsed.type === 'static') page = await staticPage(parsed.key)
  else if (parsed.type === 'post') page = await postPage(parsed.id)
  else page = await contentPage(parsed)
  const value = page ? { found: true, page: absolutize(page, base) } : { found: false }

  if (cache.size >= CACHE_MAX) cache.delete(cache.keys().next().value)
  cache.set(key, { at: Date.now(), value })
  return value
}

export default { describePage, parsePagePath, imageUrl, metaDescription }
