/**
 * Catalog integrity repair for the content supertype schema.
 *
 * Domain service used by `scripts/reloadCatalog.js`: snapshots catalog tables,
 * restores titles/franchises that were overwritten by character saves, rebuilds
 * studio credits that point at mis-named studio rows, drops link rows that
 * violate the subtype rules in `db/schema.sql`, and prunes orphaned people.
 */
import { query, withTransaction } from '../../config/postgres.js'
import { titleKeySql } from '../db/mongoFilter.js'
import Content from '../models/Content.js'
import { foldEntityName, studioNameKey } from '../utils/entities.js'
import { moveWatchHistory } from './watchEvents.js'

const WATCHABLE = `('movie', 'series', 'special')`

const BACKUP_TABLES = [
  'content',
  'movies',
  'series',
  'specials',
  'franchises',
  'franchise_members',
  'characters',
  'voices',
  'studios',
  'appearances',
  'voice_credits',
  'studio_credits',
  'content_relations',
  'content_akas',
  'content_genres',
  'genres',
  'watchlist',
  'ratings',
  'favorites',
]

const SUBTYPE_TABLES = [
  ['movies', 'movie'],
  ['series', 'series'],
  ['specials', 'special'],
  ['franchises', 'franchise'],
  ['characters', 'character'],
  ['voices', 'voice'],
  ['studios', 'studio'],
]

/**
 * @param {string} name
 * @returns {Promise<boolean>}
 */
async function tableExists(name) {
  const { rows } = await query('SELECT to_regclass($1) IS NOT NULL AS ok', [`public.${name}`])
  return Boolean(rows[0]?.ok)
}

/**
 * Copy catalog and user-link tables into a fresh `backup_<stamp>` schema.
 * @param {Date} [now]
 * @returns {Promise<string>} Schema name.
 */
export async function backupCatalog(now = new Date()) {
  const stamp = now.toISOString().replace(/[-:]/g, '').replace('T', '_').slice(0, 13)
  const schema = `backup_${stamp}`
  await withTransaction(async () => {
    await query(`CREATE SCHEMA ${schema}`)
    for (const table of BACKUP_TABLES) {
      await query(`CREATE TABLE ${schema}.${table} AS TABLE public.${table}`)
    }
  })
  return schema
}

/**
 * Move user/link rows from one watchable onto another, then delete the source.
 * @param {string} fromId
 * @param {string} toId
 * @returns {Promise<void>}
 */
export async function mergeWorkInto(fromId, toId) {
  await moveWatchHistory(fromId, toId)
  await query(
    `INSERT INTO watchlist (user_id, content_id, status, current_episode, previous_episode, current_season, notes, added_at, updated_at)
     SELECT user_id, $2, status, current_episode, previous_episode, current_season, notes, added_at, updated_at
     FROM watchlist WHERE content_id = $1
     ON CONFLICT DO NOTHING`,
    [fromId, toId],
  )
  await query(
    `INSERT INTO ratings (user_id, content_id, score, review, rated_at)
     SELECT user_id, $2, score, review, rated_at FROM ratings WHERE content_id = $1
     ON CONFLICT DO NOTHING`,
    [fromId, toId],
  )
  await query(
    `INSERT INTO favorites (user_id, content_id, added_at)
     SELECT user_id, $2, added_at FROM favorites WHERE content_id = $1
     ON CONFLICT DO NOTHING`,
    [fromId, toId],
  )
  await query('UPDATE posts SET content_id = $2 WHERE content_id = $1', [fromId, toId])
  await query(
    `UPDATE appearances a SET work_id = $2
     WHERE a.work_id = $1
       AND NOT EXISTS (
         SELECT 1 FROM appearances b WHERE b.work_id = $2 AND b.character_id = a.character_id
       )`,
    [fromId, toId],
  )
  await query(
    `INSERT INTO studio_credits (work_id, studio_id)
     SELECT $2, studio_id FROM studio_credits WHERE work_id = $1
     ON CONFLICT DO NOTHING`,
    [fromId, toId],
  )
  await query(
    `INSERT INTO content_relations (from_id, to_id, kind, source)
     SELECT $2, to_id, kind, source FROM content_relations WHERE from_id = $1 AND to_id <> $2
     ON CONFLICT DO NOTHING`,
    [fromId, toId],
  )
  await query(
    `INSERT INTO content_relations (from_id, to_id, kind, source)
     SELECT from_id, $2, kind, source FROM content_relations WHERE to_id = $1 AND from_id <> $2
     ON CONFLICT DO NOTHING`,
    [fromId, toId],
  )
  await query(
    `UPDATE franchise_members SET member_id = $2
     WHERE member_id = $1
       AND NOT EXISTS (SELECT 1 FROM franchise_members WHERE member_id = $2)`,
    [fromId, toId],
  )
  await query('DELETE FROM content WHERE id = $1', [fromId])
}

