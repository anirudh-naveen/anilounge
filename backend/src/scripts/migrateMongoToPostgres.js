/**
 * Copy Mongo Content / Entity / User documents into the content-supertype schema.
 * Layer: CLI migration. Truncates SQL tables, then inserts. Does not copy
 * inferred related-title links (Mongo sequel/prequel/related arrays are empty;
 * genre-similarity is not a relation).
 *
 * Usage: npm run db:migrate-mongo
 * Requires MONGODB_URI and DATABASE_URL.
 */

import crypto from 'crypto'
import dotenv from 'dotenv'
import mongoose from 'mongoose'
import { getPool, closePostgres } from '../../config/postgres.js'
import {
  airingFromMalStatus,
  appearanceRole,
  kindFromContentType,
  kindFromEntityType,
} from '../db/kinds.js'

dotenv.config()

const RELATION_KINDS = new Set([
  'sequel',
  'prequel',
  'side_story',
  'parent_story',
  'alternative_setting',
  'alternative_version',
  'alternative',
  'summary',
  'full_story',
  'other',
])

/**
 * @returns {string}
 */
function uuid() {
  return crypto.randomUUID()
}

/**
 * @param {unknown} value
 * @returns {string | null}
 */
function mongoId(value) {
  if (!value) return null
  return String(value)
}

/**
 * @param {unknown} value
 * @returns {Date | null}
 */
