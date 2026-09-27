/**
 * Merge catalog characters that share a name (including swapped first/last)
 * inside a title's home franchise, collapsing appearances onto one row.
 */
import { query } from '../../config/postgres.js'
import { asId } from '../db/ids.js'
import Entity from '../models/Entity.js'
import {
  canonicalCharacterName,
  canonicalCharacterNameKey,
  characterNameKeys,
  characterPortraitPath,
  groupCharactersByCanonicalName,
  pickPrimaryCharacter,
  uniqueEntityNames,
} from '../utils/entities.js'

/** Lite home-character lists keyed by seed work id. */
const homeCharacterCache = new Map()

const FAMILY_RELATION_KINDS = `(
  'sequel','prequel','side_story','parent_story',
  'alternative_setting','alternative_version','summary','full_story'
)`

function appearanceCount(entity) {
  const stored = Number(entity?.appearanceCount)
  if (Number.isFinite(stored) && stored > 0) return stored
  return Array.isArray(entity?.appearances) ? entity.appearances.length : 0
}

function hasLoadedAppearances(doc) {
  return Boolean(
    doc &&
      Array.isArray(doc.appearances) &&
      doc.appearances.some((row) => row?.content || row?.work_id),
  )
}

/**
 * Load character rows plus aliases without per-row child queries.
 * @param {string[]} characterIds
 * @returns {Promise<object[]>}
 */
async function loadCharacterDocs(characterIds) {
  const ids = [...new Set(characterIds.map((id) => asId(id)).filter(Boolean))]
  if (!ids.length) return []
  const { rows } = await query(
    `SELECT e.id, e.name, e.native_name, e.about, e.image_path, e.mal_id, e.tmdb_id,
            ch.english_name
     FROM content e
     LEFT JOIN characters ch ON ch.content_id = e.id
     WHERE e.kind = 'character' AND e.id = ANY($1::uuid[])`,
    [ids],
  )
  const { rows: akaRows } = await query(
    `SELECT content_id::text AS id, name
     FROM content_akas
     WHERE content_id = ANY($1::uuid[])`,
    [ids],
  )
  const { rows: appRows } = await query(
    `SELECT character_id::text AS id, count(*)::int AS n
     FROM appearances
     WHERE character_id = ANY($1::uuid[])
     GROUP BY character_id`,
    [ids],
  )
  const akasById = new Map()
  for (const row of akaRows) {
    if (!akasById.has(row.id)) akasById.set(row.id, [])
    akasById.get(row.id).push(row.name)
  }
  const appsById = new Map(appRows.map((row) => [row.id, row.n]))
  return rows.map((row) => {
    const id = String(row.id)
    return {
      _id: row.id,
      id: row.id,
      entityType: 'character',
      name: row.name,
      englishName: row.english_name || null,
      nativeName: row.native_name,
      about: row.about,
      imagePath: row.image_path,
      malId: row.mal_id != null ? Number(row.mal_id) : null,
      tmdbId: row.tmdb_id != null ? Number(row.tmdb_id) : null,
      alternativeNames: akasById.get(id) || [],
      appearanceCount: appsById.get(id) || 0,
      appearances: [],
    }
  })
}

async function hydrateCharacter(doc) {
  if (!doc) return null
  if (hasLoadedAppearances(doc)) return doc
  return Entity.findById(doc._id)
}

/**
 * Works treated as one home: franchise-mates, typed sequel-family relations
 * (not `other`), and titles that share a name/aka with that family.
 * @param {unknown} workId
 * @returns {Promise<string[]>}
 */
