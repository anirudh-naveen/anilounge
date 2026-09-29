/**
 * Watchable catalog rows (movie / series / special) over the content supertype.
 */
import crypto from 'crypto'
import { query } from '../../config/postgres.js'
import { asId } from '../db/ids.js'
import {
  airingFromMalStatus,
  contentTypeFromKind,
  kindFromContentType,
  malStatusFromAiring,
} from '../db/kinds.js'
import { compileMongoFilter, compileSort } from '../db/mongoFilter.js'
import { DocQuery } from '../db/query.js'
import { applyAdminOverrides, readEditableFields } from '../utils/adminContent.js'
import { planSyncChanges } from '../utils/syncReview.js'
import { recordSyncNotices } from '../services/syncGuard.js'

/**
 * @param {object} row
 * @returns {object}
 */
export function mapContentRow(row) {
  if (!row) return null
  const userRatingCount = Number(row.user_rating_count || 0)
  const userRatingSum = Number(row.user_rating_sum || 0)
  return {
    _id: row.id,
    id: row.id,
    title: row.title || row.name,
    englishTitle: row.english_title || row.name,
    nativeTitle: row.native_title || row.native_name,
    originalTitle: row.original_title,
    overview: row.overview || row.about,
    tagline: row.tagline,
    contentType: row.content_type || contentTypeFromKind(row.kind),
    posterPath: row.poster_path || row.image_path,
    backdropPath: row.backdrop_path,
    releaseDate: row.release_date,
    runtime: row.runtime != null ? Number(row.runtime) : null,
    episodeCount: row.episode_count != null ? Number(row.episode_count) : null,
    seasonCount: row.season_count != null ? Number(row.season_count) : null,
    tmdbId: row.tmdb_id != null ? Number(row.tmdb_id) : null,
    malId: row.mal_id != null ? Number(row.mal_id) : null,
    anilistId: row.anilist_id != null ? Number(row.anilist_id) : null,
    voteAverage: row.vote_average != null ? Number(row.vote_average) : null,
    voteCount: row.vote_count != null ? Number(row.vote_count) : null,
    popularity: row.popularity != null ? Number(row.popularity) : null,
    unifiedScore: row.unified_score != null ? Number(row.unified_score) : null,
    userRatingAverage: row.user_rating_average != null ? Number(row.user_rating_average) : null,
    userRatingCount,
    userRatingSum,
    malScore: row.mal_score != null ? Number(row.mal_score) : null,
    malScoredBy: row.mal_votes != null ? Number(row.mal_votes) : null,
    malEpisodes: row.episode_count != null ? Number(row.episode_count) : null,
    malStatus: malStatusFromAiring(row.airing_status),
    broadcastDay: row.broadcast_day,
    nextEpisodeAirDate: row.next_episode_at,
    nextEpisodeNumber: row.next_episode_number != null ? Number(row.next_episode_number) : null,
    startSeasonYear: row.start_year != null ? Number(row.start_year) : null,
    startSeason: row.start_season,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    lastUpdated: row.updated_at,
    genres: [],
    studios: [],
    originCountries: row.origin_country ? [row.origin_country] : [],
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
  const [genres, alts, studios, members, relations] = await Promise.all([
    query(
      `SELECT cg.content_id, g.name
       FROM content_genres cg
       JOIN genres g ON g.id = cg.genre_id
       WHERE cg.content_id = ANY($1::uuid[])`,
      [ids],
    ),
    query('SELECT content_id, name FROM content_akas WHERE content_id = ANY($1::uuid[])', [ids]),
    query(
      `SELECT sc.work_id AS content_id, st.id AS studio_id, st.name, st.image_path
       FROM studio_credits sc
       JOIN content st ON st.id = sc.studio_id
       WHERE sc.work_id = ANY($1::uuid[])`,
      [ids],
    ),
    query(
      `SELECT fm.member_id AS content_id, f.name
       FROM franchise_members fm
       JOIN content f ON f.id = fm.franchise_id
       WHERE fm.member_id = ANY($1::uuid[])`,
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
  const byStudio = groupBy(studios.rows, 'content_id')
  const franchiseById = new Map(members.rows.map((row) => [String(row.content_id), row.name]))
  const relByFrom = groupBy(relations.rows, 'from_id')

  for (const doc of docs) {
    const id = String(doc._id)
    doc.genres = (byGenre.get(id) || []).map((row) => ({ name: row.name }))
    doc.alternativeTitles = (byAlt.get(id) || []).map((row) => row.name)
    doc.studios = (byStudio.get(id) || []).map((row) => row.name)
    doc.studioEntities = (byStudio.get(id) || []).map((row) => ({
      _id: String(row.studio_id),
      name: row.name,
      imagePath: row.image_path || '',
    }))
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

async function fetchContent(filter, options = {}) {
  const compiled = compileMongoFilter(filter, 'content')
  const order = compileSort(options.sort, 'content')
  let sql = `SELECT c.* FROM works c WHERE ${compiled.sql} ORDER BY ${order}`
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
  return docs.map((plain) => new Content(plain, { fromDb: true }))
}

/**
 * @param {object} data
 * @param {{ fromDb?: boolean }} [options]
 */
function Content(data = {}, options = {}) {
  Object.assign(this, {
    genres: [],
    studios: [],
    originCountries: [],
    alternativeTitles: [],
    relationships: { sequels: [], prequels: [], related: [] },
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
 * Admin-set field values for a content row (`content.admin_overrides`), or `{}`.
 * A database without the column yet (schema not applied) has no overrides.
 * @param {string} id
 * @returns {Promise<Record<string, unknown>>}
 */
export async function loadAdminOverrides(id) {
  try {
    const { rows } = await query('SELECT admin_overrides FROM content WHERE id = $1', [id])
    return rows[0]?.admin_overrides || {}
  } catch (error) {
    if (error.code === '42703') return {}
    throw error
  }
}

/**
 * Never blank an existing row's editorial values, and log sync changes (and changes
 * blocked by admin locks) for the admin page; see utils/syncReview.js. New rows and
 * fields in `doc.$acceptFields` (an admin taking a blocked value) pass through.
 * @param {object} doc - Content document (mutated).
 * @param {string} kind
 * @param {Record<string, unknown>} overrides - Admin-locked fields.
 * @param {Record<string, unknown>} incoming - The caller's values before locks were applied.
 * @returns {Promise<void>}
 */
async function protectExistingValues(doc, kind, overrides, incoming) {
  const { rows } = await query('SELECT * FROM works WHERE id = $1', [doc._id])
  const row = rows[0]
  if (!row || row.kind !== kind) return
  const plan = planSyncChanges({
    kind,
    current: readEditableFields(mapContentRow(row), kind),
    incoming,
    locked: Object.keys(overrides),
    accepted: doc.$acceptFields || [],
  })
  applyAdminOverrides(doc, plan.keep, kind)
  await recordSyncNotices(doc._id, plan.notices)
}

Content.prototype.save = async function save() {
  const id = this._id
  const kind = kindFromContentType(this.contentType)
  // Admin edits win over whatever the catalog sync put on this document.
  // What the caller (usually the sync) wants, before admin locks replace it.
  const incoming = readEditableFields(this, kind)
  const overrides = await loadAdminOverrides(id)
  applyAdminOverrides(this, overrides, kind)
  await protectExistingValues(this, kind, overrides, incoming)
  const name = this.englishTitle || this.title || 'Untitled'
  const { rowCount } = await query(
    `INSERT INTO content (id, kind, name, native_name, about, image_path, mal_id, tmdb_id, anilist_id, created_at, updated_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9, COALESCE((SELECT created_at FROM content WHERE id=$1), now()), now())
     ON CONFLICT (id) DO UPDATE SET
       kind = EXCLUDED.kind,
       name = EXCLUDED.name,
       native_name = EXCLUDED.native_name,
       about = EXCLUDED.about,
       image_path = EXCLUDED.image_path,
       mal_id = EXCLUDED.mal_id,
       tmdb_id = EXCLUDED.tmdb_id,
       anilist_id = EXCLUDED.anilist_id,
       updated_at = now()
     WHERE content.kind IN ('movie', 'series', 'special')`,
    [
      id,
      kind,
      name,
      this.nativeTitle || null,
      this.overview || null,
      this.posterPath || null,
      this.malId ?? null,
      this.tmdbId ?? null,
      this.anilistId ?? null,
    ],
  )
  if (!rowCount) {
    throw new Error(`Refusing to save ${kind} ${id}: id belongs to a non-watchable content row`)
  }

  await query('DELETE FROM movies WHERE content_id = $1', [id])
  await query('DELETE FROM series WHERE content_id = $1', [id])
  await query('DELETE FROM specials WHERE content_id = $1', [id])

  const origin = (this.originCountries || []).map(String).find((code) => code.length === 2) || null
  const shared = {
    original_title: this.originalTitle || this.nativeTitle || null,
    tagline: this.tagline || null,
    backdrop_path: this.backdropPath || null,
    release_date: this.releaseDate || null,
    origin_country: origin ? origin.toUpperCase() : null,
    tmdb_score: this.voteAverage ?? null,
    tmdb_votes: this.voteCount ?? null,
    mal_score: this.malScore ?? null,
    mal_votes: this.malScoredBy ?? null,
    popularity: this.popularity ?? null,
    unified_score: this.unifiedScore ?? null,
    airing_status: airingFromMalStatus(this.malStatus),
  }

  if (kind === 'movie') {
    await query(
      `INSERT INTO movies (
         content_id, original_title, tagline, backdrop_path, release_date, origin_country,
         runtime_minutes, tmdb_score, tmdb_votes, mal_score, mal_votes, popularity, unified_score,
         airing_status
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
      [
        id,
        shared.original_title,
        shared.tagline,
        shared.backdrop_path,
        shared.release_date,
        shared.origin_country,
        this.runtime ?? null,
        shared.tmdb_score,
        shared.tmdb_votes,
        shared.mal_score,
        shared.mal_votes,
        shared.popularity,
        shared.unified_score,
        shared.airing_status,
      ],
    )
  } else if (kind === 'special') {
    await query(
      `INSERT INTO specials (
         content_id, original_title, tagline, backdrop_path, release_date, origin_country,
         runtime_minutes, tmdb_score, tmdb_votes, mal_score, mal_votes, popularity, unified_score,
         airing_status
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
      [
        id,
        shared.original_title,
        shared.tagline,
        shared.backdrop_path,
        shared.release_date,
        shared.origin_country,
        this.runtime ?? null,
        shared.tmdb_score,
        shared.tmdb_votes,
        shared.mal_score,
        shared.mal_votes,
        shared.popularity,
        shared.unified_score,
        shared.airing_status,
      ],
    )
  } else {
    await query(
      `INSERT INTO series (
         content_id, original_title, tagline, backdrop_path, release_date, origin_country,
         season_count, episode_count, airing_status, start_season, start_year, broadcast_day,
         next_episode_at, next_episode_number, tmdb_score, tmdb_votes, mal_score, mal_votes,
         popularity, unified_score
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20)`,
      [
        id,
        shared.original_title,
        shared.tagline,
        shared.backdrop_path,
        shared.release_date,
        shared.origin_country,
        this.seasonCount ?? null,
        this.episodeCount ?? this.malEpisodes ?? null,
        airingFromMalStatus(this.malStatus),
        this.startSeason || null,
        this.startSeasonYear ?? null,
        this.broadcastDay || null,
        this.nextEpisodeAirDate || null,
        this.nextEpisodeNumber ?? null,
        shared.tmdb_score,
        shared.tmdb_votes,
        shared.mal_score,
        shared.mal_votes,
        shared.popularity,
        shared.unified_score,
      ],
    )
  }

  await replaceChildren(this)
  this.$isNew = false
  return this
}

async function upsertGenre(name) {
  const existing = await query('SELECT id FROM genres WHERE lower(name) = lower($1)', [name])
  if (existing.rows[0]) return existing.rows[0].id
  const id = crypto.randomUUID()
  await query('INSERT INTO genres (id, name) VALUES ($1, $2) ON CONFLICT (name) DO NOTHING', [id, name])
  const again = await query('SELECT id FROM genres WHERE lower(name) = lower($1)', [name])
  return again.rows[0].id
}

function positiveInt(value) {
  const parsed = Number(value)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null
}

async function findStudio(where, value) {
  const { rows } = await query(
    `SELECT id, mal_id, tmdb_id, anilist_id, image_path FROM content
     WHERE kind = 'studio' AND ${where}
     ORDER BY (mal_id IS NOT NULL) DESC, created_at
     LIMIT 1`,
    [value],
  )
  return rows[0] || null
}

/**
 * Studio row for a credit: MAL producer id, AniList studio id, TMDB company id,
 * then name or alias. A studio whose id for the same source differs is never
 * matched by name. Missing external ids and logo are filled when no other
 * studio already owns them.
 * @param {string} name
 * @param {{ malId?: number, anilistId?: number, tmdbId?: number, imagePath?: string }} [ref]
 * @returns {Promise<string>}
 */
async function upsertStudio(name, ref = {}) {
  const malId = positiveInt(ref.malId)
  const anilistId = positiveInt(ref.anilistId)
  const tmdbId = positiveInt(ref.tmdbId)
  const imagePath = ref.imagePath || null
  let row = null
  if (malId) row = await findStudio('mal_id = $1', malId)
  if (!row && anilistId) row = await findStudio('anilist_id = $1', anilistId)
  if (!row && tmdbId) row = await findStudio('tmdb_id = $1', tmdbId)
  if (!row) {
    const { rows } = await query(
      `SELECT id, mal_id, tmdb_id, anilist_id, image_path FROM content s
       WHERE s.kind = 'studio'
         AND (lower(s.name) = lower($1)
              OR EXISTS (SELECT 1 FROM content_akas k WHERE k.content_id = s.id AND lower(k.name) = lower($1)))
         AND ($2::int IS NULL OR s.mal_id IS NULL OR s.mal_id = $2)
         AND ($3::int IS NULL OR s.anilist_id IS NULL OR s.anilist_id = $3)
         AND ($4::int IS NULL OR s.tmdb_id IS NULL OR s.tmdb_id = $4)
       ORDER BY (lower(s.name) = lower($1)) DESC, (s.mal_id IS NOT NULL) DESC, s.created_at
       LIMIT 1`,
      [name, malId, anilistId, tmdbId],
    )
    row = rows[0] || null
  }

  if (!row) {
    const id = crypto.randomUUID()
    await query(
      `INSERT INTO content (id, kind, name, mal_id, tmdb_id, anilist_id, image_path)
       VALUES ($1, 'studio', $2, $3, $4, $5, $6)`,
      [id, name, malId, tmdbId, anilistId, imagePath],
    )
    await query('INSERT INTO studios (content_id) VALUES ($1)', [id])
    return id
  }

  await query('INSERT INTO studios (content_id) VALUES ($1) ON CONFLICT DO NOTHING', [row.id])
  const fills = [
    ['mal_id', malId, row.mal_id == null],
    ['anilist_id', anilistId, row.anilist_id == null],
    ['tmdb_id', tmdbId, row.tmdb_id == null],
  ]
  for (const [column, value, missing] of fills) {
    if (!value || !missing) continue
    await query(
      `UPDATE content SET ${column} = $2, updated_at = now()
       WHERE id = $1 AND ${column} IS NULL
         AND NOT EXISTS (SELECT 1 FROM content o WHERE o.kind = 'studio' AND o.${column} = $2)`,
      [row.id, value],
    )
  }
  if (imagePath && !row.image_path) {
    await query(
      `UPDATE content SET image_path = $2, updated_at = now()
       WHERE id = $1 AND (image_path IS NULL OR image_path = '')`,
      [row.id, imagePath],
    )
  }
  return row.id
}

async function upsertFranchise(name) {
  const existing = await query(
    `SELECT id FROM content WHERE kind = 'franchise' AND name = $1`,
    [name],
  )
  if (existing.rows[0]) {
    await query('INSERT INTO franchises (content_id) VALUES ($1) ON CONFLICT DO NOTHING', [
      existing.rows[0].id,
    ])
    return existing.rows[0].id
  }
  const id = crypto.randomUUID()
  await query(`INSERT INTO content (id, kind, name) VALUES ($1, 'franchise', $2)`, [id, name])
  await query('INSERT INTO franchises (content_id) VALUES ($1)', [id])
  return id
}

async function replaceChildren(doc) {
  const id = doc._id
  // An empty list from the sync means "unknown", not "none": keep what the row has.
  const hasGenres = (doc.genres || []).some((genre) => (typeof genre === 'string' ? genre : genre?.name))
  const hasAkas = (doc.alternativeTitles || []).some(Boolean)
  const hasStudios = [...(doc.studios || []), ...(doc.productionCompanies || [])].some(Boolean)
  const franchiseName = doc.franchise || doc.relationships?.franchise
  if (hasGenres) await query('DELETE FROM content_genres WHERE content_id = $1', [id])
  if (hasAkas) await query('DELETE FROM content_akas WHERE content_id = $1', [id])
  if (hasStudios) await query('DELETE FROM studio_credits WHERE work_id = $1', [id])
  if (franchiseName) await query('DELETE FROM franchise_members WHERE member_id = $1', [id])

  for (const genre of doc.genres || []) {
    const name = typeof genre === 'string' ? genre : genre?.name
    if (!name) continue
    const genreId = await upsertGenre(name)
    await query(
      'INSERT INTO content_genres (content_id, genre_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
      [id, genreId],
    )
  }
  for (const title of [...new Set(doc.alternativeTitles || [])].filter(Boolean)) {
    await query(
      'INSERT INTO content_akas (content_id, name) VALUES ($1, $2) ON CONFLICT DO NOTHING',
      [id, title],
    )
  }
  const studioNames = [
    ...new Set(
      [...(doc.studios || []), ...(doc.productionCompanies || [])]
        .map((value) => (typeof value === 'string' ? value : value?.name))
        .filter(Boolean),
    ),
  ]
  const refsByName = new Map()
  for (const ref of doc.studioRefs || []) {
    if (!ref?.name) continue
    const key = ref.name.toLowerCase()
    refsByName.set(key, { ...ref, ...refsByName.get(key) })
  }
  for (const name of studioNames) {
    const studioId = await upsertStudio(name, refsByName.get(name.toLowerCase()))
    await query(
      'INSERT INTO studio_credits (work_id, studio_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
      [id, studioId],
    )
  }

  if (franchiseName) {
    const franchiseId = await upsertFranchise(franchiseName)
    await query(
      'INSERT INTO franchise_members (franchise_id, member_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
      [franchiseId, id],
    )
  }

  const rel = doc.relationships || {}
  const hasRelations = [rel.sequels, rel.prequels, rel.related].some((list) => list?.length)
  if (doc.$replaceRelations && hasRelations) {
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
    `SELECT count(*)::int AS n FROM works c WHERE ${compiled.sql}`,
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
  const result = await query(
    `DELETE FROM content WHERE id IN (SELECT c.id FROM works c WHERE ${compiled.sql})`,
    compiled.params,
  )
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

Content.create = async function create(data) {
  const doc = data instanceof Content ? data : new Content(data)
  await doc.save()
  return doc
}

export default Content