/**
 * Fill the target's missing MAL/TMDB/AniList ids from a (deleted) source row's
 * values, skipping ids another row of the target's kind already owns.
 * @param {string} toId
 * @param {{ mal_id?: number, tmdb_id?: number, anilist_id?: number }} source
 * @returns {Promise<void>}
 */
async function carryExternalIds(toId, source) {
  for (const column of ['mal_id', 'tmdb_id', 'anilist_id']) {
    if (source?.[column] == null) continue
    await query(
      `UPDATE content t SET ${column} = $2, updated_at = now()
       WHERE t.id = $1 AND t.${column} IS NULL
         AND NOT EXISTS (SELECT 1 FROM content o WHERE o.kind = t.kind AND o.${column} = $2)`,
      [toId, source[column]],
    )
  }
}

/**
 * Merge a duplicate title (same anime listed by two sources) into the kept
 * row in one transaction: user and link rows move, the duplicate's names
 * become aliases, and its external ids fill the kept row's gaps.
 * @param {string} fromId
 * @param {string} toId
 * @returns {Promise<void>}
 */
export async function mergeDuplicateWork(fromId, toId) {
  if (!fromId || !toId || String(fromId) === String(toId)) return
  await withTransaction(async () => {
    const { rows } = await query(
      `SELECT mal_id, tmdb_id, anilist_id FROM content
       WHERE id = $1 AND kind IN ${WATCHABLE}`,
      [fromId],
    )
    if (!rows[0]) return
    await query(
      `INSERT INTO content_akas (content_id, name)
       SELECT $2::uuid, name FROM content WHERE id = $1
       UNION
       SELECT $2::uuid, name FROM content_akas WHERE content_id = $1
       ON CONFLICT DO NOTHING`,
      [fromId, toId],
    )
    await mergeWorkInto(fromId, toId)
    await carryExternalIds(toId, rows[0])
  })
}

/**
 * Merge titles already stored twice under names that differ only by case or
 * spacing ("Re:Zero" / "RE: ZERO"). Candidate pairs share a name key within a
 * kind; `isSame` makes the final call (years, genres, seasons, external ids).
 * Keeps the row with a MAL id, then a TMDB id, then the older row.
 * @param {(left: object, right: object) => boolean} isSame
 * @returns {Promise<number>} Titles merged away.
 */
export async function mergeDuplicateTitles(isSame) {
  const key = (column) => titleKeySql(column)
  const { rows: pairs } = await query(
    `WITH names AS (
       SELECT w.id, w.kind, ${key('w.title')} AS key FROM works w
       UNION
       SELECT w.id, w.kind, ${key('w.native_title')} FROM works w WHERE w.native_title IS NOT NULL
       UNION
       SELECT w.id, w.kind, ${key('w.original_title')} FROM works w WHERE w.original_title IS NOT NULL
       UNION
       SELECT w.id, w.kind, ${key('k.name')} FROM content_akas k JOIN works w ON w.id = k.content_id
     )
     SELECT DISTINCT a.id::text AS a, b.id::text AS b
     FROM names a
     JOIN names b ON b.key = a.key AND b.kind = a.kind AND b.id > a.id
     JOIN content ca ON ca.id = a.id
     JOIN content cb ON cb.id = b.id
     WHERE a.key <> ''
       AND (ca.mal_id IS NULL OR cb.mal_id IS NULL OR ca.mal_id = cb.mal_id)
       AND (ca.tmdb_id IS NULL OR cb.tmdb_id IS NULL OR ca.tmdb_id = cb.tmdb_id)
       AND (ca.anilist_id IS NULL OR cb.anilist_id IS NULL OR ca.anilist_id = cb.anilist_id)`,
  )
  const mergedInto = new Map()
  const resolve = (id) => {
    while (mergedInto.has(id)) id = mergedInto.get(id)
    return id
  }
  const rank = (row) => Number(row.malId != null) * 2 + Number(row.tmdbId != null)
  let merged = 0
  for (const pair of pairs) {
    const leftId = resolve(pair.a)
    const rightId = resolve(pair.b)
    if (leftId === rightId) continue
    const [left, right] = await Promise.all([Content.findById(leftId), Content.findById(rightId)])
    if (!left || !right || !isSame(left, right)) continue
    const leftFirst =
      rank(left) !== rank(right)
        ? rank(left) > rank(right)
        : new Date(left.createdAt || 0) <= new Date(right.createdAt || 0)
    const [keep, drop] = leftFirst ? [left, right] : [right, left]
    await mergeDuplicateWork(String(drop._id), String(keep._id))
    mergedInto.set(String(drop._id), String(keep._id))
    merged += 1
  }
  return merged
}

