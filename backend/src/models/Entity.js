/**
 * Characters, voice actors, and studios as content subtypes.
 */
import crypto from 'crypto'
import { query } from '../../config/postgres.js'
import { appearanceRole, appearanceRoleToApi, entityTypeFromKind, kindFromEntityType } from '../db/kinds.js'
import { compileMongoFilter, compileSort } from '../db/mongoFilter.js'
import { DocQuery } from '../db/query.js'
import { asId } from '../db/ids.js'
import Content, { attachContentRelations, loadAdminOverrides, mapContentRow } from './Content.js'
import { applyAdminOverrides } from '../utils/adminContent.js'
import { knownVoiceLanguage } from '../utils/entities.js'

function mapEntityRow(row) {
  return {
    _id: row.id,
    id: row.id,
    entityType: entityTypeFromKind(row.kind),
    name: row.name,
    englishName: row.english_name || row.character_english || row.voice_english || null,
    nativeName: row.native_name,
    about: row.about,
    imagePath: row.image_path,
    malId: row.mal_id != null ? Number(row.mal_id) : null,
    tmdbId: row.tmdb_id != null ? Number(row.tmdb_id) : null,
    anilistId: row.anilist_id != null ? Number(row.anilist_id) : null,
    favoritesCount: Number(row.favorites_count || 0),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    alternativeNames: [],
    appearances: [],
  }
}

/**
 * Aliases, appearances, and studio credits for many entities in three queries.
 * @param {object[]} docs
 * @returns {Promise<object[]>}
 */
async function loadEntityChildren(docs) {
  if (!docs.length) return docs
  const ids = docs.map((doc) => doc._id)
  const [names, appearances, studioWorks] = await Promise.all([
    query('SELECT content_id, name FROM content_akas WHERE content_id = ANY($1::uuid[])', [ids]),
    query(
      `WITH owners AS (
         SELECT a.id AS appearance_id, a.character_id AS owner_id
         FROM appearances a
         WHERE a.character_id = ANY($1::uuid[])
         UNION
         SELECT v.appearance_id, v.voice_id
         FROM voice_credits v
         WHERE v.voice_id = ANY($1::uuid[])
       )
       SELECT o.owner_id, a.*, json_agg(
         json_build_object(
           'name', vc.name,
           'language', v.language,
           'entity', v.voice_id
         )
       ) FILTER (WHERE v.id IS NOT NULL) AS voice_actors
       FROM owners o
       JOIN appearances a ON a.id = o.appearance_id
       LEFT JOIN voice_credits v ON v.appearance_id = a.id
       LEFT JOIN content vc ON vc.id = v.voice_id
       GROUP BY o.owner_id, a.id`,
      [ids],
    ),
    query('SELECT studio_id, work_id FROM studio_credits WHERE studio_id = ANY($1::uuid[])', [ids]),
  ])
  const namesById = groupRows(names.rows, 'content_id')
  const appsById = groupRows(appearances.rows, 'owner_id')
  const studioById = groupRows(studioWorks.rows, 'studio_id')
  for (const doc of docs) {
    const id = String(doc._id)
    doc.alternativeNames = (namesById.get(id) || []).map((row) => row.name)
    if (doc.entityType === 'studio') {
      doc.appearances = (studioById.get(id) || []).map((row) => ({
        content: row.work_id,
        character: null,
        role: 'Supporting',
        importance: 0,
        voiceActors: [],
      }))
      continue
    }
    doc.appearances = (appsById.get(id) || []).map((row) => ({
      content: row.work_id,
      character: row.character_id,
      role: appearanceRoleToApi(row.role),
      importance: row.importance,
      voiceActors: row.voice_actors || [],
    }))
  }
  return docs
}

function groupRows(rows, key) {
  const map = new Map()
  for (const row of rows) {
    const id = String(row[key])
    if (!map.has(id)) map.set(id, [])
    map.get(id).push(row)
  }
  return map
}

function Entity(data = {}, options = {}) {
  Object.assign(this, {
    alternativeNames: [],
    appearances: [],
    favoritesCount: 0,
    ...data,
  })
  if (!this._id) this._id = data.id || crypto.randomUUID()
  this.id = this._id
  this.$isNew = !options.fromDb
}

Entity.prototype.set = function set(key, value) {
  if (value === undefined) this[key] = null
  else this[key] = value
  return this
}

Entity.prototype.toJSON = function toJSON() {
  const { $isNew, ...rest } = this
  rest._id = this._id
  rest.id = this._id
  rest.displayName = this.englishName || this.name || this.nativeName
  return rest
}

Entity.prototype.toObject = function toObject() {
  return this.toJSON()
}

