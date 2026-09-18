/**
 * Characters, voice actors, and studios stored in Postgres.
 */
import crypto from 'crypto'
import { query } from '../../config/postgres.js'
import { compileMongoFilter, compileSort } from '../db/mongoFilter.js'
import { DocQuery } from '../db/query.js'
import { asId } from '../db/ids.js'
import Content, { attachContentRelations, mapContentRow } from './Content.js'

function mapEntityRow(row) {
  return {
    _id: row.id,
    id: row.id,
    mongoId: row.mongo_id,
    entityType: row.entity_type,
    name: row.name,
    englishName: row.english_name,
    nativeName: row.native_name,
    about: row.about,
    imagePath: row.image_path,
    malId: row.mal_id != null ? Number(row.mal_id) : null,
    tmdbId: row.tmdb_id != null ? Number(row.tmdb_id) : null,
    favoritesCount: Number(row.favorites_count || 0),
    lastSyncedAt: row.last_synced_at,
    voiceCreditsSyncedAt: row.voice_credits_synced_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    alternativeNames: [],
    appearances: [],
  }
}

async function loadEntityChildren(doc) {
  const [names, appearances] = await Promise.all([
    query('SELECT name FROM entity_alternative_names WHERE entity_id = $1', [doc._id]),
    query(
      `SELECT a.*, json_agg(
         json_build_object(
           'name', v.name,
           'language', v.language,
           'malId', v.mal_id,
           'tmdbId', v.tmdb_id,
           'imagePath', v.image_path,
           'entity', v.voice_actor_id
         )
       ) FILTER (WHERE v.id IS NOT NULL) AS voice_actors
       FROM appearances a
       LEFT JOIN voice_credits v ON v.appearance_id = a.id
       WHERE a.character_id = $1 OR EXISTS (
         SELECT 1 FROM voice_credits vc WHERE vc.appearance_id = a.id AND vc.voice_actor_id = $1
       )
       GROUP BY a.id`,
      [doc._id],
    ),
  ])
  doc.alternativeNames = names.rows.map((row) => row.name)
  doc.appearances = appearances.rows.map((row) => ({
    content: row.content_id,
    character: row.character_id,
    role: row.role,
    importance: row.importance,
    characterName: row.character_name,
    language: row.language,
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
    const { rows } = await query('SELECT * FROM content WHERE id = ANY($1::uuid[])', [contentIds])
    contents = await attachContentRelations(rows.map(mapContentRow))
  }
  const contentById = new Map(contents.map((item) => [String(item._id), item]))
  const characterById = new Map()
  if (characterIds.length) {
    const { rows } = await query('SELECT * FROM entities WHERE id = ANY($1::uuid[])', [characterIds])
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

Entity.prototype.save = async function save() {
  await query(
    `INSERT INTO entities (
       id, mongo_id, entity_type, name, english_name, native_name, about, image_path,
       mal_id, tmdb_id, favorites_count, last_synced_at, voice_credits_synced_at, created_at, updated_at
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13, COALESCE((SELECT created_at FROM entities WHERE id=$1), now()), now())
     ON CONFLICT (id) DO UPDATE SET
       entity_type = EXCLUDED.entity_type,
       name = EXCLUDED.name,
       english_name = EXCLUDED.english_name,
       native_name = EXCLUDED.native_name,
       about = EXCLUDED.about,
       image_path = EXCLUDED.image_path,
       mal_id = EXCLUDED.mal_id,
       tmdb_id = EXCLUDED.tmdb_id,
       favorites_count = EXCLUDED.favorites_count,
       last_synced_at = EXCLUDED.last_synced_at,
       voice_credits_synced_at = EXCLUDED.voice_credits_synced_at,
       updated_at = now()`,
    [
      this._id,
      this.mongoId || null,
      this.entityType,
      this.name,
      this.englishName || null,
      this.nativeName || null,
      this.about || null,
      this.imagePath || null,
      this.malId || null,
      this.tmdbId || null,
      this.favoritesCount || 0,
      this.lastSyncedAt || null,
      this.voiceCreditsSyncedAt || null,
    ],
  )

  await query('DELETE FROM entity_alternative_names WHERE entity_id = $1', [this._id])
  for (const name of [...new Set(this.alternativeNames || [])].filter(Boolean)) {
    await query(
      'INSERT INTO entity_alternative_names (entity_id, name) VALUES ($1, $2) ON CONFLICT DO NOTHING',
      [this._id, name],
    )
  }

  if (this.entityType === 'character') {
    await query('DELETE FROM appearances WHERE character_id = $1', [this._id])
    for (const appearance of this.appearances || []) {
      const content = await Content.findById(asId(appearance.content))
      if (!content) continue
      const appearanceId = crypto.randomUUID()
      await query(
        `INSERT INTO appearances (id, content_id, character_id, role, importance, character_name, language)
         VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        [
          appearanceId,
          content._id,
          this._id,
          appearance.role || 'Supporting',
          appearance.importance || 0,
          appearance.characterName || null,
          appearance.language || null,
        ],
      )
      for (const credit of appearance.voiceActors || []) {
        await query(
          `INSERT INTO voice_credits (appearance_id, voice_actor_id, name, language, mal_id, tmdb_id, image_path)
           VALUES ($1,$2,$3,$4,$5,$6,$7)`,
          [
            appearanceId,
            credit.entity ? asId(credit.entity) : null,
            credit.name,
            credit.language || null,
            credit.malId || null,
            credit.tmdbId || null,
            credit.imagePath || null,
          ],
        )
      }
    }
  }

  this.$isNew = false
  return this
}

async function execFind(filter, q) {
  const compiled = compileMongoFilter(filter, 'entities')
  const order = compileSort(q._sort || { favoritesCount: -1, name: 1 }, 'entities')
  let sql = `SELECT e.* FROM entities e WHERE ${compiled.sql} ORDER BY ${order}`
  const params = [...compiled.params]
  if (q._limit != null) {
    params.push(q._limit)
    sql += ` LIMIT $${params.length}`
  }
  const { rows } = await query(sql, params)
  const docs = []
  for (const row of rows) {
    const doc = new Entity(mapEntityRow(row), { fromDb: true })
    Object.assign(doc, mapEntityRow(row))
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

Entity.updateMany = async function updateMany() {
  return { modifiedCount: 0 }
}

Entity.collection = {
  dropIndex: async () => {},
}

export default Entity