/**
 * Move studio credits and favorites onto another studio row, keeping the old
 * name as an alias and its external ids where the target has none, then
 * delete the source studio.
 * @param {string} fromId
 * @param {string} toId
 * @returns {Promise<void>}
 */
export async function mergeStudioInto(fromId, toId) {
  if (!fromId || !toId || String(fromId) === String(toId)) return
  await withTransaction(async () => {
    const { rows: source } = await query(
      `SELECT mal_id, tmdb_id, anilist_id, image_path, about FROM content
       WHERE id = $1 AND kind = 'studio'`,
      [fromId],
    )
    if (!source[0]) return
    await query(
      `INSERT INTO studio_credits (work_id, studio_id)
       SELECT work_id, $2 FROM studio_credits WHERE studio_id = $1
       ON CONFLICT DO NOTHING`,
      [fromId, toId],
    )
    await query(
      `INSERT INTO favorites (user_id, content_id, added_at)
       SELECT user_id, $2, added_at FROM favorites WHERE content_id = $1
       ON CONFLICT DO NOTHING`,
      [fromId, toId],
    )
    await query(
      `INSERT INTO content_akas (content_id, name)
       SELECT $2::uuid, name FROM content WHERE id = $1
       UNION
       SELECT $2::uuid, name FROM content_akas WHERE content_id = $1
       ON CONFLICT DO NOTHING`,
      [fromId, toId],
    )
    await query('UPDATE posts SET content_id = $2 WHERE content_id = $1', [fromId, toId])
    await query(`DELETE FROM content WHERE id = $1 AND kind = 'studio'`, [fromId])
    await carryExternalIds(toId, source[0])
    await query(
      `UPDATE content SET
         image_path = COALESCE(NULLIF(image_path, ''), $2),
         about = COALESCE(NULLIF(about, ''), $3)
       WHERE id = $1`,
      [toId, source[0].image_path, source[0].about],
    )
  })
}

/**
 * Titles and franchises whose content row was overwritten as a character,
 * voice, or studio while their original subtype row survived.
 * @returns {Promise<Array<{ id: string, restoredKind: string }>>}
 */
export async function findClobberedContent() {
  const { rows } = await query(
    `SELECT c.id::text AS id,
       CASE
         WHEN m.content_id IS NOT NULL THEN 'movie'
         WHEN s.content_id IS NOT NULL THEN 'series'
         WHEN sp.content_id IS NOT NULL THEN 'special'
         ELSE 'franchise'
       END AS restored_kind
     FROM content c
     LEFT JOIN movies m ON m.content_id = c.id
     LEFT JOIN series s ON s.content_id = c.id
     LEFT JOIN specials sp ON sp.content_id = c.id
     LEFT JOIN franchises f ON f.content_id = c.id
     WHERE c.kind IN ('character', 'voice', 'studio')
       AND COALESCE(m.content_id, s.content_id, sp.content_id, f.content_id) IS NOT NULL
     ORDER BY c.id`,
  )
  return rows.map((row) => ({ id: row.id, restoredKind: row.restored_kind }))
}

/**
 * Restore one overwritten watchable from `legacy_content` (or merge it into a
 * live duplicate that took its MAL/TMDB id since).
 * @param {string} id
 * @param {string} kind
 * @param {boolean} hasLegacy
 * @returns {Promise<'restored' | 'merged' | 'skipped'>}
 */
