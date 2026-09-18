/**
 * Catalog titles stored in Postgres, with a mongoose-like document API.
 */
import crypto from 'crypto'
import { query } from '../../config/postgres.js'
import { asId } from '../db/ids.js'
import { compileMongoFilter, compileSort } from '../db/mongoFilter.js'
import { DocQuery } from '../db/query.js'

const CONTENT_COLUMNS = [
  'id',
  'mongo_id',
  'internal_id',
  'title',
  'english_title',
  'native_title',
  'original_title',
  'overview',
  'tagline',
  'content_type',
  'poster_path',
  'backdrop_path',
  'release_date',
  'last_air_date',
  'runtime',
  'episode_count',
  'season_count',
  'tmdb_id',
  'mal_id',
  'vote_average',
  'vote_count',
  'popularity',
  'unified_score',
  'user_rating_average',
  'user_rating_count',
  'user_rating_sum',
  'mal_score',
  'mal_scored_by',
  'mal_rank',
  'mal_status',
  'mal_episodes',
  'mal_media_type',
  'mal_source',
  'mal_rating',
  'broadcast_day',
  'broadcast_time',
  'next_episode_air_date',
  'next_episode_number',
  'next_episode_season',
  'airing_updated_at',
  'start_season_year',
  'start_season',
  'tmdb_has_data',
  'tmdb_last_updated',
  'mal_has_data',
  'mal_last_updated',
  'character_sync_at',
  'created_at',
  'updated_at',
]

/**
 * @param {object} row
 * @returns {object}
 */
export function mapContentRow(row) {
  if (!row) return null
  return {
    _id: row.id,
    id: row.id,
    mongoId: row.mongo_id,
    internalId: row.internal_id,
    title: row.title,
    englishTitle: row.english_title,
    nativeTitle: row.native_title,
    originalTitle: row.original_title,
    overview: row.overview,
    tagline: row.tagline,
    contentType: row.content_type,
    posterPath: row.poster_path,
    backdropPath: row.backdrop_path,
    releaseDate: row.release_date,
    lastAirDate: row.last_air_date,
    runtime: row.runtime != null ? Number(row.runtime) : null,
    episodeCount: row.episode_count != null ? Number(row.episode_count) : null,
    seasonCount: row.season_count != null ? Number(row.season_count) : null,
    tmdbId: row.tmdb_id != null ? Number(row.tmdb_id) : null,
    malId: row.mal_id != null ? Number(row.mal_id) : null,
    voteAverage: row.vote_average != null ? Number(row.vote_average) : null,
    voteCount: row.vote_count != null ? Number(row.vote_count) : null,
    popularity: row.popularity != null ? Number(row.popularity) : null,
    unifiedScore: row.unified_score != null ? Number(row.unified_score) : null,
    userRatingAverage: row.user_rating_average != null ? Number(row.user_rating_average) : null,
    userRatingCount: Number(row.user_rating_count || 0),
    userRatingSum: Number(row.user_rating_sum || 0),
    malScore: row.mal_score != null ? Number(row.mal_score) : null,
    malScoredBy: row.mal_scored_by != null ? Number(row.mal_scored_by) : null,
    malRank: row.mal_rank != null ? Number(row.mal_rank) : null,
    malStatus: row.mal_status,
    malEpisodes: row.mal_episodes != null ? Number(row.mal_episodes) : null,
    malMediaType: row.mal_media_type,
    malSource: row.mal_source,
    malRating: row.mal_rating,
    broadcastDay: row.broadcast_day,
    broadcastTime: row.broadcast_time,
    nextEpisodeAirDate: row.next_episode_air_date,
    nextEpisodeNumber: row.next_episode_number != null ? Number(row.next_episode_number) : null,
    nextEpisodeSeason: row.next_episode_season != null ? Number(row.next_episode_season) : null,
    airingUpdatedAt: row.airing_updated_at,
    startSeasonYear: row.start_season_year != null ? Number(row.start_season_year) : null,
    startSeason: row.start_season,
    dataSources: {
      tmdb: { hasData: Boolean(row.tmdb_has_data), lastUpdated: row.tmdb_last_updated },
      mal: { hasData: Boolean(row.mal_has_data), lastUpdated: row.mal_last_updated },
    },
    characterSyncAt: row.character_sync_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    lastUpdated: row.updated_at,
    genres: [],
    studios: [],
    productionCompanies: [],
    originCountries: [],
    alternativeTitles: [],
    franchise: null,
    relationships: { sequels: [], prequels: [], related: [], franchise: null },
  }
}