export async function homeWorkIds(workId) {
  const id = asId(workId)
  if (!id) return []
  const { rows } = await query(
    `
    WITH RECURSIVE rel_family AS (
      SELECT $1::uuid AS id
      UNION
      SELECT x.next_id
      FROM rel_family f
      CROSS JOIN LATERAL (
        SELECT fm2.member_id AS next_id
        FROM franchise_members fm
        JOIN franchise_members fm2 ON fm2.franchise_id = fm.franchise_id
        WHERE fm.member_id = f.id
        UNION
        SELECT CASE WHEN r.from_id = f.id THEN r.to_id ELSE r.from_id END
        FROM content_relations r
        WHERE f.id IN (r.from_id, r.to_id)
          AND r.kind IN ${FAMILY_RELATION_KINDS}
      ) x
    ),
    title_keys AS (
      SELECT lower(w.title) AS key
      FROM rel_family f
      JOIN works w ON w.id = f.id
      WHERE char_length(trim(w.title)) >= 6
      UNION
      SELECT lower(w.original_title)
      FROM rel_family f
      JOIN works w ON w.id = f.id
      WHERE w.original_title IS NOT NULL AND char_length(trim(w.original_title)) >= 6
      UNION
      SELECT lower(w.native_title)
      FROM rel_family f
      JOIN works w ON w.id = f.id
      WHERE w.native_title IS NOT NULL AND char_length(trim(w.native_title)) >= 6
      UNION
      SELECT lower(k.name)
      FROM rel_family f
      JOIN content_akas k ON k.content_id = f.id
      WHERE char_length(trim(k.name)) >= 6
    ),
    title_mates AS (
      SELECT w.id
      FROM works w
      WHERE lower(w.title) IN (SELECT key FROM title_keys)
         OR (w.original_title IS NOT NULL AND lower(w.original_title) IN (SELECT key FROM title_keys))
         OR (w.native_title IS NOT NULL AND lower(w.native_title) IN (SELECT key FROM title_keys))
      UNION
      SELECT k.content_id
      FROM content_akas k
      JOIN works w ON w.id = k.content_id
      WHERE lower(k.name) IN (SELECT key FROM title_keys)
        AND char_length(trim(k.name)) >= 6
    ),
    family AS (
      SELECT id FROM rel_family
      UNION
      SELECT id FROM title_mates
    )
    SELECT DISTINCT id::text AS id FROM (
      SELECT id FROM family
      UNION
      SELECT x.next_id
      FROM family f
      CROSS JOIN LATERAL (
        SELECT fm2.member_id AS next_id
        FROM franchise_members fm
        JOIN franchise_members fm2 ON fm2.franchise_id = fm.franchise_id
        WHERE fm.member_id = f.id
        UNION
        SELECT CASE WHEN r.from_id = f.id THEN r.to_id ELSE r.from_id END
        FROM content_relations r
        WHERE f.id IN (r.from_id, r.to_id)
          AND r.kind IN ${FAMILY_RELATION_KINDS}
      ) x
    ) home
    `,
    [id],
  )
  return rows.map((row) => row.id)
}

/**
 * MAL id from this title or another work in its home franchise.
 * @param {unknown} workId
 * @returns {Promise<number|null>}
 */
export async function siblingMalId(workId) {
  const ids = await homeWorkIds(workId)
  if (!ids.length) return null
  const { rows } = await query(
    `SELECT mal_id FROM content
     WHERE id::text = ANY($1::text[]) AND mal_id IS NOT NULL
     ORDER BY mal_id
     LIMIT 1`,
    [ids],
  )
  const malId = Number(rows[0]?.mal_id)
  return Number.isFinite(malId) && malId > 0 ? malId : null
}

/**
 * Characters that appear in a title's home works (lite rows for matching/merge).
 * @param {unknown} workId
 * @returns {Promise<object[]>}
 */
export async function charactersInHome(workId) {
  const id = asId(workId)
  if (!id) return []
  if (homeCharacterCache.has(id)) return homeCharacterCache.get(id)
  const ids = await homeWorkIds(id)
  if (!ids.length) {
    homeCharacterCache.set(id, [])
    return []
  }
  const { rows } = await query(
    `SELECT DISTINCT character_id::text AS character_id
     FROM appearances
     WHERE work_id::text = ANY($1::text[])`,
    [ids],
  )
  const docs = await loadCharacterDocs(rows.map((row) => row.character_id))
  homeCharacterCache.set(id, docs)
  return docs
}