async function restoreWatchable(id, kind, hasLegacy) {
  const legacy = hasLegacy
    ? (
        await query(
          `SELECT COALESCE(NULLIF(english_title, ''), title) AS name, native_title, overview,
                  poster_path, mal_id, tmdb_id
           FROM legacy_content WHERE id = $1`,
          [id],
        )
      ).rows[0]
    : null
  if (!legacy?.name) return 'skipped'

  const { rows: dup } = await query(
    `SELECT id::text FROM content
     WHERE kind = $2 AND id <> $1
       AND (($3::int IS NOT NULL AND mal_id = $3) OR ($4::int IS NOT NULL AND tmdb_id = $4))
     LIMIT 1`,
    [id, kind, legacy.mal_id, legacy.tmdb_id],
  )
  if (dup[0]) {
    await mergeWorkInto(id, dup[0].id)
    return 'merged'
  }

  await query(
    `UPDATE content SET kind = $2, name = $3, native_name = $4, about = $5, image_path = $6,
       mal_id = $7, tmdb_id = $8, updated_at = now()
     WHERE id = $1`,
    [
      id,
      kind,
      legacy.name,
      legacy.native_title,
      legacy.overview,
      legacy.poster_path,
      legacy.mal_id,
      legacy.tmdb_id,
    ],
  )
  await query('DELETE FROM content_akas WHERE content_id = $1', [id])
  if (await tableExists('legacy_content_alternative_titles')) {
    await query(
      `INSERT INTO content_akas (content_id, name)
       SELECT content_id, title FROM legacy_content_alternative_titles
       WHERE content_id = $1 AND title IS NOT NULL AND title <> ''
       ON CONFLICT DO NOTHING`,
      [id],
    )
  }
  return 'restored'
}

/**
 * Restore one overwritten franchise from `legacy_franchises`, or fold its
 * members into a franchise row that now owns the same name.
 * @param {string} id
 * @param {boolean} hasLegacy
 * @returns {Promise<'restored' | 'merged' | 'skipped'>}
 */
async function restoreFranchise(id, hasLegacy) {
  const legacy = hasLegacy
    ? (await query('SELECT name FROM legacy_franchises WHERE id = $1', [id])).rows[0]
    : null
  if (!legacy?.name) return 'skipped'
  const { rows: other } = await query(
    `SELECT id::text FROM content WHERE kind = 'franchise' AND name = $2 AND id <> $1 LIMIT 1`,
    [id, legacy.name],
  )
  if (other[0]) {
    await query('UPDATE franchise_members SET franchise_id = $2 WHERE franchise_id = $1', [
      id,
      other[0].id,
    ])
    await query('DELETE FROM content WHERE id = $1', [id])
    return 'merged'
  }
  await query(
    `UPDATE content SET kind = 'franchise', name = $2, native_name = NULL, about = NULL,
       image_path = NULL, mal_id = NULL, tmdb_id = NULL, updated_at = now()
     WHERE id = $1`,
    [id, legacy.name],
  )
  await query('DELETE FROM content_akas WHERE content_id = $1', [id])
  return 'restored'
}

/**
 * Restore every overwritten title/franchise. Person subtype rows on those ids
 * are dropped first, which cascades away the bogus appearances where the title
 * acted as a "character".
 * @returns {Promise<{ found: number, restored: number, merged: number, skipped: string[] }>}
 */
export async function repairClobberedContent() {
  const clobbered = await findClobberedContent()
  const summary = { found: clobbered.length, restored: 0, merged: 0, skipped: [] }
  if (!clobbered.length) return summary
  const [hasLegacyContent, hasLegacyFranchises] = await Promise.all([
    tableExists('legacy_content'),
    tableExists('legacy_franchises'),
  ])

  await withTransaction(async () => {
    const ids = clobbered.map((row) => row.id)
    await query('DELETE FROM characters WHERE content_id = ANY($1::uuid[])', [ids])
    await query('DELETE FROM voices WHERE content_id = ANY($1::uuid[])', [ids])
    await query('DELETE FROM studios WHERE content_id = ANY($1::uuid[])', [ids])

    for (const { id, restoredKind } of clobbered) {
      const outcome =
        restoredKind === 'franchise'
          ? await restoreFranchise(id, hasLegacyFranchises)
          : await restoreWatchable(id, restoredKind, hasLegacyContent)
      if (outcome === 'skipped') summary.skipped.push(id)
      else summary[outcome] += 1
    }
  })
  return summary
}

/**
 * Studio rows renamed to a character/voice-actor name. Their credited works
 * list the real studio names in `legacy_content_studio_names`.
 * @returns {Promise<Array<{ id: string, name: string }>>}
 */