function groupBy(rows, key) {
  const map = new Map()
  for (const row of rows) {
    const id = String(row[key])
    if (!map.has(id)) map.set(id, [])
    map.get(id).push(row)
  }
  return map
}

/**
 * @param {object[]} docs
 * @returns {Promise<object[]>}
 */
export async function attachContentRelations(docs) {
  if (!docs.length) return docs
  const ids = docs.map((doc) => doc._id)
  const [genres, alts, countries, studios, companies, members, relations] = await Promise.all([
    query('SELECT * FROM content_genres WHERE content_id = ANY($1::uuid[])', [ids]),
    query('SELECT * FROM content_alternative_titles WHERE content_id = ANY($1::uuid[])', [ids]),
    query('SELECT * FROM content_origin_countries WHERE content_id = ANY($1::uuid[])', [ids]),
    query('SELECT * FROM content_studio_names WHERE content_id = ANY($1::uuid[])', [ids]),
    query('SELECT * FROM content_production_companies WHERE content_id = ANY($1::uuid[])', [ids]),
    query(
      `SELECT fm.content_id, f.name
       FROM franchise_members fm
       JOIN franchises f ON f.id = fm.franchise_id
       WHERE fm.content_id = ANY($1::uuid[])`,
      [ids],
    ),
    query(
      `SELECT from_id, to_id, kind FROM content_relations
       WHERE from_id = ANY($1::uuid[])`,
      [ids],
    ),
  ])

  const byGenre = groupBy(genres.rows, 'content_id')
  const byAlt = groupBy(alts.rows, 'content_id')
  const byCountry = groupBy(countries.rows, 'content_id')
  const byStudio = groupBy(studios.rows, 'content_id')
  const byCompany = groupBy(companies.rows, 'content_id')
  const franchiseById = new Map(members.rows.map((row) => [String(row.content_id), row.name]))
  const relByFrom = groupBy(relations.rows, 'from_id')

  for (const doc of docs) {
    const id = String(doc._id)
    doc.genres = (byGenre.get(id) || []).map((row) => ({ id: row.tmdb_id, name: row.name }))
    doc.alternativeTitles = (byAlt.get(id) || []).map((row) => row.title)
    doc.originCountries = (byCountry.get(id) || []).map((row) => row.country_code)
    doc.studios = (byStudio.get(id) || []).map((row) => row.name)
    doc.productionCompanies = (byCompany.get(id) || []).map((row) => row.name)
    doc.franchise = franchiseById.get(id) || null
    const edges = relByFrom.get(id) || []
    doc.relationships = {
      sequels: edges.filter((row) => row.kind === 'sequel').map((row) => String(row.to_id)),
      prequels: edges.filter((row) => row.kind === 'prequel').map((row) => String(row.to_id)),
      related: edges
        .filter((row) => row.kind !== 'sequel' && row.kind !== 'prequel')
        .map((row) => String(row.to_id)),
      franchise: doc.franchise,
    }
    doc.displayTitle = doc.englishTitle || doc.title || doc.nativeTitle || doc.originalTitle
  }
  return docs
}

function toDoc(plain, isNew = false) {
  const doc = new Content(plain, { fromDb: !isNew })
  return doc
}

async function fetchContent(filter, options = {}) {
  const compiled = compileMongoFilter(filter, 'content')
  const order = compileSort(options.sort, 'content')
  let sql = `SELECT c.* FROM content c WHERE ${compiled.sql} ORDER BY ${order}`
  const params = [...compiled.params]
  if (options.limit != null) {
    params.push(Number(options.limit))
    sql += ` LIMIT $${params.length}`
  }
  if (options.skip) {
    params.push(Number(options.skip))
    sql += ` OFFSET $${params.length}`
  }
  const { rows } = await query(sql, params)
  const docs = await attachContentRelations(rows.map(mapContentRow))
  return docs.map((plain) => toDoc(plain, false))
}

/**
 * @param {object} data
 * @param {{ fromDb?: boolean }} [options]
 */
