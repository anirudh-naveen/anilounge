/**
 * Submit every sitemap URL to IndexNow once (Bing, Yandex, Naver, Seznam, Yep). After
 * that the server submits new titles and forum posts on its own
 * (services/indexNowService.js).
 *
 * Uses the key the live site publishes, so it works from any machine whose
 * DATABASE_URL is production:
 *   npm --prefix backend run indexnow:submit-all
 *   npm --prefix backend run indexnow:submit-all -- --dry-run
 * SITE_URL overrides the site (default https://www.anilounge.net).
 */

import dotenv from 'dotenv'
import { closePostgres } from '../../config/postgres.js'
import { listSitemapUrls } from '../services/sitemapService.js'
import { KEY_PATH, submitUrls } from '../services/indexNowService.js'

dotenv.config()

const base = (process.env.SITE_URL || 'https://www.anilounge.net').replace(/\/+$/, '')
const dryRun = process.argv.includes('--dry-run')

try {
  const keyResponse = await fetch(`${base}${KEY_PATH}`)
  const key = (await keyResponse.text()).trim()
  if (!keyResponse.ok || !/^[a-zA-Z0-9-]{8,128}$/.test(key)) {
    throw new Error(`${base}${KEY_PATH} didn't return a key (${keyResponse.status}). Deploy first.`)
  }
  const urls = await listSitemapUrls(base)
  console.log(`${urls.length} URLs from the sitemaps (key ${key.slice(0, 6)}…).`)
  if (dryRun) {
    console.log(urls.slice(0, 5).join('\n'), '\n… dry run, nothing sent.')
  } else {
    const statuses = await submitUrls(urls, { base, key })
    console.log(`IndexNow responses: ${statuses.join(', ')} (200/202 = accepted).`)
  }
} catch (error) {
  console.error(error.message)
  process.exitCode = 1
} finally {
  await closePostgres()
}