export async function findMisnamedStudios() {
  if (!(await tableExists('legacy_content_studio_names'))) return []
  const { rows } = await query(
    `SELECT s.id::text AS id, s.name
     FROM content s
     WHERE s.kind = 'studio'
       AND EXISTS (
         SELECT 1 FROM content p
         WHERE p.kind IN ('character', 'voice') AND lower(p.name) = lower(s.name)
       )
       AND EXISTS (
         SELECT 1 FROM studio_credits sc
         JOIN legacy_content_studio_names n ON n.content_id = sc.work_id
         WHERE sc.studio_id = s.id
       )
       AND NOT EXISTS (
         SELECT 1 FROM studio_credits sc
         JOIN legacy_content_studio_names n ON n.content_id = sc.work_id
         WHERE sc.studio_id = s.id AND lower(n.name) = lower(s.name)
       )
     ORDER BY s.name`,
  )
  return rows
}

/**
 * Delete mis-named studios and re-credit their works with the legacy studio names.
 * @returns {Promise<{ found: number, works: number, names: string[] }>}
 */
export async function repairMisnamedStudios() {
  const studios = await findMisnamedStudios()
  const summary = { found: studios.length, works: 0, names: studios.map((row) => row.name) }
  if (!studios.length) return summary

  await withTransaction(async () => {
    const ids = studios.map((row) => row.id)
    const { rows: works } = await query(
      `SELECT DISTINCT work_id::text AS id FROM studio_credits WHERE studio_id = ANY($1::uuid[])`,
      [ids],
    )
    summary.works = works.length
    await query(`DELETE FROM content WHERE id = ANY($1::uuid[]) AND kind = 'studio'`, [ids])
    const workIds = works.map((row) => row.id)
    await query(
      `INSERT INTO content (id, kind, name)
       SELECT gen_random_uuid(), 'studio', n.name
       FROM (
         SELECT DISTINCT ON (lower(name)) name
         FROM legacy_content_studio_names
         WHERE content_id = ANY($1::uuid[])
       ) n
       WHERE NOT EXISTS (
         SELECT 1 FROM content c WHERE c.kind = 'studio' AND lower(c.name) = lower(n.name)
       )`,
      [workIds],
    )
    await query(
      `INSERT INTO studios (content_id)
       SELECT id FROM content WHERE kind = 'studio'
       ON CONFLICT DO NOTHING`,
    )
    await query(
      `INSERT INTO studio_credits (work_id, studio_id)
       SELECT n.content_id, st.id
       FROM legacy_content_studio_names n
       JOIN LATERAL (
         SELECT c.id FROM content c
         WHERE c.kind = 'studio' AND lower(c.name) = lower(n.name)
         ORDER BY (c.mal_id IS NOT NULL) DESC, c.created_at
         LIMIT 1
       ) st ON TRUE
       WHERE n.content_id = ANY($1::uuid[])
       ON CONFLICT DO NOTHING`,
      [workIds],
    )
  })
  return summary
}

/**
 * Drop link rows that break the subtype rules (links only between watchables,
 * one subtype row per content kind) and add missing person/franchise subtype rows.
 * Watchlist and rating rows are counted, never deleted.
 * @returns {Promise<Record<string, number>>}
 */
export async function enforceSchemaLinks() {
  const removed = {}
  const run = async (label, sql) => {
    const result = await query(sql)
    removed[label] = result.rowCount || 0
  }
  await withTransaction(async () => {
    await run(
      'content_genres_on_non_watchable',
      `DELETE FROM content_genres cg USING content c
       WHERE c.id = cg.content_id AND c.kind NOT IN ${WATCHABLE}`,
    )
    await run(
      'appearances_on_non_watchable',
      `DELETE FROM appearances a USING content c
       WHERE c.id = a.work_id AND c.kind NOT IN ${WATCHABLE}`,
    )
    await run(
      'studio_credits_on_non_watchable',
      `DELETE FROM studio_credits sc USING content c
       WHERE c.id = sc.work_id AND c.kind NOT IN ${WATCHABLE}`,
    )
    await run(
      'franchise_members_non_watchable',
      `DELETE FROM franchise_members fm USING content c
       WHERE c.id = fm.member_id AND c.kind NOT IN ${WATCHABLE}`,
    )
    await run(
      'relations_non_watchable',
      `DELETE FROM content_relations r USING content a, content b
       WHERE a.id = r.from_id AND b.id = r.to_id
         AND (a.kind NOT IN ${WATCHABLE} OR b.kind NOT IN ${WATCHABLE})`,
    )
    for (const [table, kind] of SUBTYPE_TABLES) {
      await run(
        `${table}_wrong_kind`,
        `DELETE FROM ${table} x USING content c
         WHERE c.id = x.content_id AND c.kind <> '${kind}'`,
      )
    }
    for (const [table, kind] of SUBTYPE_TABLES) {
      const result = await query(
        `INSERT INTO ${table} (content_id)
         SELECT id FROM content WHERE kind = '${kind}'
         ON CONFLICT DO NOTHING`,
      )
      removed[`${table}_added`] = result.rowCount || 0
    }
  })
  const { rows } = await query(
    `SELECT
       (SELECT count(*) FROM watchlist w JOIN content c ON c.id = w.content_id
        WHERE c.kind NOT IN ${WATCHABLE})::int AS watchlist,
       (SELECT count(*) FROM ratings r JOIN content c ON c.id = r.content_id
        WHERE c.kind NOT IN ${WATCHABLE})::int AS ratings`,
  )
  removed.watchlist_on_non_watchable_kept = rows[0].watchlist
  removed.ratings_on_non_watchable_kept = rows[0].ratings
  return removed
}