function Content(data = {}, options = {}) {
  Object.assign(this, {
    genres: [],
    studios: [],
    productionCompanies: [],
    originCountries: [],
    alternativeTitles: [],
    relationships: { sequels: [], prequels: [], related: [] },
    dataSources: { tmdb: { hasData: false }, mal: { hasData: false } },
    userRatingCount: 0,
    userRatingSum: 0,
    ...data,
  })
  if (!this._id) this._id = data.id || crypto.randomUUID()
  this.id = this._id
  this.$isNew = options.fromDb ? false : true
}

Content.prototype.isComplete = function isComplete() {
  return Boolean(this.title && this.overview && (this.posterPath || this.backdropPath))
}

Content.prototype.getUnifiedGenres = function getUnifiedGenres() {
  const map = new Map()
  for (const genre of this.genres || []) {
    const name = typeof genre === 'string' ? genre : genre?.name
    if (name) map.set(name.toLowerCase(), typeof genre === 'string' ? { name } : genre)
  }
  return [...map.values()]
}

Content.prototype.toJSON = function toJSON() {
  const { $isNew, password, ...rest } = this
  return { ...rest, _id: this._id, id: this._id }
}

Content.prototype.toObject = function toObject() {
  return this.toJSON()
}

/**
 * @returns {Promise<Content>}
 */
