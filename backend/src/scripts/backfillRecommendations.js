/**
 * One-off backfill for `content_recommendations`: AniList's and TMDB's recommendation
 * links for every watchable that has none from that source yet (catalog imports and
 * refreshes keep them current after). Safe to stop and rerun; it picks up where it left off.
 *
 *   npm run db:backfill-recommendations -- --dry-run   # count what would be fetched
 *   npm run db:backfill-recommendations
 *   npm run db:backfill-recommendations -- --limit=500
 */
import dotenv from 'dotenv'
import { connectPostgres, closePostgres, query } from '../../config/postgres.js'
import { fetchAnilistRecommendationsBatch } from '../services/anilistService.js'
import unifiedContentService from '../services/unifiedContentService.js'
import { writeRecommendationLinks } from '../services/catalogImport.js'
import {
  anilistRecommendationLinks,
  tmdbRecommendationLinks,
} from '../utils/recommendationLinks.js'

dotenv.config()

const dryRun = process.argv.includes('--dry-run')
const limitArg = process.argv.find((arg) => arg.startsWith('--limit='))
const limit = limitArg ? Math.max(1, Number(limitArg.split('=')[1]) || 0) : null
const ANILIST_CHUNK = 50

/** Watchables with an id on `source` and no links from it yet, most popular first. */
async function missing(source) {
  const idColumn = source === 'anilist' ? 'anilist_id' : 'tmdb_id'
  const kinds = source === 'anilist' ? ['season', 'movie', 'special'] : ['movie', 'series']
  const { rows } = await query(
    `SELECT w.id::text AS id, w.${idColumn} AS external_id, w.kind
     FROM works w
     WHERE w.kind = ANY($1::text[]) AND w.${idColumn} IS NOT NULL
       AND NOT EXISTS (
         SELECT 1 FROM content_recommendations cr WHERE cr.content_id = w.id AND cr.source = $2
       )
     ORDER BY w.popularity DESC NULLS LAST
     ${limit ? `LIMIT ${limit}` : ''}`,
    [kinds, source],
  )
  return rows
}

async function backfillAnilist() {
  const rows = await missing('anilist')
  console.log(`AniList: ${rows.length} titles without links`)
  if (dryRun) return
  let written = 0
  for (let i = 0; i < rows.length; i += ANILIST_CHUNK) {
    const chunk = rows.slice(i, i + ANILIST_CHUNK)
    const media = await fetchAnilistRecommendationsBatch(chunk.map((row) => row.external_id))
    const byId = new Map(media.map((item) => [Number(item.id), item]))
    for (const row of chunk) {
      const item = byId.get(Number(row.external_id))
      if (!item) continue
      written += await writeRecommendationLinks(row.id, {
        anilist: anilistRecommendationLinks(item),
      })
    }
    console.log(
      `AniList: ${Math.min(i + ANILIST_CHUNK, rows.length)}/${rows.length} titles, ${written} links`,
    )
  }
}

async function backfillTmdb() {
  const rows = await missing('tmdb')
  console.log(`TMDB: ${rows.length} titles without links`)
  if (dryRun) return
  let written = 0
  for (const [index, row] of rows.entries()) {
    const type = row.kind === 'movie' ? 'movie' : 'tv'
    const details = await unifiedContentService.getTmdbRecommendations(row.external_id, type)
    if (details) {
      written += await writeRecommendationLinks(row.id, {
        tmdb: tmdbRecommendationLinks(details, type),
      })
    }
    if ((index + 1) % 100 === 0 || index + 1 === rows.length) {
      console.log(`TMDB: ${index + 1}/${rows.length} titles, ${written} links`)
    }
  }
}

async function backfillRecommendations() {
  try {
    await connectPostgres()
    await backfillAnilist()
    await backfillTmdb()
  } catch (error) {
    console.error('Recommendation backfill failed:', error)
    process.exitCode = 1
  } finally {
    await closePostgres()
  }
}

backfillRecommendations()