/**
 * Find an existing franchise-mate for this payload (MAL id first, then name).
 * @param {{ malId?: number, name?: string }} payload
 * @param {unknown} workId
 * @param {object[]} [homeCharacters]
 * @returns {Promise<object|null>}
 */
export async function findCharacterForPayload(payload, workId, homeCharacters) {
  const malId = Number(payload?.malId)
  const candidates = Array.isArray(homeCharacters)
    ? homeCharacters
    : workId
      ? await charactersInHome(workId)
      : []
  if (Number.isFinite(malId) && malId > 0) {
    const fromHome = candidates.find((entity) => Number(entity.malId) === malId)
    if (fromHome) return hydrateCharacter(fromHome)
    const byMal = await Entity.findOne({ entityType: 'character', malId })
    if (byMal) return byMal
  }
  const key = canonicalCharacterNameKey(payload?.name)
  if (!key || !workId) return null
  const match = candidates.find((entity) => characterNameKeys(entity).has(key))
  return hydrateCharacter(match)
}

/**
 * Collapse one duplicate character onto the kept row.
 * @param {object} primary
 * @param {object} secondary
 * @param {string[]} [homeIds]
 * @returns {Promise<object>}
 */
export async function mergeCharacterPair(primary, secondary, homeIds) {
  const toId = asId(primary?._id)
  const fromId = asId(secondary?._id)
  if (!toId || !fromId || toId === fromId) return primary

  const { rows: stillThere } = await query('SELECT id FROM content WHERE id = $1', [fromId])
  if (!stillThere[0]) return primary

  const canonical =
    canonicalCharacterName(primary.name) || canonicalCharacterName(secondary.name) || primary.name
  const canonicalKey = canonicalCharacterNameKey(canonical)
  const keptNames = uniqueEntityNames(
    canonical,
    primary.name,
    secondary.name,
    ...(primary.alternativeNames || []),
    ...(secondary.alternativeNames || []),
  ).filter((name) => canonicalCharacterNameKey(name) === canonicalKey)
  const imagePath =
    characterPortraitPath(primary.imagePath) || characterPortraitPath(secondary.imagePath) || null
  const nativeName = primary.nativeName || secondary.nativeName || null
  const about = primary.about || secondary.about || null
  const keepMal =
    Number(primary.malId) > 0
      ? Number(primary.malId)
      : Number(secondary.malId) > 0
        ? Number(secondary.malId)
        : null
  const keepTmdb =
    Number(primary.tmdbId) > 0
      ? Number(primary.tmdbId)
      : Number(secondary.tmdbId) > 0
        ? Number(secondary.tmdbId)
        : null

  const home = Array.isArray(homeIds) && homeIds.length ? new Set(homeIds.map(String)) : null
  const { rows: secondaryApps } = await query(
    'SELECT id, work_id, role, importance FROM appearances WHERE character_id = $1',
    [fromId],
  )
  for (const app of secondaryApps) {
    if (home && !home.has(String(app.work_id))) {
      await query('DELETE FROM appearances WHERE id = $1', [app.id])
      continue
    }
    const existing = await query(
      'SELECT id, role, importance FROM appearances WHERE character_id = $1 AND work_id = $2',
      [toId, app.work_id],
    )
    if (existing.rows[0]) {
      const keepAppearance = existing.rows[0].id
      await query(
        `INSERT INTO voice_credits (appearance_id, voice_id, language)
         SELECT $1, voice_id, language FROM voice_credits WHERE appearance_id = $2
         ON CONFLICT DO NOTHING`,
        [keepAppearance, app.id],
      )
      await query(
        `UPDATE appearances SET
           importance = GREATEST(importance, $2),
           role = CASE WHEN $3 = 'main' THEN 'main' ELSE role END
         WHERE id = $1`,
        [keepAppearance, Number(app.importance) || 0, app.role],
      )
      await query('DELETE FROM appearances WHERE id = $1', [app.id])
    } else {
      await query('UPDATE appearances SET character_id = $1 WHERE id = $2', [toId, app.id])
    }
  }

  await query(
    `INSERT INTO content_akas (content_id, name)
     SELECT $1, name FROM content_akas WHERE content_id = $2
     ON CONFLICT DO NOTHING`,
    [toId, fromId],
  )
  await query('DELETE FROM content_akas WHERE content_id = $1 AND name <> ALL($2::text[])', [
    toId,
    keptNames.length ? keptNames : [canonical],
  ])
  for (const name of keptNames) {
    await query(
      'INSERT INTO content_akas (content_id, name) VALUES ($1, $2) ON CONFLICT DO NOTHING',
      [toId, name],
    )
  }

  await query(
    `UPDATE favorites SET content_id = $2
     WHERE content_id = $1
       AND NOT EXISTS (
         SELECT 1 FROM favorites f
         WHERE f.user_id = favorites.user_id AND f.content_id = $2
       )`,
    [fromId, toId],
  )
  await query('DELETE FROM favorites WHERE content_id = $1', [fromId])

  const { rows: leftover } = await query(
    'SELECT 1 FROM appearances WHERE character_id = $1 LIMIT 1',
    [fromId],
  )

  await query('UPDATE content SET mal_id = NULL, tmdb_id = NULL WHERE id = $1', [fromId])
  await query(
    `UPDATE content SET
       name = $2,
       native_name = COALESCE($3, native_name),
       about = COALESCE($4, about),
       image_path = COALESCE($5, image_path),
       mal_id = COALESCE($6, mal_id),
       tmdb_id = COALESCE($7, tmdb_id),
       updated_at = now()
     WHERE id = $1`,
    [toId, canonical, nativeName, about, imagePath, keepMal, keepTmdb],
  )
  await query(
    `INSERT INTO characters (content_id, english_name) VALUES ($1, $2)
     ON CONFLICT (content_id) DO UPDATE SET english_name = EXCLUDED.english_name`,
    [toId, canonical],
  )
  if (!leftover[0]) {
    await query('DELETE FROM content WHERE id = $1', [fromId])
  }

  primary.name = canonical
  primary.englishName = canonical
  primary.alternativeNames = keptNames
  primary.appearanceCount = appearanceCount(primary) + appearanceCount(secondary)
  if (imagePath) primary.imagePath = imagePath
  if (nativeName) primary.nativeName = nativeName
  if (about) primary.about = about
  if (keepMal) primary.malId = keepMal
  if (keepTmdb) primary.tmdbId = keepTmdb
  return primary
}

