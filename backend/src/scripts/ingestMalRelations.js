/**
 * Fetch MAL related_anime for catalog titles and write typed content_relations.
 * Layer: CLI migration. Does not invent edges from genre or title regex.
 *
 * Usage: npm run db:ingest-relations
 * Requires DATABASE_URL and MAL_CLIENT_ID.
 */

import dotenv from 'dotenv'
import { query, closePostgres, connectPostgres } from '../../config/postgres.js'

dotenv.config()

const KIND_BY_MAL = {
  sequel: 'sequel',
  prequel: 'prequel',
  side_story: 'side_story',
  parent_story: 'parent_story',
  alternative_setting: 'alternative_setting',
  alternative_version: 'alternative_version',
  summary: 'summary',
  full_story: 'full_story',
}

const DELAY_MS = 350

/**
 * @param {number} ms
 * @returns {Promise<void>}
 */
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * @param {unknown} relationType
 * @returns {string}
 */
function kindFromMal(relationType) {
  const key = String(relationType || '').toLowerCase()
  return KIND_BY_MAL[key] || 'other'
}

/**
 * @param {number} malId
 * @returns {Promise<object[]>}
 */
async function fetchRelatedAnime(malId) {
  const url = `https://api.myanimelist.net/v2/anime/${malId}?fields=related_anime`
  const response = await fetch(url, {
    headers: { 'X-MAL-CLIENT-ID': process.env.MAL_CLIENT_ID || '' },
  })
  if (response.status === 429) {
    await sleep(2000)
    return fetchRelatedAnime(malId)
  }
  if (!response.ok) {
    console.warn(`MAL ${malId} failed: ${response.status}`)
    return []
  }
  const body = await response.json()
  return Array.isArray(body.related_anime) ? body.related_anime : []
}

/**
 * @returns {Promise<void>}
 */
async function ingest() {
  if (!process.env.DATABASE_URL || !process.env.MAL_CLIENT_ID) {
    console.error('DATABASE_URL and MAL_CLIENT_ID are required')
    process.exit(1)
  }

  await connectPostgres()
  const { rows: titles } = await query(
    `SELECT id, title, mal_id FROM content WHERE mal_id IS NOT NULL ORDER BY mal_id`,
  )
  const byMal = new Map(titles.map((row) => [Number(row.mal_id), row.id]))
  console.log(`Ingesting MAL relations for ${titles.length} titles`)

  let edges = 0
  let skipped = 0
  let processed = 0

  for (const title of titles) {
    processed += 1
    const related = await fetchRelatedAnime(Number(title.mal_id))
    await sleep(DELAY_MS)

    await query(`DELETE FROM content_relations WHERE from_id = $1 AND source = 'mal'`, [title.id])

    const seen = new Set()
    for (const relation of related) {
      const toId = byMal.get(Number(relation.node?.id))
      if (!toId || toId === title.id) {
        skipped += 1
        continue
      }
      const kind = kindFromMal(relation.relation_type)
      const key = `${toId}:${kind}`
      if (seen.has(key)) continue
      seen.add(key)
      await query(
        `INSERT INTO content_relations (from_id, to_id, kind, source)
         VALUES ($1, $2, $3, 'mal')
         ON CONFLICT (from_id, to_id, kind) DO NOTHING`,
        [title.id, toId, kind],
      )
      edges += 1
    }

    if (processed % 50 === 0) {
      console.log(`  ${processed}/${titles.length} titles, ${edges} edges`)
    }
  }

  const { rows: count } = await query('SELECT count(*)::int AS n FROM content_relations')
  console.log(`Done. wrote=${edges} skipped_missing=${skipped} table_total=${count[0].n}`)
  await closePostgres()
}

ingest().catch(async (error) => {
  console.error(error)
  await closePostgres()
  process.exit(1)
})