Entity.prototype.populate = async function populate(specs) {
  const list = Array.isArray(specs) ? specs : [specs]
  const contentIds = [
    ...new Set(this.appearances.map((row) => asId(row.content)).filter(Boolean)),
  ]
  const characterIds = [
    ...new Set(this.appearances.map((row) => asId(row.character)).filter(Boolean)),
  ]
  let contents = []
  if (contentIds.length) {
    const { rows } = await query('SELECT * FROM works WHERE id = ANY($1::uuid[])', [contentIds])
    contents = await attachContentRelations(rows.map(mapContentRow))
  }
  const contentById = new Map(contents.map((item) => [String(item._id), item]))
  const characterById = new Map()
  if (characterIds.length) {
    const { rows } = await query(
      `SELECT e.*, ch.english_name
       FROM content e
       LEFT JOIN characters ch ON ch.content_id = e.id
       WHERE e.id = ANY($1::uuid[])`,
      [characterIds],
    )
    for (const row of rows) characterById.set(String(row.id), mapEntityRow(row))
  }
  for (const spec of list) {
    const path = typeof spec === 'string' ? spec : spec.path
    const select = typeof spec === 'object' ? spec.select : null
    if (path === 'appearances.content') {
      this.appearances = this.appearances.map((row) => ({
        ...row,
        content: pick(contentById.get(asId(row.content)), select) || row.content,
      }))
    }
    if (path === 'appearances.character') {
      this.appearances = this.appearances.map((row) => ({
        ...row,
        character: pick(characterById.get(asId(row.character)), select) || row.character,
      }))
    }
  }
  return this
}

function pick(doc, select) {
  if (!doc) return null
  if (!select || typeof select !== 'string') return doc
  const fields = select.split(/\s+/).filter(Boolean)
  const out = { _id: doc._id || doc.id, id: doc._id || doc.id }
  for (const field of fields) out[field] = doc[field]
  return out
}

const UUID_SHAPE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function isUuid(value) {
  return typeof value === 'string' && UUID_SHAPE.test(value)
}

/**
 * Upsert many (work, character) appearances in one statement. Rows whose work
 * is not watchable content or whose character row is missing are skipped.
 * @param {Array<{ workId: string, characterId: string, role?: string, importance?: number }>} rows
 * @returns {Promise<Map<string, string>>} `${workId}:${characterId}` → appearance id
 */
async function upsertAppearances(rows) {
  const byKey = new Map()
  for (const row of rows) {
    if (!isUuid(row.workId) || !isUuid(row.characterId)) continue
    const key = `${row.workId}:${row.characterId}`
    const existing = byKey.get(key)
    if (!existing || (Number(row.importance) || 0) > (Number(existing.importance) || 0)) {
      byKey.set(key, row)
    }
  }
  const list = [...byKey.values()]
  const ids = new Map()
  if (!list.length) return ids
  const { rows: saved } = await query(
    `INSERT INTO appearances (id, work_id, character_id, role, importance)
     SELECT gen_random_uuid(), t.work_id, t.character_id, t.role, t.importance
     FROM unnest($1::uuid[], $2::uuid[], $3::text[], $4::int[])
       AS t(work_id, character_id, role, importance)
     JOIN content w ON w.id = t.work_id AND w.kind IN ('movie', 'series', 'special')
     JOIN characters ch ON ch.content_id = t.character_id
     ON CONFLICT (work_id, character_id) DO UPDATE SET
       role = EXCLUDED.role,
       importance = GREATEST(appearances.importance, EXCLUDED.importance)
     RETURNING id, work_id::text, character_id::text`,
    [
      list.map((row) => row.workId),
      list.map((row) => row.characterId),
      list.map((row) => appearanceRole(row.role)),
      list.map((row) => Math.round(Number(row.importance) || 0)),
    ],
  )
  for (const row of saved) ids.set(`${row.work_id}:${row.character_id}`, row.id)
  return ids
}

/**
 * Insert voice credits in bulk; credits pointing at non-voice content are dropped.
 * @param {Array<{ appearanceId: string, voiceId: string, language?: string }>} credits
 * @returns {Promise<void>}
 */