function asDate(value) {
  if (!value) return null
  const date = value instanceof Date ? value : new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

/**
 * @param {unknown} value
 * @returns {string | null}
 */
function asText(value) {
  if (value == null) return null
  const text = String(value).trim()
  return text ? text : null
}

/**
 * @param {unknown} value
 * @param {Set<string> | string[]} allowed
 * @returns {string | null}
 */
function asEnum(value, allowed) {
  const text = asText(value)
  if (!text) return null
  const set = allowed instanceof Set ? allowed : new Set(allowed)
  return set.has(text) ? text : null
}

/**
 * @param {unknown} value
 * @returns {number | null}
 */
function asNumber(value) {
  if (value == null || value === '') return null
  const num = Number(value)
  return Number.isFinite(num) ? num : null
}

/**
 * @param {import('pg').PoolClient} client
 * @param {string} table
 * @param {string[]} columns
 * @param {unknown[]} values
 * @returns {Promise<void>}
 */
async function insertRow(client, table, columns, values) {
  await insertMany(client, table, columns, [values])
}

/**
 * Insert many rows in chunks. Empty input is a no-op.
 * @param {import('pg').PoolClient} client
 * @param {string} table
 * @param {string[]} columns
 * @param {unknown[][]} rows
 * @param {number} [chunkSize=80]
 * @returns {Promise<void>}
 */
async function insertMany(client, table, columns, rows, chunkSize = 80) {
  if (!rows.length) return
  const colCount = columns.length
  for (let start = 0; start < rows.length; start += chunkSize) {
    const chunk = rows.slice(start, start + chunkSize)
    const values = []
    const placeholders = chunk.map((row, rowIndex) => {
      const offset = rowIndex * colCount
      values.push(...row)
      return `(${columns.map((_, colIndex) => `$${offset + colIndex + 1}`).join(', ')})`
    })
    await client.query(
      `INSERT INTO ${table} (${columns.join(', ')}) VALUES ${placeholders.join(', ')}`,
      values,
    )
  }
}

/**
 * @param {import('pg').PoolClient} client
 * @param {string} name
 * @param {Map<string, string>} studioByName
 * @returns {Promise<string>}
 */
async function upsertStudio(client, name, studioByName) {
  const key = name.toLowerCase()
  if (studioByName.has(key)) return studioByName.get(key)
  const id = uuid()
  await insertRow(client, 'content', ['id', 'kind', 'name'], [id, 'studio', name])
  await insertRow(client, 'studios', ['content_id'], [id])
  studioByName.set(key, id)
  return id
}

/**
 * @param {import('pg').PoolClient} client
 * @returns {Promise<void>}
 */
async function truncateAll(client) {
  await client.query(`
    TRUNCATE TABLE
      content,
      users,
      genres,
      ip_bans
    RESTART IDENTITY CASCADE
  `)
}

/**
 * @param {import('pg').PoolClient} client
 * @param {Map<string, string>} contentByMongo
 * @returns {Promise<{ titles: number, franchises: number, relations: number }>}
 */
async function copyContent(client, contentByMongo) {
  const docs = await mongoose.connection.db.collection('contents').find({}).toArray()
  const franchiseByName = new Map()
  const studioByName = new Map()
  const genreByName = new Map()
  const seenTmdb = new Set()
  const seenMal = new Set()
  const contentRows = []
  const movieRows = []
  const seriesRows = []
  const specialRows = []
  const genreRows = []
  const akaRows = []
  const studioCreditRows = []
  const franchiseRows = []
  const memberRows = []
  let relationCount = 0
  let duplicateTmdb = 0

  for (const doc of docs) {
    const id = uuid()
    contentByMongo.set(String(doc._id), id)
    const kind = kindFromContentType(doc.contentType)
    const name = asText(doc.englishTitle) || asText(doc.title) || 'Untitled'
    const origin = (Array.isArray(doc.originCountries) ? doc.originCountries : [])
      .map(asText)
      .find((code) => code && code.length === 2)

    let tmdbId = asNumber(doc.tmdbId)
    if (tmdbId != null) {
      if (seenTmdb.has(`${kind}:${tmdbId}`)) {
        duplicateTmdb += 1
        tmdbId = null
      } else {
        seenTmdb.add(`${kind}:${tmdbId}`)
      }
    }
    let malId = asNumber(doc.malId)
    if (malId != null) {
      if (seenMal.has(`${kind}:${malId}`)) malId = null
      else seenMal.add(`${kind}:${malId}`)
    }

    contentRows.push([
      id,
      kind,
      name,
      asText(doc.nativeTitle),
      asText(doc.overview),
      asText(doc.posterPath),
      malId,
      tmdbId,
      asNumber(doc.anilistId),
      asDate(doc.createdAt) || new Date(),
      asDate(doc.updatedAt) || new Date(),
    ])

    const shared = [
      asText(doc.originalTitle) || asText(doc.nativeTitle),
      asText(doc.tagline),
      asText(doc.backdropPath),
      asDate(doc.releaseDate),
      origin ? origin.toUpperCase() : null,
      asNumber(doc.voteAverage),
      asNumber(doc.voteCount),
      asNumber(doc.malScore),
      asNumber(doc.malScoredBy),
      asNumber(doc.popularity),
      asNumber(doc.unifiedScore),
    ]

    if (kind === 'movie') {
      movieRows.push([id, ...shared, asNumber(doc.runtime)])
    } else if (kind === 'special') {
      specialRows.push([id, ...shared, asNumber(doc.runtime)])
    } else {
      seriesRows.push([
        id,
        ...shared,
        asNumber(doc.seasonCount),
        asNumber(doc.episodeCount) ?? asNumber(doc.malEpisodes),
        airingFromMalStatus(doc.malStatus),
        asEnum(doc.startSeason, ['winter', 'spring', 'summer', 'fall']),
        asNumber(doc.startSeasonYear),
        asText(doc.broadcastDay),
        asDate(doc.nextEpisodeAirDate),
        asNumber(doc.nextEpisodeNumber),
      ])
    }

    const franchiseName = asText(doc.franchise) || asText(doc.relationships?.franchise)
    if (franchiseName && !franchiseByName.has(franchiseName)) {
      const franchiseId = uuid()
      franchiseByName.set(franchiseName, franchiseId)
      franchiseRows.push([franchiseId, franchiseName])
    }
    if (franchiseName) memberRows.push([franchiseByName.get(franchiseName), id])

    const seenGenres = new Set()
    for (const genre of Array.isArray(doc.genres) ? doc.genres : []) {
      const genreName = asText(typeof genre === 'string' ? genre : genre?.name)
      if (!genreName) continue
      const key = genreName.toLowerCase()
      if (seenGenres.has(key)) continue
      seenGenres.add(key)
      if (!genreByName.has(key)) genreByName.set(key, { id: uuid(), name: genreName })
      genreRows.push([id, genreByName.get(key).id])
    }

    for (const title of new Set((doc.alternativeTitles || []).map(asText).filter(Boolean))) {
      akaRows.push([id, title])
    }

    const studioNames = [
      ...(Array.isArray(doc.studios) ? doc.studios : []),
      ...(Array.isArray(doc.productionCompanies) ? doc.productionCompanies : []),
    ]
    for (const studioName of new Set(studioNames.map(asText).filter(Boolean))) {
      studioCreditRows.push([id, studioName])
    }
  }

  await insertMany(client, 'content', [
    'id',
    'kind',
    'name',
    'native_name',
    'about',
    'image_path',
    'mal_id',
    'tmdb_id',
    'anilist_id',
    'created_at',
    'updated_at',
  ], contentRows)

  await insertMany(client, 'movies', [
    'content_id',
    'original_title',
    'tagline',
    'backdrop_path',
    'release_date',
    'origin_country',
    'tmdb_score',
    'tmdb_votes',
    'mal_score',
    'mal_votes',
    'popularity',
    'unified_score',
    'runtime_minutes',
  ], movieRows)

  await insertMany(client, 'specials', [
    'content_id',
    'original_title',
    'tagline',
    'backdrop_path',
    'release_date',
    'origin_country',
    'tmdb_score',
    'tmdb_votes',
    'mal_score',
    'mal_votes',
    'popularity',
    'unified_score',
    'runtime_minutes',
  ], specialRows)

  await insertMany(client, 'series', [
    'content_id',
    'original_title',
    'tagline',
    'backdrop_path',
    'release_date',
    'origin_country',
    'tmdb_score',
    'tmdb_votes',
    'mal_score',
    'mal_votes',
    'popularity',
    'unified_score',
    'season_count',
    'episode_count',
    'airing_status',
    'start_season',
    'start_year',
    'broadcast_day',
    'next_episode_at',
    'next_episode_number',
  ], seriesRows)

  await insertMany(
    client,
    'genres',
    ['id', 'name'],
    [...genreByName.values()].map((genre) => [genre.id, genre.name]),
  )
  await insertMany(client, 'content_genres', ['content_id', 'genre_id'], genreRows)
  await insertMany(client, 'content_akas', ['content_id', 'name'], akaRows)

  for (const [franchiseName, franchiseId] of franchiseByName) {
    await insertRow(client, 'content', ['id', 'kind', 'name'], [franchiseId, 'franchise', franchiseName])
    await insertRow(client, 'franchises', ['content_id'], [franchiseId])
  }
  await insertMany(client, 'franchise_members', ['franchise_id', 'member_id'], memberRows)

  for (const [workId, studioName] of studioCreditRows) {
    const studioId = await upsertStudio(client, studioName, studioByName)
    await insertRow(
      client,
      'studio_credits',
      ['work_id', 'studio_id'],
      [workId, studioId],
    )
  }

  if (duplicateTmdb) {
    console.log(`  cleared ${duplicateTmdb} duplicate tmdb_id values (kept both titles)`)
  }

  for (const doc of docs) {
    const fromId = contentByMongo.get(String(doc._id))
    const rel = doc.relationships || {}
    const groups = [
      [rel.sequels, 'sequel'],
      [rel.prequels, 'prequel'],
      [rel.related, 'other'],
    ]
    const seen = new Set()
    for (const [list, kind] of groups) {
      if (!RELATION_KINDS.has(kind) || !Array.isArray(list)) continue
      for (const ref of list) {
        const toMongo = mongoId(ref?._id || ref)
        const toId = toMongo ? contentByMongo.get(toMongo) : null
        if (!fromId || !toId || fromId === toId) continue
        const key = `${fromId}:${toId}:${kind}`
        if (seen.has(key)) continue
        seen.add(key)
        await insertRow(
          client,
          'content_relations',
          ['id', 'from_id', 'to_id', 'kind', 'source'],
          [uuid(), fromId, toId, kind, 'curated'],
        )
        relationCount += 1
      }
    }
  }

  return { titles: docs.length, franchises: franchiseByName.size, relations: relationCount }
}

/**
 * @param {import('pg').PoolClient} client
 * @param {Map<string, string>} contentByMongo
 * @param {Map<string, string>} entityByMongo
 * @returns {Promise<{ entities: number, appearances: number, credits: number }>}
 */
async function copyEntities(client, contentByMongo, entityByMongo) {
  const docs = await mongoose.connection.db.collection('entities').find({}).toArray()
  const vaByTmdb = new Map()
  const vaByMal = new Map()
  const vaByName = new Map()
  const seenTmdb = new Set()
  const seenMal = new Set()
  const contentRows = []
  const characterRows = []
  const voiceRows = []
  const studioRows = []
  const akaRows = []
  const appearanceRows = []
  const creditRows = []
  let appearanceCount = 0
  let creditCount = 0

  for (const doc of docs) {
    const entityType = asEnum(doc.entityType, ['character', 'voice_actor', 'studio'])
    if (!entityType) continue
    const id = uuid()
    const kind = kindFromEntityType(entityType)
    entityByMongo.set(String(doc._id), id)

    let tmdbId = asNumber(doc.tmdbId)
    if (tmdbId != null) {
      const key = `${kind}:${tmdbId}`
      if (seenTmdb.has(key)) tmdbId = null
      else seenTmdb.add(key)
    }
    let malId = asNumber(doc.malId)
    if (malId != null) {
      const key = `${kind}:${malId}`
      if (seenMal.has(key)) malId = null
      else seenMal.add(key)
    }

    contentRows.push([
      id,
      kind,
      doc.name,
      asText(doc.nativeName),
      asText(doc.about),
      asText(doc.imagePath),
      malId,
      tmdbId,
      asDate(doc.createdAt) || new Date(),
      asDate(doc.updatedAt) || new Date(),
    ])
    if (kind === 'character') characterRows.push([id, asText(doc.englishName)])
    else if (kind === 'voice') voiceRows.push([id, asText(doc.englishName)])
    else studioRows.push([id])

    for (const name of new Set((doc.alternativeNames || []).map(asText).filter(Boolean))) {
      akaRows.push([id, name])
    }

    if (kind === 'voice') {
      if (doc.tmdbId) vaByTmdb.set(Number(doc.tmdbId), id)
      if (doc.malId) vaByMal.set(Number(doc.malId), id)
      if (doc.name) vaByName.set(String(doc.name).toLowerCase(), id)
    }
  }

  await insertMany(client, 'content', [
    'id',
    'kind',
    'name',
    'native_name',
    'about',
    'image_path',
    'mal_id',
    'tmdb_id',
    'created_at',
    'updated_at',
  ], contentRows)
  await insertMany(client, 'characters', ['content_id', 'english_name'], characterRows)
  await insertMany(client, 'voices', ['content_id', 'english_name'], voiceRows)
  await insertMany(client, 'studios', ['content_id'], studioRows)
  await insertMany(client, 'content_akas', ['content_id', 'name'], akaRows)

  /**
   * @param {object} credit
   * @returns {string | null}
   */
  function resolveVoiceActor(credit) {
    const linked = mongoId(credit.entity)
    if (linked && entityByMongo.has(linked)) return entityByMongo.get(linked)
    const tmdbId = asNumber(credit.tmdbId)
    if (tmdbId && vaByTmdb.has(tmdbId)) return vaByTmdb.get(tmdbId)
    const malId = asNumber(credit.malId)
    if (malId && vaByMal.has(malId)) return vaByMal.get(malId)
    const name = asText(credit.name)
    if (name && vaByName.has(name.toLowerCase())) return vaByName.get(name.toLowerCase())
    return null
  }

  const appearanceKeys = new Map()
  const creditKeys = new Set()

  for (const doc of docs) {
    const entityId = entityByMongo.get(String(doc._id))
    if (!entityId) continue
    const entityType = asEnum(doc.entityType, ['character', 'voice_actor', 'studio'])
    const appearances = Array.isArray(doc.appearances) ? doc.appearances : []

    if (entityType === 'studio') {
      const seenWorks = new Set()
      for (const appearance of appearances) {
        const workId = contentByMongo.get(mongoId(appearance.content))
        if (!workId || seenWorks.has(workId)) continue
        seenWorks.add(workId)
        await insertRow(
          client,
          'studio_credits',
          ['work_id', 'studio_id'],
          [workId, entityId],
        )
      }
      continue
    }

    for (const appearance of appearances) {
      const workId = contentByMongo.get(mongoId(appearance.content))
      if (!workId) continue

      let characterId = null
      if (entityType === 'character') characterId = entityId
      else if (appearance.character) characterId = entityByMongo.get(mongoId(appearance.character)) || null
      if (!characterId) continue

      const key = `${workId}:${characterId}`
      let appearanceId
      if (appearanceKeys.has(key)) {
        appearanceId = appearanceKeys.get(key)
      } else {
        appearanceId = uuid()
        appearanceKeys.set(key, appearanceId)
        appearanceRows.push([
          appearanceId,
          workId,
          characterId,
          appearanceRole(appearance.role),
          asNumber(appearance.importance) ?? 0,
        ])
        appearanceCount += 1
      }

      const credits = Array.isArray(appearance.voiceActors) ? appearance.voiceActors : []
      if (entityType === 'voice') {
        const creditKey = `${appearanceId}:${entityId}:${asText(appearance.language) || ''}`
        if (!creditKeys.has(creditKey)) {
          creditKeys.add(creditKey)
          creditRows.push([uuid(), appearanceId, entityId, asText(appearance.language)])
          creditCount += 1
        }
      }
      for (const credit of credits) {
        const voiceId = resolveVoiceActor(credit)
        if (!voiceId) continue
        const creditKey = `${appearanceId}:${voiceId}:${asText(credit.language) || ''}`
        if (creditKeys.has(creditKey)) continue
        creditKeys.add(creditKey)
        creditRows.push([uuid(), appearanceId, voiceId, asText(credit.language)])
        creditCount += 1
      }
    }
  }

  await insertMany(client, 'appearances', [
    'id',
    'work_id',
    'character_id',
    'role',
    'importance',
  ], appearanceRows)
  await insertMany(client, 'voice_credits', [
    'id',
    'appearance_id',
    'voice_id',
    'language',
  ], creditRows)

  return { entities: docs.length, appearances: appearanceCount, credits: creditCount }
}

/**
 * @param {import('pg').PoolClient} client
 * @param {Map<string, string>} contentByMongo
 * @param {Map<string, string>} entityByMongo
 * @returns {Promise<{ users: number, watchlist: number, ratings: number }>}
 */
async function copyUsers(client, contentByMongo, entityByMongo) {
  const docs = await mongoose.connection.db.collection('users').find({}).toArray()
  let watchlistCount = 0
  let ratingCount = 0

  for (const doc of docs) {
    const id = uuid()
    const username = asText(doc.username)
    const email = asText(doc.email)?.toLowerCase()
    if (!username || !email || !doc.password) {
      console.warn(`Skipping user ${doc._id}: missing username, email, or password`)
      continue
    }

    await insertRow(
      client,
      'users',
      [
        'id',
        'username',
        'email',
        'password_hash',
        'profile_picture',
        'bio',
        'is_demo',
        'failed_login_attempts',
        'lock_until',
        'last_login_at',
        'created_at',
      ],
      [
        id,
        username,
        email,
        doc.password,
        asText(doc.profilePicture),
        asText(doc.bio),
        Boolean(doc.isDemoAccount) || email === 'demo@findanimation.com',
        asNumber(doc.failedLoginAttempts) ?? 0,
        asDate(doc.lockUntil),
        asDate(doc.lastLogin),
        asDate(doc.createdAt) || new Date(),
      ],
    )

    const seenWatchlist = new Set()
    const seenRatings = new Set()
    for (const entry of doc.watchlist || []) {
      const contentId = contentByMongo.get(mongoId(entry.content))
      if (!contentId || seenWatchlist.has(contentId)) continue
      seenWatchlist.add(contentId)
      await insertRow(
        client,
        'watchlist',
        [
          'user_id',
          'content_id',
          'status',
          'current_episode',
          'current_season',
          'notes',
          'added_at',
          'updated_at',
        ],
        [
          id,
          contentId,
          asEnum(entry.status, ['plan_to_watch', 'watching', 'completed', 'dropped']) ||
            'plan_to_watch',
          asNumber(entry.currentEpisode) ?? 0,
          asNumber(entry.currentSeason) ?? 1,
          asText(entry.notes),
          asDate(entry.addedAt) || new Date(),
          asDate(entry.updatedAt) || new Date(),
        ],
      )
      watchlistCount += 1
      const score = asNumber(entry.rating)
      if (score != null && !seenRatings.has(contentId)) {
        seenRatings.add(contentId)
        await insertRow(
          client,
          'ratings',
          ['user_id', 'content_id', 'score', 'rated_at'],
          [id, contentId, score, asDate(entry.updatedAt) || new Date()],
        )
        ratingCount += 1
      }
    }

    for (const rating of doc.ratings || []) {
      const contentId = contentByMongo.get(mongoId(rating.content))
      const score = asNumber(rating.rating)
      if (!contentId || seenRatings.has(contentId) || score == null) continue
      seenRatings.add(contentId)
      await insertRow(
        client,
        'ratings',
        ['user_id', 'content_id', 'score', 'review', 'rated_at'],
        [
          id,
          contentId,
          score,
          asText(rating.review),
          asDate(rating.watchedAt) || new Date(),
        ],
      )
      ratingCount += 1
    }

    for (const fav of doc.favoriteEntities || []) {
      const entityId = entityByMongo.get(mongoId(fav.entity))
      if (!entityId) continue
      await insertRow(
        client,
        'favorites',
        ['user_id', 'content_id', 'added_at'],
        [id, entityId, asDate(fav.addedAt) || new Date()],
      )
    }
  }

  return { users: docs.length, watchlist: watchlistCount, ratings: ratingCount }
}

/**
 * @returns {Promise<void>}
 */
async function migrate() {
  if (!process.env.MONGODB_URI || !process.env.DATABASE_URL) {
    console.error('MONGODB_URI and DATABASE_URL are required')
    process.exit(1)
  }

  const pool = getPool()
  const client = await pool.connect()

  console.log('Connecting to MongoDB…')
  await mongoose.connect(process.env.MONGODB_URI)

  const contentByMongo = new Map()
  const entityByMongo = new Map()

  try {
    await client.query('BEGIN')
    console.log('Truncating Postgres tables…')
    await truncateAll(client)

    console.log('Copying content…')
    const contentStats = await copyContent(client, contentByMongo)
    console.log(
      `  titles=${contentStats.titles} franchises=${contentStats.franchises} relations=${contentStats.relations}`,
    )

    console.log('Copying entities…')
    const entityStats = await copyEntities(client, contentByMongo, entityByMongo)
    console.log(
      `  entities=${entityStats.entities} appearances=${entityStats.appearances} voice_credits=${entityStats.credits}`,
    )

    console.log('Copying users…')
    const userStats = await copyUsers(client, contentByMongo, entityByMongo)
    console.log(
      `  users=${userStats.users} watchlist=${userStats.watchlist} ratings=${userStats.ratings}`,
    )

    await client.query('COMMIT')
    console.log('Migration committed')
  } catch (error) {
    await client.query('ROLLBACK')
    console.error('Migration failed:', error)
    process.exitCode = 1
  } finally {
    client.release()
    await mongoose.disconnect()
    await closePostgres()
  }
}

migrate()