/**
 * Delete characters without appearances, voices without credits, studios
 * without credits, and empty franchises. Rows that are favorited or tagged
 * by a post are kept.
 * @returns {Promise<Record<string, number>>}
 */
export async function pruneOrphans() {
  const keep = `
    AND NOT EXISTS (SELECT 1 FROM favorites f WHERE f.content_id = c.id)
    AND NOT EXISTS (SELECT 1 FROM posts p WHERE p.content_id = c.id)`
  const targets = {
    characters: `c.kind = 'character' AND NOT EXISTS (SELECT 1 FROM appearances a WHERE a.character_id = c.id)`,
    voices: `c.kind = 'voice' AND NOT EXISTS (SELECT 1 FROM voice_credits v WHERE v.voice_id = c.id)`,
    studios: `c.kind = 'studio' AND NOT EXISTS (SELECT 1 FROM studio_credits s WHERE s.studio_id = c.id)`,
    franchises: `c.kind = 'franchise' AND NOT EXISTS (SELECT 1 FROM franchise_members m WHERE m.franchise_id = c.id)`,
  }
  const removed = {}
  for (const [label, where] of Object.entries(targets)) {
    const result = await query(`DELETE FROM content c WHERE ${where} ${keep}`)
    removed[label] = result.rowCount || 0
  }
  return removed
}

/**
 * Merge studio rows that name the same company ("Kyoto Animation" and
 * "Kyoto Animation Co., Ltd."), keeping the row with a MAL id, then an AniList
 * id, then the most credits. Rows whose ids from one source differ stay apart.
 * @returns {Promise<number>} Studios merged away.
 */
export async function mergeDuplicateStudios() {
  const { rows } = await query(
    `SELECT s.id::text AS id, s.name, s.mal_id, s.tmdb_id, s.anilist_id,
            (SELECT count(*) FROM studio_credits sc WHERE sc.studio_id = s.id)::int AS credits
     FROM content s WHERE s.kind = 'studio'`,
  )
  const groups = new Map()
  for (const row of rows) {
    const key = studioNameKey(row.name)
    if (!key) continue
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key).push(row)
  }
  const idsConflict = (left, right) =>
    ['mal_id', 'tmdb_id', 'anilist_id'].some(
      (column) => left[column] != null && right[column] != null && left[column] !== right[column],
    )
  let merged = 0
  for (const group of groups.values()) {
    if (group.length < 2) continue
    group.sort(
      (left, right) =>
        Number(right.mal_id != null) - Number(left.mal_id != null) ||
        Number(right.anilist_id != null) - Number(left.anilist_id != null) ||
        right.credits - left.credits,
    )
    const [primary, ...rest] = group
    for (const row of rest) {
      if (idsConflict(primary, row)) continue
      await mergeStudioInto(row.id, primary.id)
      for (const column of ['mal_id', 'tmdb_id', 'anilist_id']) primary[column] ??= row[column]
      merged += 1
    }
  }
  return merged
}

/**
 * Drop repeated voice credits: unlabeled ("Unknown"/NULL language) rows when
 * the same actor has a labeled credit on that appearance, and exact repeats
 * of an unlabeled credit.
 * @returns {Promise<number>} Credits removed.
 */
