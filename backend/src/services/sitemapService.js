/**
 * Sitemaps for search engines: an index at /sitemap.xml and one child sitemap per
 * section (main pages and forum posts, titles, franchises, characters, voice actors,
 * studios). Large sections are split into numbered files.
 *
 * Layer: domain service. The site serves `/sitemap.xml` and `/sitemaps/*` from the API
 * through vercel.json; robots.txt points at the index.
 */

import { query } from '../../config/postgres.js'
import { sitemapPosts } from './forumService.js'
import { contentPagePath, detailPath } from '../utils/slug.js'
import { indexableSql } from '../utils/seoIndexing.js'

/** URLs per child sitemap (the protocol allows 50,000). */
export const SITEMAP_CHUNK = 40000

/** Public pages listed besides forum posts and catalog pages. */
export const SITEMAP_PAGES = ['/', '/forum', '/movies', '/tv', '/search']

/**
 * Catalog sections and the content kinds each lists. Only pages worth indexing are
 * listed (utils/seoIndexing.js); paths carry the readable slug (utils/slug.js).
 */
export const SITEMAP_SECTIONS = {
  titles: { kinds: ['movie', 'series', 'special'] },
  franchises: { kinds: ['franchise'] },
  characters: { kinds: ['character'] },
  'voice-actors': { kinds: ['voice'] },
  studios: { kinds: ['studio'] },
}

/** `&`, `<`, `>`, quotes escaped for XML text. */
const xmlEscape = (value) =>
  String(value).replace(
    /[&<>"']/g,
    (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[char],
  )

const lastmod = (value) => {
  const date = value ? new Date(value) : null
  return date && !Number.isNaN(date.getTime()) ? `<lastmod>${date.toISOString()}</lastmod>` : ''
}

/**
 * A `<urlset>` document.
 * @param {string} base - Site origin, no trailing slash.
 * @param {Array<{ path: string, lastModified?: Date | string | null }>} entries
 * @returns {string}
 */
export function urlsetXml(base, entries) {
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ...entries.map(
      (entry) =>
        `  <url><loc>${xmlEscape(base + entry.path)}</loc>${lastmod(entry.lastModified)}</url>`,
    ),
    '</urlset>',
  ].join('\n')
}

/**
 * A `<sitemapindex>` document.
 * @param {string} base
 * @param {string[]} files - Child sitemap file names under /sitemaps/.
 * @returns {string}
 */
export function sitemapIndexXml(base, files) {
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ...files.map(
      (file) => `  <sitemap><loc>${xmlEscape(`${base}/sitemaps/${file}`)}</loc></sitemap>`,
    ),
    '</sitemapindex>',
  ].join('\n')
}

/**
 * Child sitemap file names: `pages.xml`, then `<section>-<n>.xml` per chunk of rows.
 * @param {Record<string, number>} counts - Rows per section.
 * @returns {string[]}
 */
export function sitemapFiles(counts) {
  const files = ['pages.xml']
  for (const section of Object.keys(SITEMAP_SECTIONS)) {
    const chunks = Math.ceil((counts[section] || 0) / SITEMAP_CHUNK)
    for (let n = 1; n <= chunks; n += 1) files.push(`${section}-${n}.xml`)
  }
  return files
}

/**
 * Which section and chunk a child file name refers to.
 * @param {string} file - e.g. `titles-2.xml`.
 * @returns {{ section: 'pages' } | { section: string, chunk: number } | null}
 */
export function parseSitemapFile(file) {
  if (file === 'pages.xml') return { section: 'pages' }
  const match = /^([a-z-]+)-([1-9]\d{0,4})\.xml$/.exec(String(file))
  if (!match || !SITEMAP_SECTIONS[match[1]]) return null
  return { section: match[1], chunk: Number(match[2]) }
}

/** Indexable rows per catalog section. */
async function sectionCounts() {
  const counts = {}
  for (const [section, { kinds }] of Object.entries(SITEMAP_SECTIONS)) {
    const { rows } = await query(
      `SELECT count(*)::int AS count FROM content c WHERE c.kind = ANY ($1) AND ${indexableSql(kinds)}`,
      [kinds],
    )
    counts[section] = rows[0]?.count || 0
  }
  return counts
}

/**
 * The sitemap index.
 * @param {string} base - Site origin.
 * @returns {Promise<string>}
 */
export async function buildSitemapIndex(base) {
  return sitemapIndexXml(base, sitemapFiles(await sectionCounts()))
}

/**
 * One child sitemap.
 * @param {string} base - Site origin.
 * @param {string} file - File name under /sitemaps/.
 * @returns {Promise<string | null>} null when there is no such file.
 */
export async function buildSitemapFile(base, file) {
  const parsed = parseSitemapFile(file)
  if (!parsed) return null
  if (parsed.section === 'pages') {
    const posts = await sitemapPosts()
    return urlsetXml(base, [
      ...SITEMAP_PAGES.map((path) => ({ path })),
      ...posts.map((post) => ({
        path: detailPath('/forum/post', post.id, post.title),
        lastModified: post.lastModified,
      })),
    ])
  }
  const { kinds } = SITEMAP_SECTIONS[parsed.section]
  const { rows } = await query(
    `SELECT c.id, c.kind, c.name, c.updated_at FROM content c
     WHERE c.kind = ANY ($1) AND ${indexableSql(kinds)}
     ORDER BY c.created_at, c.id LIMIT $2 OFFSET $3`,
    [kinds, SITEMAP_CHUNK, (parsed.chunk - 1) * SITEMAP_CHUNK],
  )
  if (!rows.length) return null
  return urlsetXml(
    base,
    rows.map((row) => ({ path: contentPagePath(row), lastModified: row.updated_at })),
  )
}

export default { buildSitemapIndex, buildSitemapFile }