Content.prototype.save = async function save() {
  if (!this.internalId) {
    const slug = String(this.englishTitle || this.title || 'unknown')
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '-')
      .slice(0, 50)
    this.internalId = `${this.contentType || 'tv'}-${slug}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  }

  const values = [
    this._id,
    this.mongoId || null,
    this.internalId,
    this.title,
    this.englishTitle || null,
    this.nativeTitle || null,
    this.originalTitle || this.nativeTitle || null,
    this.overview || null,
    this.tagline || null,
    this.contentType || 'tv',
    this.posterPath || null,
    this.backdropPath || null,
    this.releaseDate || null,
    this.lastAirDate || null,
    this.runtime ?? null,
    this.episodeCount ?? null,
    this.seasonCount ?? null,
    this.tmdbId ?? null,
    this.malId ?? null,
    this.voteAverage ?? null,
    this.voteCount ?? null,
    this.popularity ?? null,
    this.unifiedScore ?? null,
    this.userRatingAverage ?? null,
    this.userRatingCount ?? 0,
    this.userRatingSum ?? 0,
    this.malScore ?? null,
    this.malScoredBy ?? null,
    this.malRank ?? null,
    this.malStatus || null,
    this.malEpisodes ?? null,
    this.malMediaType || null,
    this.malSource || null,
    this.malRating || null,
    this.broadcastDay || null,
    this.broadcastTime || null,
    this.nextEpisodeAirDate || null,
    this.nextEpisodeNumber ?? null,
    this.nextEpisodeSeason ?? null,
    this.airingUpdatedAt || null,
    this.startSeasonYear ?? null,
    this.startSeason || null,
    Boolean(this.dataSources?.tmdb?.hasData),
    this.dataSources?.tmdb?.lastUpdated || null,
    Boolean(this.dataSources?.mal?.hasData),
    this.dataSources?.mal?.lastUpdated || null,
    this.characterSyncAt || null,
  ]

  await query(
    `INSERT INTO content (${CONTENT_COLUMNS.filter((col) => col !== 'created_at' && col !== 'updated_at').join(', ')}, created_at, updated_at)
     VALUES (${values.map((_, i) => `$${i + 1}`).join(', ')}, COALESCE((SELECT created_at FROM content WHERE id = $1), now()), now())
     ON CONFLICT (id) DO UPDATE SET
       mongo_id = EXCLUDED.mongo_id,
       internal_id = EXCLUDED.internal_id,
       title = EXCLUDED.title,
       english_title = EXCLUDED.english_title,
       native_title = EXCLUDED.native_title,
       original_title = EXCLUDED.original_title,
       overview = EXCLUDED.overview,
       tagline = EXCLUDED.tagline,
       content_type = EXCLUDED.content_type,
       poster_path = EXCLUDED.poster_path,
       backdrop_path = EXCLUDED.backdrop_path,
       release_date = EXCLUDED.release_date,
       last_air_date = EXCLUDED.last_air_date,
       runtime = EXCLUDED.runtime,
       episode_count = EXCLUDED.episode_count,
       season_count = EXCLUDED.season_count,
       tmdb_id = EXCLUDED.tmdb_id,
       mal_id = EXCLUDED.mal_id,
       vote_average = EXCLUDED.vote_average,
       vote_count = EXCLUDED.vote_count,
       popularity = EXCLUDED.popularity,
       unified_score = EXCLUDED.unified_score,
       user_rating_average = EXCLUDED.user_rating_average,
       user_rating_count = EXCLUDED.user_rating_count,
       user_rating_sum = EXCLUDED.user_rating_sum,
       mal_score = EXCLUDED.mal_score,
       mal_scored_by = EXCLUDED.mal_scored_by,
       mal_rank = EXCLUDED.mal_rank,
       mal_status = EXCLUDED.mal_status,
       mal_episodes = EXCLUDED.mal_episodes,
       mal_media_type = EXCLUDED.mal_media_type,
       mal_source = EXCLUDED.mal_source,
       mal_rating = EXCLUDED.mal_rating,
       broadcast_day = EXCLUDED.broadcast_day,
       broadcast_time = EXCLUDED.broadcast_time,
       next_episode_air_date = EXCLUDED.next_episode_air_date,
       next_episode_number = EXCLUDED.next_episode_number,
       next_episode_season = EXCLUDED.next_episode_season,
       airing_updated_at = EXCLUDED.airing_updated_at,
       start_season_year = EXCLUDED.start_season_year,
       start_season = EXCLUDED.start_season,
       tmdb_has_data = EXCLUDED.tmdb_has_data,
       tmdb_last_updated = EXCLUDED.tmdb_last_updated,
       mal_has_data = EXCLUDED.mal_has_data,
       mal_last_updated = EXCLUDED.mal_last_updated,
       character_sync_at = EXCLUDED.character_sync_at,
       updated_at = now()`,
    values,
  )

  await replaceChildren(this)
  this.$isNew = false
  return this
}

async function replaceChildren(doc) {
  const id = doc._id
  await query('DELETE FROM content_genres WHERE content_id = $1', [id])
  await query('DELETE FROM content_alternative_titles WHERE content_id = $1', [id])
  await query('DELETE FROM content_origin_countries WHERE content_id = $1', [id])
  await query('DELETE FROM content_studio_names WHERE content_id = $1', [id])
  await query('DELETE FROM content_production_companies WHERE content_id = $1', [id])

  for (const genre of doc.genres || []) {
    const name = typeof genre === 'string' ? genre : genre?.name
    if (!name) continue
    await query(
      'INSERT INTO content_genres (content_id, tmdb_id, name) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING',
      [id, typeof genre === 'object' ? genre.id || null : null, name],
    )
  }
  for (const title of [...new Set(doc.alternativeTitles || [])].filter(Boolean)) {
    await query(
      'INSERT INTO content_alternative_titles (content_id, title) VALUES ($1, $2) ON CONFLICT DO NOTHING',
      [id, title],
    )
  }
  for (const country of [...new Set(doc.originCountries || [])].filter(Boolean)) {
    if (String(country).length !== 2) continue
    await query(
      'INSERT INTO content_origin_countries (content_id, country_code) VALUES ($1, $2) ON CONFLICT DO NOTHING',
      [id, String(country).toUpperCase()],
    )
  }
  for (const name of [...new Set(doc.studios || [])].filter(Boolean)) {
    await query(
      'INSERT INTO content_studio_names (content_id, name) VALUES ($1, $2) ON CONFLICT DO NOTHING',
      [id, name],
    )
  }
  for (const name of [...new Set(doc.productionCompanies || [])].filter(Boolean)) {
    await query(
      'INSERT INTO content_production_companies (content_id, name) VALUES ($1, $2) ON CONFLICT DO NOTHING',
      [id, name],
    )
  }

  const franchiseName = doc.franchise || doc.relationships?.franchise
  await query('DELETE FROM franchise_members WHERE content_id = $1', [id])
  if (franchiseName) {
    const existing = await query('SELECT id FROM franchises WHERE name = $1', [franchiseName])
    let franchiseId = existing.rows[0]?.id
    if (!franchiseId) {
      franchiseId = crypto.randomUUID()
      await query('INSERT INTO franchises (id, name) VALUES ($1, $2) ON CONFLICT (name) DO NOTHING', [
        franchiseId,
        franchiseName,
      ])
      const again = await query('SELECT id FROM franchises WHERE name = $1', [franchiseName])
      franchiseId = again.rows[0].id
    }
    await query(
      'INSERT INTO franchise_members (franchise_id, content_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
      [franchiseId, id],
    )
  }

  if (doc.$replaceRelations) {
    const rel = doc.relationships || {}
    await query('DELETE FROM content_relations WHERE from_id = $1', [id])
    const groups = [
      [rel.sequels, 'sequel'],
      [rel.prequels, 'prequel'],
      [rel.related, 'other'],
    ]
    for (const [list, kind] of groups) {
      for (const ref of list || []) {
        const toId = asId(ref)
        const resolved = await Content.findById(toId)
        if (!resolved || String(resolved._id) === String(id)) continue
        await query(
          `INSERT INTO content_relations (from_id, to_id, kind, source)
           VALUES ($1, $2, $3, 'mal') ON CONFLICT DO NOTHING`,
          [id, resolved._id, kind],
        )
      }
    }
  }
}

Content.find = function find(filter = {}) {
  return new DocQuery(async (q) => {
    const docs = await fetchContent(filter, { sort: q._sort, skip: q._skip, limit: q._limit })
    return q._lean ? docs.map((doc) => doc.toJSON()) : docs
  })
}

Content.findOne = function findOne(filter = {}) {
  return new DocQuery(async (q) => {
    const docs = await fetchContent(filter, { sort: q._sort, limit: 1 })
    const doc = docs[0] || null
    if (!doc) return null
    return q._lean ? doc.toJSON() : doc
  })
}

Content.findById = function findById(id) {
  if (!id) return new DocQuery(async () => null)
  return Content.findOne({ _id: String(id) })
}

Content.countDocuments = async function countDocuments(filter = {}) {
  const compiled = compileMongoFilter(filter, 'content')
  const { rows } = await query(
    `SELECT count(*)::int AS n FROM content c WHERE ${compiled.sql}`,
    compiled.params,
  )
  return rows[0].n
}

Content.findByIdAndUpdate = async function findByIdAndUpdate(id, update) {
  const doc = await Content.findById(id)
  if (!doc) return null
  Object.assign(doc, update)
  await doc.save()
  return doc
}

Content.findByIdAndDelete = async function findByIdAndDelete(id) {
  const doc = await Content.findById(id)
  if (!doc) return null
  await query('DELETE FROM content WHERE id = $1', [doc._id])
  return doc
}

Content.deleteMany = async function deleteMany(filter = {}) {
  const compiled = compileMongoFilter(filter, 'content')
  const result = await query(`DELETE FROM content c WHERE ${compiled.sql}`, compiled.params)
  return { deletedCount: result.rowCount || 0 }
}

Content.updateMany = async function updateMany(filter = {}, update = {}) {
  const set = update.$set || update
  const docs = await fetchContent(filter)
  for (const doc of docs) {
    Object.assign(doc, set)
    await doc.save()
  }
  return { matchedCount: docs.length, modifiedCount: docs.length }
}

Content.findByExternalId = function findByExternalId(id, source = 'tmdb') {
  const parsed = Number(id)
  if (source === 'mal') return Content.findOne({ malId: parsed })
  return Content.findOne({ tmdbId: parsed })
}

Content.findSimilar = async function findSimilar(content, limit = 10) {
  const names = (content.genres || []).map((genre) => genre.name || genre).filter(Boolean)
  if (!names.length) return []
  return Content.find({
    _id: { $ne: content._id },
    contentType: content.contentType,
    'genres.name': { $in: names },
  })
    .sort({ popularity: -1 })
    .limit(limit)
}

Content.aggregate = async function aggregate(pipeline = []) {
  const match = pipeline.find((stage) => stage.$match)?.$match || {}
  const sort = pipeline.find((stage) => stage.$sort)?.$sort
  const skip = pipeline.find((stage) => stage.$skip)?.$skip || 0
  const limit = pipeline.find((stage) => stage.$limit)?.$limit
  const docs = await fetchContent(match, { sort, skip, limit })
  return docs.map((doc) => doc.toJSON())
}

Content.collection = {
  dropIndex: async () => {},
}

export default Content
