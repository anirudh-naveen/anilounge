/**
 * Merged catalog pages: when a duplicate title, character, voice actor, or studio is
 * merged into another, its old URL should keep working and pass its search ranking on,
 * so search engines get a permanent redirect (301) to the merged page instead of a 404.
 *
 * Layer: domain service. The merges (services/catalogRepair.js,
 * services/characterMerge.js) call `recordMove` before deleting the old row;
 * services/seoService.js follows the move when a page's record is gone, and the site
 * middleware redirects to that page's canonical URL. Both URLs go to IndexNow.
 *
 * The `content_moves` table comes from db/schema.sql (`npm run db:schema`); until it
 * exists, merges work as before and old URLs return 404.
 */

import { query } from '../../config/postgres.js'
import { indexablePaths, indexNowEnabled, queuePaths } from './indexNowService.js'

/** Whether `content_moves` exists (checked once; a missing table can't abort a merge). */
let available = null

async function movesTable() {
  if (available === null) {
    const { rows } = await query(`SELECT to_regclass('content_moves') IS NOT NULL AS ok`)
    available = Boolean(rows[0]?.ok)
  }
  return available
}

/**
 * Record that `fromId` was merged into `toId`, and queue both pages for IndexNow.
 * Call before deleting the `fromId` row (its path is read from it). Pages already moved
 * to `fromId` now point at `toId`, so a redirect never takes two hops.
 * @param {string} fromId
 * @param {string} toId
 * @returns {Promise<void>}
 */
export async function recordMove(fromId, toId) {
  if (!fromId || !toId || String(fromId) === String(toId)) return
  if (indexNowEnabled()) queuePaths(await indexablePaths([fromId, toId]))
  if (!(await movesTable())) return
  await query('UPDATE content_moves SET to_id = $2 WHERE to_id = $1', [fromId, toId])
  await query(
    `INSERT INTO content_moves (from_id, to_id) VALUES ($1, $2)
     ON CONFLICT (from_id) DO UPDATE SET to_id = EXCLUDED.to_id, moved_at = now()`,
    [fromId, toId],
  )
}

/**
 * Where a merged page went.
 * @param {string} id - A catalog id with no row.
 * @returns {Promise<string | null>} The id it was merged into, or null.
 */
export async function movedTo(id) {
  if (!(await movesTable())) return null
  const { rows } = await query('SELECT to_id FROM content_moves WHERE from_id = $1', [id])
  return rows[0] ? String(rows[0].to_id) : null
}

export default { recordMove, movedTo }