async function insertVoiceCredits(credits) {
  const byPair = new Map()
  for (const row of credits) {
    if (!isUuid(row.appearanceId) || !isUuid(row.voiceId)) continue
    const language = knownVoiceLanguage(row.language)
    const pair = `${row.appearanceId}:${row.voiceId}`
    const rows = byPair.get(pair) || []
    if (rows.some((kept) => kept.language === language)) continue
    if (!language && rows.length) continue
    byPair.set(pair, [...rows.filter((kept) => kept.language), { ...row, language }])
  }
  const list = [...byPair.values()].flat()
  if (!list.length) return
  const voiceIds = [...new Set(list.map((row) => row.voiceId))]
  try {
    await query(
      `INSERT INTO voices (content_id)
       SELECT id FROM content WHERE id = ANY($1::uuid[]) AND kind = 'voice'
       ON CONFLICT DO NOTHING`,
      [voiceIds],
    )
    const params = [
      list.map((row) => row.appearanceId),
      list.map((row) => row.voiceId),
      list.map((row) => row.language),
    ]
    // Unique (appearance, voice, language) lets NULL languages repeat, so an
    // unlabeled credit is only written when the pair has no credit at all.
    await query(
      `DELETE FROM voice_credits vc
       USING unnest($1::uuid[], $2::uuid[], $3::text[]) AS t(appearance_id, voice_id, language)
       WHERE t.language IS NOT NULL
         AND vc.appearance_id = t.appearance_id AND vc.voice_id = t.voice_id
         AND (vc.language IS NULL OR lower(vc.language) = 'unknown')`,
      params,
    )
    await query(
      `INSERT INTO voice_credits (appearance_id, voice_id, language)
       SELECT t.appearance_id, t.voice_id, t.language
       FROM unnest($1::uuid[], $2::uuid[], $3::text[]) AS t(appearance_id, voice_id, language)
       JOIN voices v ON v.content_id = t.voice_id
       WHERE NOT EXISTS (
         SELECT 1 FROM voice_credits x
         WHERE x.appearance_id = t.appearance_id AND x.voice_id = t.voice_id
           AND (t.language IS NULL OR x.language = t.language)
       )
       ON CONFLICT DO NOTHING`,
      params,
    )
  } catch (error) {
    console.error('Failed to save voice credits:', error.message)
  }
}

const SUBTYPE_SQL = {
  character: `WITH dv AS (DELETE FROM voices WHERE content_id = $1),
                   ds AS (DELETE FROM studios WHERE content_id = $1)
              INSERT INTO characters (content_id, english_name) VALUES ($1, $2)
              ON CONFLICT (content_id) DO UPDATE SET english_name = EXCLUDED.english_name`,
  voice: `WITH dc AS (DELETE FROM characters WHERE content_id = $1),
               ds AS (DELETE FROM studios WHERE content_id = $1)
          INSERT INTO voices (content_id, english_name) VALUES ($1, $2)
          ON CONFLICT (content_id) DO UPDATE SET english_name = EXCLUDED.english_name`,
  studio: `WITH dc AS (DELETE FROM characters WHERE content_id = $1),
                dv AS (DELETE FROM voices WHERE content_id = $1)
           INSERT INTO studios (content_id) VALUES ($1)
           ON CONFLICT DO NOTHING`,
}

Entity.prototype.save = async function save() {
  const kind = kindFromEntityType(this.entityType)
  // Admin edits win over whatever the catalog sync put on this document.
  applyAdminOverrides(this, await loadAdminOverrides(this._id), kind)
  // An id collision must never turn a title (or another person kind) into this entity.
  const { rowCount } = await query(
    `INSERT INTO content (id, kind, name, native_name, about, image_path, mal_id, tmdb_id, anilist_id, created_at, updated_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9, COALESCE((SELECT created_at FROM content WHERE id=$1), now()), now())
     ON CONFLICT (id) DO UPDATE SET
       name = EXCLUDED.name,
       native_name = EXCLUDED.native_name,
       about = EXCLUDED.about,
       image_path = EXCLUDED.image_path,
       mal_id = EXCLUDED.mal_id,
       tmdb_id = EXCLUDED.tmdb_id,
       anilist_id = EXCLUDED.anilist_id,
       updated_at = now()
     WHERE content.kind = EXCLUDED.kind`,
    [
      this._id,
      kind,
      this.name,
      this.nativeName || null,
      this.about || null,
      this.imagePath || null,
      this.malId || null,
      this.tmdbId || null,
      this.anilistId || null,
    ],
  )
  if (!rowCount) {
    throw new Error(`Refusing to save ${kind} ${this._id}: id belongs to another content kind`)
  }

  await query(
    SUBTYPE_SQL[kind],
    kind === 'studio' ? [this._id] : [this._id, this.englishName || null],
  )

  const akas = [...new Set(this.alternativeNames || [])].filter(Boolean)
  await query('DELETE FROM content_akas WHERE content_id = $1 AND name <> ALL($2::text[])', [
    this._id,
    akas,
  ])
  if (akas.length) {
    await query(
      `INSERT INTO content_akas (content_id, name)
       SELECT $1, unnest($2::text[])
       ON CONFLICT DO NOTHING`,
      [this._id, akas],
    )
  }

  if (kind === 'character') {
    const appearances = (this.appearances || [])
      .map((appearance) => ({ appearance, workId: asId(appearance.content) }))
      .filter((row) => row.workId)
    try {
      const ids = await upsertAppearances(
        appearances.map(({ appearance, workId }) => ({
          workId,
          characterId: this._id,
          role: appearance.role,
          importance: appearance.importance,
        })),
      )
      const credits = []
      for (const { appearance, workId } of appearances) {
        const appearanceId = ids.get(`${workId}:${this._id}`)
        for (const credit of appearance.voiceActors || []) {
          const voiceId = credit.entity ? asId(credit.entity) : null
          if (appearanceId && voiceId) {
            credits.push({ appearanceId, voiceId, language: credit.language })
          }
        }
      }
      await insertVoiceCredits(credits)
      const keptWorks = [...new Set([...ids.keys()].map((key) => key.split(':')[0]))]
      if (keptWorks.length) {
        await query(
          `DELETE FROM appearances
           WHERE character_id = $1
             AND NOT (work_id::text = ANY($2::text[]))`,
          [this._id, keptWorks],
        )
      }
    } catch (error) {
      console.error('Failed to save character appearances:', error.message)
    }
  }

  if (kind === 'voice') {
    const rows = (this.appearances || [])
      .map((appearance) => ({
        appearance,
        workId: asId(appearance.content),
        characterId: asId(appearance.character),
      }))
      .filter((row) => row.workId && row.characterId)
    try {
      const ids = await upsertAppearances(
        rows.map(({ appearance, workId, characterId }) => ({
          workId,
          characterId,
          role: appearance.role,
          importance: appearance.importance,
        })),
      )
      await insertVoiceCredits(
        rows.map(({ appearance, workId, characterId }) => ({
          appearanceId: ids.get(`${workId}:${characterId}`),
          voiceId: this._id,
          language: appearance.language,
        })),
      )
    } catch (error) {
      console.error('Failed to save voice appearances:', error.message)
    }
  }

  if (kind === 'studio') {
    await query('DELETE FROM studio_credits WHERE studio_id = $1', [this._id])
    const workIds = [
      ...new Set((this.appearances || []).map((row) => asId(row.content)).filter(isUuid)),
    ]
    if (workIds.length) {
      await query(
        `INSERT INTO studio_credits (work_id, studio_id)
         SELECT w.id, $2 FROM content w
         WHERE w.id = ANY($1::uuid[]) AND w.kind IN ('movie', 'series', 'special')
         ON CONFLICT DO NOTHING`,
        [workIds, this._id],
      )
    }
  }

  this.$isNew = false
  return this
}

