/**
 * Link catalog titles to AniList and merge the duplicate titles AniList reveals.
 *
 * Domain service used by `scripts/reloadCatalog.js`. MAL titles are linked by
 * their MAL id in batches. TMDB-only East Asian titles are searched by name;
 * when the AniList match names a MAL entry that another catalog row already
 * holds, the TMDB row is merged into that row, otherwise it adopts the MAL id.
 */
import { query } from '../../config/postgres.js'
import Content from '../models/Content.js'
import { anilistSearchInput } from './contentSyncService.js'
import { ANILIST_ORIGIN_COUNTRIES, fetchAnilistMediaBatch, findAnilistMatch } from './anilistService.js'
import { mergeDuplicateWork } from './catalogRepair.js'

const WATCHABLE = `('movie', 'series', 'special')`

/**
 * Set a title's external id when unset and unowned within its kind.
 * @param {string} id
 * @param {'anilist_id' | 'mal_id' | 'tmdb_id'} column
 * @param {number} value
 * @returns {Promise<boolean>}
 */
export async function claimExternalId(id, column, value) {
  const { rowCount } = await query(
    `UPDATE content c SET ${column} = $2, updated_at = now()
     WHERE c.id = $1 AND c.${column} IS NULL AND c.kind IN ${WATCHABLE}
       AND NOT EXISTS (SELECT 1 FROM content o WHERE o.kind = c.kind AND o.${column} = $2)`,
    [id, value],
  )
  return rowCount > 0
}

/**
 * Store AniList ids on MAL titles that lack one (25 titles per request).
 * @param {{ limit?: number | null }} [options]
 * @returns {Promise<{ checked: number, linked: number, missing: number }>}
 */
export async function linkMalTitles({ limit = null } = {}) {
  const { rows } = await query(
    `SELECT id::text AS id, mal_id FROM content
     WHERE kind IN ${WATCHABLE} AND mal_id IS NOT NULL AND anilist_id IS NULL
     ORDER BY mal_id`,
  )
  const list = limit ? rows.slice(0, limit) : rows
  const media = await fetchAnilistMediaBatch({ malIds: list.map((row) => row.mal_id) })
  const byMal = new Map(media.map((item) => [Number(item.idMal), item]))
  let linked = 0
  for (const row of list) {
    const match = byMal.get(Number(row.mal_id))
    if (match && (await claimExternalId(row.id, 'anilist_id', match.id))) linked += 1
  }
  return { checked: list.length, linked, missing: list.length - byMal.size }
}

/**
 * Whether a TMDB row may merge into a MAL row of this kind without making the
 * TMDB id ambiguous (a special re-fetches TMDB as a movie first).
 * @param {string} tmdbKind
 * @param {string} malKind
 * @returns {boolean}
 */
function kindsMergeable(tmdbKind, malKind) {
  return tmdbKind === malKind || (tmdbKind === 'movie' && malKind === 'special')
}

/**
 * Find AniList matches for TMDB-only East Asian titles, then merge each into
 * the MAL title AniList points at, or adopt the MAL id when no row holds it.
 * @param {{ limit?: number | null, log?: (message: string) => void }} [options]
 * @returns {Promise<{ stats: Record<string, number>, changed: string[] }>}
 */
export async function bridgeTmdbTitles({ limit = null, log = () => {} } = {}) {
  const { rows } = await query(
    `SELECT id::text AS id, kind FROM works
     WHERE mal_id IS NULL AND anilist_id IS NULL AND tmdb_id IS NOT NULL
       AND origin_country = ANY($1::text[])
     ORDER BY popularity DESC NULLS LAST`,
    [[...ANILIST_ORIGIN_COUNTRIES]],
  )
  const list = limit ? rows.slice(0, limit) : rows
  const stats = { checked: 0, unmatched: 0, merged: 0, linked: 0, conflicts: 0 }
  const changed = []

  for (const row of list) {
    stats.checked += 1
    const content = await Content.findById(row.id)
    if (!content) continue
    const match = await findAnilistMatch(anilistSearchInput(content))
    if (!match) {
      stats.unmatched += 1
      continue
    }
    const malId = Number(match.idMal) > 0 ? Number(match.idMal) : null
    const { rows: owners } = malId
      ? await query(
          `SELECT id::text AS id, kind, tmdb_id FROM content
           WHERE kind IN ${WATCHABLE} AND mal_id = $1 AND id <> $2
           ORDER BY (kind = $3) DESC LIMIT 1`,
          [malId, row.id, row.kind],
        )
      : { rows: [] }
    const owner = owners[0]

    if (owner) {
      const tmdbClash = owner.tmdb_id != null && Number(owner.tmdb_id) !== Number(content.tmdbId)
      if (tmdbClash || !kindsMergeable(row.kind, owner.kind)) {
        stats.conflicts += 1
        continue
      }
      await mergeDuplicateWork(row.id, owner.id)
      await claimExternalId(owner.id, 'anilist_id', match.id)
      log(`  merged "${content.title}" (TMDB ${content.tmdbId}) into MAL ${malId}`)
      stats.merged += 1
      changed.push(owner.id)
      continue
    }

    await claimExternalId(row.id, 'anilist_id', match.id)
    if (malId && anilistKindFits(row.kind, match)) await claimExternalId(row.id, 'mal_id', malId)
    stats.linked += 1
    changed.push(row.id)
  }
  return { stats, changed }
}

/**
 * A TMDB series/movie adopts a MAL id only for the same broad format.
 * @param {string} kind
 * @param {object} media
 * @returns {boolean}
 */
function anilistKindFits(kind, media) {
  const format = String(media?.format || '')
  if (kind === 'movie') return format === 'MOVIE'
  return ['TV', 'TV_SHORT', 'ONA'].includes(format)
}