export async function dedupeVoiceCredits() {
  const labeled = await query(
    `DELETE FROM voice_credits vc
     WHERE (vc.language IS NULL OR lower(vc.language) = 'unknown')
       AND EXISTS (
         SELECT 1 FROM voice_credits x
         WHERE x.appearance_id = vc.appearance_id AND x.voice_id = vc.voice_id
           AND x.language IS NOT NULL AND lower(x.language) <> 'unknown'
       )`,
  )
  const repeats = await query(
    `DELETE FROM voice_credits vc
     USING (
       SELECT id, row_number() OVER (
         PARTITION BY appearance_id, voice_id, lower(coalesce(language, 'unknown'))
         ORDER BY language NULLS LAST, id
       ) AS n
       FROM voice_credits
     ) ranked
     WHERE vc.id = ranked.id AND ranked.n > 1`,
  )
  return (labeled.rowCount || 0) + (repeats.rowCount || 0)
}

/**
 * Move a voice actor's credits, favorites, and names onto another voice row,
 * filling the target's missing ids, native name, portrait, and about, then
 * delete the source.
 * @param {string} fromId
 * @param {string} toId
 * @returns {Promise<void>}
 */
async function mergeVoiceInto(fromId, toId) {
  if (!fromId || !toId || String(fromId) === String(toId)) return
  await withTransaction(async () => {
    const { rows: source } = await query(
      `SELECT mal_id, tmdb_id, anilist_id, native_name, image_path, about FROM content
       WHERE id = $1 AND kind = 'voice'`,
      [fromId],
    )
    if (!source[0]) return
    await query(
      `UPDATE voice_credits vc SET voice_id = $2
       WHERE vc.voice_id = $1
         AND NOT EXISTS (
           SELECT 1 FROM voice_credits x
           WHERE x.appearance_id = vc.appearance_id AND x.voice_id = $2
             AND x.language IS NOT DISTINCT FROM vc.language
         )`,
      [fromId, toId],
    )
    await query(
      `INSERT INTO favorites (user_id, content_id, added_at)
       SELECT user_id, $2, added_at FROM favorites WHERE content_id = $1
       ON CONFLICT DO NOTHING`,
      [fromId, toId],
    )
    await query(
      `INSERT INTO content_akas (content_id, name)
       SELECT $2::uuid, name FROM content WHERE id = $1
       UNION
       SELECT $2::uuid, name FROM content_akas WHERE content_id = $1
       ON CONFLICT DO NOTHING`,
      [fromId, toId],
    )
    await query(
      `DELETE FROM content_akas k USING content t
       WHERE k.content_id = t.id AND t.id = $1 AND k.name = t.name`,
      [toId],
    )
    await query('UPDATE posts SET content_id = $2 WHERE content_id = $1', [fromId, toId])
    await query(`DELETE FROM content WHERE id = $1 AND kind = 'voice'`, [fromId])
    await carryExternalIds(toId, source[0])
    await query(
      `UPDATE content SET
         native_name = COALESCE(NULLIF(native_name, ''), $2),
         image_path = COALESCE(NULLIF(image_path, ''), $3),
         about = COALESCE(NULLIF(about, ''), $4)
       WHERE id = $1`,
      [toId, source[0].native_name, source[0].image_path, source[0].about],
    )
  })
}

/**
 * Merge voice actors listed twice by different sources ("Yumi Uchiyama" from
 * MAL and from TMDB): same folded name, native names agreeing when both are
 * known, and no source listing them under different ids. Keeps the MAL row,
 * then the AniList row, then the one with the most credits.
 * @returns {Promise<number>} Voice actors merged away.
 */
export async function mergeDuplicateVoices() {
  const { rows } = await query(
    `SELECT v.id::text AS id, v.name, v.native_name, v.mal_id, v.tmdb_id, v.anilist_id,
            (SELECT count(*) FROM voice_credits vc WHERE vc.voice_id = v.id)::int AS credits
     FROM content v WHERE v.kind = 'voice'`,
  )
  const groups = new Map()
  for (const row of rows) {
    const key = foldEntityName(row.name)
    if (!key) continue
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key).push(row)
  }
  const native = (row) => String(row.native_name || '').replace(/\s+/g, '')
  const conflict = (left, right) =>
    ['mal_id', 'tmdb_id', 'anilist_id'].some(
      (column) => left[column] != null && right[column] != null && left[column] !== right[column],
    ) ||
    Boolean(native(left) && native(right) && native(left) !== native(right))
  let merged = 0
  for (const group of groups.values()) {
    if (group.length < 2) continue
    group.sort(
      (left, right) =>
        Number(right.mal_id != null) - Number(left.mal_id != null) ||
        Number(right.anilist_id != null) - Number(left.anilist_id != null) ||
        right.credits - left.credits,
    )
    const [primary, ...rest] = group
    for (const row of rest) {
      if (conflict(primary, row)) continue
      await mergeVoiceInto(row.id, primary.id)
      for (const column of ['mal_id', 'tmdb_id', 'anilist_id', 'native_name']) {
        primary[column] ??= row[column]
      }
      merged += 1
    }
  }
  return merged
}