const PEOPLE_FROM = `
  content e
  LEFT JOIN characters ch ON ch.content_id = e.id
  LEFT JOIN voices v ON v.content_id = e.id
  LEFT JOIN studios st ON st.content_id = e.id
`

async function execFind(filter, q) {
  const compiled = compileMongoFilter(filter, 'entities')
  const order = compileSort(q._sort || { favoritesCount: -1, name: 1 }, 'entities')
  let sql = `SELECT e.*, ch.english_name AS character_english, v.english_name AS voice_english,
    (SELECT count(*) FROM favorites f WHERE f.content_id = e.id) AS favorites_count
    FROM ${PEOPLE_FROM}
    WHERE e.kind IN ('character', 'voice', 'studio') AND ${compiled.sql}
    ORDER BY ${order}`
  const params = [...compiled.params]
  if (q._limit != null) {
    params.push(q._limit)
    sql += ` LIMIT $${params.length}`
  }
  const { rows } = await query(sql, params)
  const docs = rows.map(
    (row) =>
      new Entity(
        mapEntityRow({
          ...row,
          english_name: row.character_english || row.voice_english,
        }),
        { fromDb: true },
      ),
  )
  await loadEntityChildren(docs)
  return q._lean ? docs.map((doc) => doc.toJSON()) : docs
}

Entity.find = function find(filter = {}) {
  return new DocQuery((q) => execFind(filter, q))
}

Entity.findOne = function findOne(filter = {}) {
  return new DocQuery(async (q) => {
    q._limit = 1
    const docs = await execFind(filter, q)
    return docs[0] || null
  })
}

Entity.findById = function findById(id) {
  if (!id) return new DocQuery(async () => null)
  return Entity.findOne({ _id: String(id) })
}

Entity.updateMany = async function updateMany(filter = {}, update = {}) {
  const pullContent = update?.$pull?.appearances?.content
  if (!pullContent) return { modifiedCount: 0 }
  const compiled = compileMongoFilter(filter, 'entities')
  const params = [...compiled.params, asId(pullContent)]
  const result = await query(
    `DELETE FROM appearances a
     USING content e
     WHERE a.character_id = e.id
       AND e.kind = 'character'
       AND ${compiled.sql}
       AND a.work_id::text = $${params.length}`,
    params,
  )
  return { modifiedCount: result.rowCount || 0 }
}

Entity.collection = {
  dropIndex: async () => {},
}

Entity.create = async function create(data) {
  const doc = data instanceof Entity ? data : new Entity(data)
  await doc.save()
  return doc
}

export default Entity
