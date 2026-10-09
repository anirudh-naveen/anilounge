/**
 * IndexNow: tell Bing (and Yandex, Naver, Seznam, Yep, which share submissions) when a
 * page is new, changed, or gone, instead of waiting for them to recrawl.
 *
 * Layer: domain service. New titles (the `title-added` catalog event) and forum posts
 * (created, edited, deleted) are queued and sent once a minute in one request. Only
 * pages worth indexing are sent (utils/seoIndexing.js), at their canonical URLs
 * (utils/slug.js). Routine sync updates (scores, airing dates) are not: IndexNow asks
 * for meaningful changes only.
 *
 * The key proves the site is ours: it's served at `/indexnow-key.txt` (server.js, via
 * vercel.json). INDEXNOW_KEY sets it; otherwise it's derived from JWT_SECRET, so every
 * instance agrees without any setup. On by default in production only
 * (INDEXNOW_ENABLED=true/false overrides), so local runs never submit localhost URLs.
 */

import crypto from 'node:crypto'
import { query } from '../../config/postgres.js'
import catalogEvents from './catalogEvents.js'
import { appUrl } from './emailService.js'
import { INDEXABLE_SQL } from '../utils/seoIndexing.js'
import { contentPagePath, detailPath } from '../utils/slug.js'

export const INDEXNOW_ENDPOINT = 'https://api.indexnow.org/indexnow'
/** Path of the key file on the site. */
export const KEY_PATH = '/indexnow-key.txt'
/** URLs per request (the protocol's limit). */
export const BATCH_MAX = 10000
const FLUSH_DELAY_MS = 60 * 1000

/**
 * The site's IndexNow key: INDEXNOW_KEY when valid, else derived from JWT_SECRET.
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {string | null}
 */
export function indexNowKey(env = process.env) {
  const configured = String(env.INDEXNOW_KEY || '').trim()
  if (/^[a-zA-Z0-9-]{8,128}$/.test(configured)) return configured
  if (!env.JWT_SECRET) return null
  // One-way, so the published key says nothing about the secret.
  return crypto
    .createHash('sha256')
    .update(`anilounge-indexnow:${env.JWT_SECRET}`)
    .digest('hex')
    .slice(0, 32)
}

/**
 * Whether this server submits URLs.
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {boolean}
 */
export function indexNowEnabled(env = process.env) {
  if (env.INDEXNOW_ENABLED === 'true') return true
  if (env.INDEXNOW_ENABLED === 'false') return false
  return env.NODE_ENV === 'production'
}

/**
 * Send URLs to IndexNow, in batches of BATCH_MAX.
 * @param {string[]} urls - Absolute URLs on `base`.
 * @param {{ base?: string, key?: string | null, fetchImpl?: typeof fetch }} [options]
 * @returns {Promise<number[]>} HTTP status per batch (200/202 accepted).
 */
export async function submitUrls(
  urls,
  { base = appUrl(), key = indexNowKey(), fetchImpl = fetch } = {},
) {
  if (!key || !urls.length) return []
  const statuses = []
  for (let start = 0; start < urls.length; start += BATCH_MAX) {
    const response = await fetchImpl(INDEXNOW_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
      body: JSON.stringify({
        host: new URL(base).host,
        key,
        keyLocation: `${base}${KEY_PATH}`,
        urlList: urls.slice(start, start + BATCH_MAX),
      }),
    })
    statuses.push(response.status)
  }
  return statuses
}

/** In-site paths waiting to be sent. */
const queue = new Set()
let timer = null

async function flush() {
  timer = null
  const base = appUrl()
  const urls = [...queue].map((path) => base + path)
  queue.clear()
  try {
    const statuses = await submitUrls(urls, { base })
    if (statuses.some((status) => status !== 200 && status !== 202)) {
      console.warn(`IndexNow: ${urls.length} URLs, responses ${statuses.join(', ')}`)
    }
  } catch (error) {
    console.error('IndexNow submission failed:', error.message)
  }
}

/**
 * Queue in-site paths for the next submission (about a minute later). No-op unless
 * enabled with a key.
 * @param {string[]} paths
 */
export function queuePaths(paths) {
  if (!indexNowEnabled() || !indexNowKey()) return
  for (const path of paths) if (path) queue.add(path)
  if (!timer && queue.size) {
    timer = setTimeout(flush, FLUSH_DELAY_MS)
    timer.unref?.()
  }
}

/**
 * Queue catalog pages by id, skipping pages that aren't indexed (thin pages).
 * @param {string[]} ids
 * @returns {Promise<void>} Never rejects.
 */
export async function queueContent(ids) {
  if (!ids.length || !indexNowEnabled()) return
  try {
    const indexable = Object.entries(INDEXABLE_SQL)
      .map(([kind, sql]) => `WHEN '${kind}' THEN ${sql}`)
      .join(' ')
    const { rows } = await query(
      `SELECT c.id, c.kind, c.name FROM content c
       WHERE c.id = ANY ($1::uuid[]) AND (CASE c.kind ${indexable} ELSE false END)`,
      [ids],
    )
    queuePaths(rows.map(contentPagePath))
  } catch (error) {
    console.error('IndexNow: could not queue content:', error.message)
  }
}

/**
 * Queue a forum post's page (new, edited, or deleted: search engines then recrawl it).
 * @param {{ id: string, title: string }} post
 */
export function queuePost(post) {
  if (post?.id) queuePaths([detailPath('/forum/post', String(post.id), post.title)])
}

/** Submit new titles as the catalog sync adds them. */
export function startIndexNow() {
  if (!indexNowEnabled()) return
  if (!indexNowKey()) {
    console.warn('IndexNow is off: set INDEXNOW_KEY or JWT_SECRET.')
    return
  }
  catalogEvents.on('title-added', (id) => void queueContent([id]))
}

export default {
  indexNowKey,
  indexNowEnabled,
  submitUrls,
  queuePaths,
  queueContent,
  queuePost,
  startIndexNow,
}
