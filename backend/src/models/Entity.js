/**
 * Characters, voice actors, and studios as content subtypes.
 */
import crypto from 'crypto'
import { query } from '../../config/postgres.js'
import { appearanceRole, appearanceRoleToApi, entityTypeFromKind, kindFromEntityType } from '../db/kinds.js'
import { compileMongoFilter, compileSort } from '../db/mongoFilter.js'
import { DocQuery } from '../db/query.js'
import { asId } from '../db/ids.js'
import Content, { attachContentRelations, mapContentRow } from './Content.js'

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
    favoritesCount: Number(row.favorites_count || 0),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    alternativeNames: [],
    appearances: [],
  }
}

async function loadEntityChildren(doc) {
  const [names, appearances, studioWorks] = await Promise.all([
    query('SELECT name FROM content_akas WHERE content_id = $1', [doc._id]),
    query(
      `SELECT a.*, json_agg(
         json_build_object(
           'name', vc.name,
           'language', v.language,
           'entity', v.voice_id
         )
       ) FILTER (WHERE v.id IS NOT NULL) AS voice_actors
       FROM appearances a
       LEFT JOIN voice_credits v ON v.appearance_id = a.id
       LEFT JOIN content vc ON vc.id = v.voice_id
       WHERE a.character_id = $1 OR EXISTS (
         SELECT 1 FROM voice_credits vc2 WHERE vc2.appearance_id = a.id AND vc2.voice_id = $1
       )
       GROUP BY a.id`,
      [doc._id],
    ),
    query('SELECT work_id FROM studio_credits WHERE studio_id = $1', [doc._id]),
  ])
  doc.alternativeNames = names.rows.map((row) => row.name)
  if (doc.entityType === 'studio') {
    doc.appearances = studioWorks.rows.map((row) => ({
      content: row.work_id,
      character: null,
      role: 'Supporting',
      importance: 0,
      voiceActors: [],
    }))
    return doc
  }
  doc.appearances = appearances.rows.map((row) => ({
    content: row.work_id,
    character: row.character_id,
    role: appearanceRoleToApi(row.role),
    importance: row.importance,
    voiceActors: row.voice_actors || [],
  }))
  return doc
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

async function workExists(workId) {
  const id = asId(workId)
  if (!id) return false
  const { rows } = await query(
    `SELECT 1 FROM content WHERE id::text = $1 AND kind IN ('movie', 'series', 'special')`,
    [id],
  )
  return Boolean(rows[0])
}

async function upsertAppearance(workId, characterId, role, importance) {
  const { rows } = await query(
    `INSERT INTO appearances (id, work_id, character_id, role, importance)
     VALUES ($1,$2,$3,$4,$5)
     ON CONFLICT (work_id, character_id) DO UPDATE SET
       role = EXCLUDED.role,
       importance = GREATEST(appearances.importance, EXCLUDED.importance)
     RETURNING id`,
    [crypto.randomUUID(), workId, characterId, appearanceRole(role), importance || 0],
  )
  return rows[0]?.id
}

async function insertVoiceCredit(appearanceId, voiceId, language) {
  if (!appearanceId || !voiceId) return
  try {
    const existing = await query('SELECT content_id FROM voices WHERE content_id = $1', [voiceId])
    if (!existing.rows[0]) {
      const kindRow = await query('SELECT kind FROM content WHERE id = $1', [voiceId])
      if (kindRow.rows[0]?.kind !== 'voice') return
      await query('INSERT INTO voices (content_id) VALUES ($1) ON CONFLICT DO NOTHING', [voiceId])
    }
    await query(
      `INSERT INTO voice_credits (appearance_id, voice_id, language)
       VALUES ($1,$2,$3)
       ON CONFLICT DO NOTHING`,
      [appearanceId, voiceId, language || null],
    )
  } catch (error) {
    console.error('Failed to save voice credit:', error.message)
  }
}

Entity.prototype.save = async function save() {
  const kind = kindFromEntityType(this.entityType)
  await query(
    `INSERT INTO content (id, kind, name, native_name, about, image_path, mal_id, tmdb_id, created_at, updated_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8, COALESCE((SELECT created_at FROM content WHERE id=$1), now()), now())
     ON CONFLICT (id) DO UPDATE SET
       kind = EXCLUDED.kind,
       name = EXCLUDED.name,
       native_name = EXCLUDED.native_name,
       about = EXCLUDED.about,
       image_path = EXCLUDED.image_path,
       mal_id = EXCLUDED.mal_id,
       tmdb_id = EXCLUDED.tmdb_id,
       updated_at = now()`,
    [
      this._id,
      kind,
      this.name,
      this.nativeName || null,
      this.about || null,
      this.imagePath || null,
      this.malId || null,
      this.tmdbId || null,
    ],
  )

  if (kind === 'character') {
    await query('DELETE FROM voices WHERE content_id = $1', [this._id])
    await query('DELETE FROM studios WHERE content_id = $1', [this._id])
    await query(
      `INSERT INTO characters (content_id, english_name) VALUES ($1, $2)
       ON CONFLICT (content_id) DO UPDATE SET english_name = EXCLUDED.english_name`,
      [this._id, this.englishName || null],
    )
  } else if (kind === 'voice') {
    await query('DELETE FROM characters WHERE content_id = $1', [this._id])
    await query('DELETE FROM studios WHERE content_id = $1', [this._id])
    await query(
      `INSERT INTO voices (content_id, english_name) VALUES ($1, $2)
       ON CONFLICT (content_id) DO UPDATE SET english_name = EXCLUDED.english_name`,
      [this._id, this.englishName || null],
    )
  } else {
    await query('DELETE FROM characters WHERE content_id = $1', [this._id])
    await query('DELETE FROM voices WHERE content_id = $1', [this._id])
    await query(
      'INSERT INTO studios (content_id) VALUES ($1) ON CONFLICT DO NOTHING',
      [this._id],
    )
  }

  await query('DELETE FROM content_akas WHERE content_id = $1', [this._id])
  for (const name of [...new Set(this.alternativeNames || [])].filter(Boolean)) {
    await query(
      'INSERT INTO content_akas (content_id, name) VALUES ($1, $2) ON CONFLICT DO NOTHING',
      [this._id, name],
    )
  }

  if (kind === 'character') {
    const seenWorks = new Set()
    for (const appearance of this.appearances || []) {
      try {
        const workId = asId(appearance.content)
        if (!workId || seenWorks.has(workId) || !(await workExists(workId))) continue
        seenWorks.add(workId)
        const appearanceId = await upsertAppearance(
          workId,
          this._id,
          appearance.role,
          appearance.importance,
        )
        if (!appearanceId) continue
        for (const credit of appearance.voiceActors || []) {
          const voiceId = credit.entity ? asId(credit.entity) : null
          if (!voiceId) continue
          await insertVoiceCredit(appearanceId, voiceId, credit.language)
        }
      } catch (error) {
        console.error('Failed to save character appearance:', error.message)
      }
    }
    if (seenWorks.size) {
      const ids = [...seenWorks]
      await query(
        `DELETE FROM appearances
         WHERE character_id = $1
           AND NOT (work_id::text = ANY($2::text[]))`,
        [this._id, ids],
      )
    }
  }

  if (kind === 'voice') {
    for (const appearance of this.appearances || []) {
      const workId = asId(appearance.content)
      const characterId = asId(appearance.character)
      if (!workId || !characterId || !(await workExists(workId))) continue
      const appearanceId = await upsertAppearance(
        workId,
        characterId,
        appearance.role,
        appearance.importance,
      )
      if (!appearanceId) continue
      await insertVoiceCredit(appearanceId, this._id, appearance.language)
    }
  }

  if (kind === 'studio') {
    await query('DELETE FROM studio_credits WHERE studio_id = $1', [this._id])
    for (const appearance of this.appearances || []) {
      const workId = asId(appearance.content)
      if (!workId || !(await workExists(workId))) continue
      await query(
        'INSERT INTO studio_credits (work_id, studio_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
        [workId, this._id],
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
  const docs = []
  for (const row of rows) {
    const mapped = mapEntityRow({
      ...row,
      english_name: row.character_english || row.voice_english,
    })
    const doc = new Entity(mapped, { fromDb: true })
    await loadEntityChildren(doc)
    docs.push(q._lean ? doc.toJSON() : doc)
  }
  return docs
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