function mergeDuplicateGroups(docs) {
  return groupCharactersByCanonicalName(docs).filter((group) => group.length > 1)
}

/**
 * Merge same-name characters in the home franchise of a catalog title.
 * @param {unknown} workId
 * @returns {Promise<number>} Number of characters deleted.
 */
export async function mergeFranchiseCharactersForWork(workId) {
  homeCharacterCache.clear()
  const homeIds = await homeWorkIds(workId)
  const docs = await charactersInHome(workId)
  let merged = 0
  for (const group of mergeDuplicateGroups(docs)) {
    const primary = pickPrimaryCharacter(group)
    if (!primary) continue
    for (const secondary of group) {
      if (asId(secondary._id) === asId(primary._id)) continue
      try {
        await mergeCharacterPair(primary, secondary, homeIds)
        merged += 1
      } catch (error) {
        console.error(
          `Failed to merge character ${secondary?.name} into ${primary?.name}:`,
          error.message,
        )
      }
    }
  }
  homeCharacterCache.clear()
  return merged
}

/**
 * One-pass cleanup across titles that already have character appearances.
 * @returns {Promise<number>}
 */
export async function mergeAllFranchiseCharacters() {
  homeCharacterCache.clear()
  const { rows: workRows } = await query(
    `SELECT DISTINCT work_id::text AS id FROM appearances`,
  )
  const seen = new Set()
  let merged = 0
  for (const row of workRows) {
    if (!row.id) continue
    const homeIds = await homeWorkIds(row.id)
    const homeKey = [...homeIds].sort().join(',')
    if (!homeKey || seen.has(homeKey)) continue
    seen.add(homeKey)
    merged += await mergeFranchiseCharactersForWork(row.id)
  }
  homeCharacterCache.clear()
  return merged
}