/**
 * Row counts and integrity checks for the catalog tables.
 * @returns {Promise<object>}
 */
export async function auditCatalog() {
  const { rows: kinds } = await query(
    `SELECT kind, count(*)::int AS n FROM content GROUP BY kind ORDER BY kind`,
  )
  const { rows: sourceRows } = await query(
    `SELECT kind, count(mal_id)::int AS mal, count(tmdb_id)::int AS tmdb,
            count(anilist_id)::int AS anilist
     FROM content GROUP BY kind ORDER BY kind`,
  )
  const { rows } = await query(
    `SELECT
       (SELECT count(*) FROM appearances)::int AS appearances,
       (SELECT count(*) FROM voice_credits)::int AS voice_credits,
       (SELECT count(*) FROM studio_credits)::int AS studio_credits,
       (SELECT count(*) FROM content_relations)::int AS relations,
       (SELECT count(*) FROM content c WHERE c.kind IN ${WATCHABLE}
          AND EXISTS (SELECT 1 FROM appearances a WHERE a.work_id = c.id))::int AS works_with_characters,
       (SELECT count(*) FROM content c WHERE c.kind IN ${WATCHABLE}
          AND EXISTS (SELECT 1 FROM studio_credits s WHERE s.work_id = c.id))::int AS works_with_studios,
       (SELECT count(*) FROM content c WHERE c.kind = 'studio'
          AND c.image_path IS NOT NULL AND c.image_path <> '')::int AS studios_with_image,
       (SELECT count(*) FROM content c WHERE c.kind = 'studio' AND c.mal_id IS NOT NULL)::int AS studios_with_mal,
       (SELECT count(*) FROM content c WHERE c.kind = 'character'
          AND c.image_path IS NOT NULL AND c.image_path <> '')::int AS characters_with_image,
       (SELECT count(*) FROM content c WHERE c.kind = 'voice'
          AND c.image_path IS NOT NULL AND c.image_path <> '')::int AS voices_with_image`,
  )
  const clobbered = await findClobberedContent()
  const { rows: violations } = await query(
    `SELECT
       (SELECT count(*) FROM appearances a JOIN content c ON c.id = a.work_id
        WHERE c.kind NOT IN ${WATCHABLE})::int AS appearances_bad_work,
       (SELECT count(*) FROM studio_credits s JOIN content c ON c.id = s.work_id
        WHERE c.kind NOT IN ${WATCHABLE})::int AS studio_credits_bad_work,
       (SELECT count(*) FROM content_genres g JOIN content c ON c.id = g.content_id
        WHERE c.kind NOT IN ${WATCHABLE})::int AS genres_bad_kind,
       (SELECT count(*) FROM content c WHERE c.kind = 'character'
        AND NOT EXISTS (SELECT 1 FROM appearances a WHERE a.character_id = c.id))::int AS orphan_characters,
       (SELECT count(*) FROM content c WHERE c.kind = 'voice'
        AND NOT EXISTS (SELECT 1 FROM voice_credits v WHERE v.voice_id = c.id))::int AS orphan_voices,
       (SELECT count(*) FROM content c WHERE c.kind = 'studio'
        AND NOT EXISTS (SELECT 1 FROM studio_credits s WHERE s.studio_id = c.id))::int AS orphan_studios,
       (SELECT count(*) FROM (
          SELECT mal_id FROM content WHERE kind IN ${WATCHABLE} AND mal_id IS NOT NULL
          GROUP BY mal_id HAVING count(*) > 1) d)::int AS titles_sharing_mal_id,
       (SELECT coalesce(sum(n - 1), 0) FROM (
          SELECT count(*) AS n FROM voice_credits
          GROUP BY appearance_id, voice_id, lower(coalesce(language, 'unknown'))
          HAVING count(*) > 1) d)::int AS repeated_voice_credits`,
  )
  return {
    kinds: Object.fromEntries(kinds.map((row) => [row.kind, row.n])),
    sources: Object.fromEntries(
      sourceRows.map((row) => [row.kind, { mal: row.mal, tmdb: row.tmdb, anilist: row.anilist }]),
    ),
    links: rows[0],
    violations: { ...violations[0], clobbered: clobbered.length },
  }
}
