/**
 * Copy Mongo Content / Entity / User documents into Postgres.
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

dotenv.config()

const RELATION_KINDS = new Set([
  'sequel',
  'prequel',
  'side_story',
  'parent_story',
  'alternative_setting',
  'alternative_version',
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
 * @returns {Promise<void>}
 */
async function truncateAll(client) {
  await client.query(`
    TRUNCATE TABLE
      voice_credits,
      appearances,
      entity_alternative_names,
      content_studios,
      content_studio_names,
      content_production_companies,
      content_origin_countries,
      content_alternative_titles,
      content_genres,
      content_relations,
      franchise_members,
      franchises,
      user_favorite_studios,
      user_favorite_genres,
      user_favorite_entities,
      user_ratings,
      watchlist_entries,
      refresh_tokens,
      ip_bans,
      users,
      entities,
      content
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
  const seenTmdb = new Set()
  const seenMal = new Set()
  const franchiseRows = []
  const memberRows = []
  const contentRows = []
  const genreRows = []
  const altTitleRows = []
  const countryRows = []
  const studioRows = []
  const companyRows = []
  let relationCount = 0
  let duplicateTmdb = 0

  const contentColumns = [
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

  for (const doc of docs) {
    const id = uuid()
    contentByMongo.set(String(doc._id), id)

    const franchiseName = asText(doc.franchise) || asText(doc.relationships?.franchise)
    if (franchiseName && !franchiseByName.has(franchiseName)) {
      const franchiseId = uuid()
      franchiseByName.set(franchiseName, franchiseId)
      franchiseRows.push([franchiseId, franchiseName])
    }
    if (franchiseName) {
      memberRows.push([franchiseByName.get(franchiseName), id])
    }

    let tmdbId = asNumber(doc.tmdbId)
    if (tmdbId != null) {
      if (seenTmdb.has(tmdbId)) {
        duplicateTmdb += 1
        tmdbId = null
      } else {
        seenTmdb.add(tmdbId)
      }
    }
    let malId = asNumber(doc.malId)
    if (malId != null) {
      if (seenMal.has(malId)) malId = null
      else seenMal.add(malId)
    }

    contentRows.push([
      id,
      String(doc._id),
      doc.internalId,
      doc.title,
      asText(doc.englishTitle),
      asText(doc.nativeTitle),
      asText(doc.originalTitle),
      asText(doc.overview),
      asText(doc.tagline),
      asEnum(doc.contentType, ['movie', 'tv', 'special']) || 'tv',
      asText(doc.posterPath),
      asText(doc.backdropPath),
      asDate(doc.releaseDate),
      asDate(doc.lastAirDate),
      asNumber(doc.runtime),
      asNumber(doc.episodeCount),
      asNumber(doc.seasonCount),
      tmdbId,
      malId,
      asNumber(doc.voteAverage),
      asNumber(doc.voteCount),
      asNumber(doc.popularity),
      asNumber(doc.unifiedScore),
      asNumber(doc.userRatingAverage),
      asNumber(doc.userRatingCount) ?? 0,
      asNumber(doc.userRatingSum) ?? 0,
      asNumber(doc.malScore),
      asNumber(doc.malScoredBy),
      asNumber(doc.malRank),
      asEnum(doc.malStatus, ['finished_airing', 'currently_airing', 'not_yet_aired']),
      asNumber(doc.malEpisodes),
      asEnum(doc.malMediaType, ['unknown', 'tv', 'ova', 'movie', 'special', 'ona', 'music']),
      asEnum(doc.malSource, [
        'manga',
        'light_novel',
        'novel',
        'web_novel',
        'original',
        'game',
        '4_koma_manga',
        'web_manga',
        'music',
        'picture_book',
        'visual_novel',
        'other',
      ]),
      asEnum(doc.malRating, ['g', 'pg', 'pg_13', 'r', 'r+', 'rx']),
      asText(doc.broadcastDay),
      asText(doc.broadcastTime),
      asDate(doc.nextEpisodeAirDate),
      asNumber(doc.nextEpisodeNumber),
      asNumber(doc.nextEpisodeSeason),
      asDate(doc.airingUpdatedAt),
      asNumber(doc.startSeasonYear),
      asEnum(doc.startSeason, ['winter', 'spring', 'summer', 'fall']),
      Boolean(doc.dataSources?.tmdb?.hasData),
      asDate(doc.dataSources?.tmdb?.lastUpdated),
      Boolean(doc.dataSources?.mal?.hasData),
      asDate(doc.dataSources?.mal?.lastUpdated),
      asDate(doc.characterSyncAt),
      asDate(doc.createdAt) || new Date(),
      asDate(doc.updatedAt) || new Date(),
    ])

    const seenGenres = new Set()
    for (const genre of Array.isArray(doc.genres) ? doc.genres : []) {
      const name = asText(typeof genre === 'string' ? genre : genre?.name)
      if (!name) continue
      const key = name.toLowerCase()
      if (seenGenres.has(key)) continue
      seenGenres.add(key)
      genreRows.push([id, asNumber(typeof genre === 'object' ? genre.id : null), name])
    }

    for (const title of new Set((doc.alternativeTitles || []).map(asText).filter(Boolean))) {
      altTitleRows.push([id, title])
    }

    for (const country of new Set((doc.originCountries || []).map(asText).filter(Boolean))) {
      if (country.length !== 2) continue
      countryRows.push([id, country.toUpperCase()])
    }

    for (const name of new Set((doc.studios || []).map(asText).filter(Boolean))) {
      studioRows.push([id, name])
    }

    for (const name of new Set((doc.productionCompanies || []).map(asText).filter(Boolean))) {
      companyRows.push([id, name])
    }
  }

  await insertMany(client, 'franchises', ['id', 'name'], franchiseRows)
  await insertMany(client, 'content', contentColumns, contentRows)
  await insertMany(client, 'franchise_members', ['franchise_id', 'content_id'], memberRows)
  await insertMany(client, 'content_genres', ['content_id', 'tmdb_id', 'name'], genreRows)
  await insertMany(client, 'content_alternative_titles', ['content_id', 'title'], altTitleRows)
  await insertMany(client, 'content_origin_countries', ['content_id', 'country_code'], countryRows)
  await insertMany(client, 'content_studio_names', ['content_id', 'name'], studioRows)
  await insertMany(
    client,
    'content_production_companies',
    ['content_id', 'name'],
    companyRows,
  )
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
  const entityRows = []
  const altNameRows = []
  const appearanceRows = []
  const creditRows = []
  let appearanceCount = 0
  let creditCount = 0

  for (const doc of docs) {
    const id = uuid()
    const entityType = asEnum(doc.entityType, ['character', 'voice_actor', 'studio'])
    if (!entityType) continue
    entityByMongo.set(String(doc._id), id)

    entityRows.push([
      id,
      String(doc._id),
      entityType,
      doc.name,
      asText(doc.englishName),
      asText(doc.nativeName),
      asText(doc.about),
      asText(doc.imagePath),
      asNumber(doc.malId),
      asNumber(doc.tmdbId),
      asNumber(doc.favoritesCount) ?? 0,
      asDate(doc.lastSyncedAt),
      asDate(doc.voiceCreditsSyncedAt),
      asDate(doc.createdAt) || new Date(),
      asDate(doc.updatedAt) || new Date(),
    ])

    for (const name of new Set((doc.alternativeNames || []).map(asText).filter(Boolean))) {
      altNameRows.push([id, name])
    }

    if (entityType === 'voice_actor') {
      if (doc.tmdbId) vaByTmdb.set(Number(doc.tmdbId), id)
      if (doc.malId) vaByMal.set(Number(doc.malId), id)
      if (doc.name) vaByName.set(String(doc.name).toLowerCase(), id)
    }
  }

  await insertMany(client, 'entities', [
    'id',
    'mongo_id',
    'entity_type',
    'name',
    'english_name',
    'native_name',
    'about',
    'image_path',
    'mal_id',
    'tmdb_id',
    'favorites_count',
    'last_synced_at',
    'voice_credits_synced_at',
    'created_at',
    'updated_at',
  ], entityRows)
  await insertMany(client, 'entity_alternative_names', ['entity_id', 'name'], altNameRows)

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

  const appearanceKeys = new Set()

  for (const doc of docs) {
    const entityId = entityByMongo.get(String(doc._id))
    if (!entityId) continue
    const entityType = asEnum(doc.entityType, ['character', 'voice_actor', 'studio'])
    const appearances = Array.isArray(doc.appearances) ? doc.appearances : []

    for (const appearance of appearances) {
      const contentId = contentByMongo.get(mongoId(appearance.content))
      if (!contentId) continue

      let characterId = null
      if (entityType === 'character') characterId = entityId
      else if (appearance.character) characterId = entityByMongo.get(mongoId(appearance.character)) || null

      const key = `${contentId}:${characterId || `va:${entityId}`}`
      if (appearanceKeys.has(key)) continue
      appearanceKeys.add(key)

      const appearanceId = uuid()
      appearanceRows.push([
        appearanceId,
        contentId,
        characterId,
        asText(appearance.role) || 'Supporting',
        asNumber(appearance.importance) ?? 0,
        asText(appearance.characterName),
        asText(appearance.language),
      ])
      appearanceCount += 1

      const credits = Array.isArray(appearance.voiceActors) ? appearance.voiceActors : []
      for (const credit of credits) {
        const name = asText(credit.name)
        if (!name) continue
        creditRows.push([
          uuid(),
          appearanceId,
          resolveVoiceActor(credit),
          name,
          asText(credit.language),
          asNumber(credit.malId),
          asNumber(credit.tmdbId),
          asText(credit.imagePath),
        ])
        creditCount += 1
      }
    }
  }

  await insertMany(client, 'appearances', [
    'id',
    'content_id',
    'character_id',
    'role',
    'importance',
    'character_name',
    'language',
  ], appearanceRows)
  await insertMany(client, 'voice_credits', [
    'id',
    'appearance_id',
    'voice_actor_id',
    'name',
    'language',
    'mal_id',
    'tmdb_id',
    'image_path',
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
        'mongo_id',
        'username',
        'email',
        'password_hash',
        'profile_picture',
        'is_demo_account',
        'failed_login_attempts',
        'lock_until',
        'last_login',
        'created_at',
        'updated_at',
      ],
      [
        id,
        String(doc._id),
        username,
        email,
        doc.password,
        asText(doc.profilePicture),
        Boolean(doc.isDemoAccount) || email === 'demo@findanimation.com',
        asNumber(doc.failedLoginAttempts) ?? 0,
        asDate(doc.lockUntil),
        asDate(doc.lastLogin),
        asDate(doc.createdAt) || new Date(),
        asDate(doc.updatedAt) || new Date(),
      ],
    )

    const seenWatchlist = new Set()
    for (const entry of doc.watchlist || []) {
      const contentId = contentByMongo.get(mongoId(entry.content))
      if (!contentId || seenWatchlist.has(contentId)) continue
      seenWatchlist.add(contentId)
      await insertRow(
        client,
        'watchlist_entries',
        [
          'user_id',
          'content_id',
          'status',
          'rating',
          'current_episode',
          'total_episodes',
          'current_season',
          'total_seasons',
          'notes',
          'added_at',
          'updated_at',
        ],
        [
          id,
          contentId,
          asEnum(entry.status, ['plan_to_watch', 'watching', 'completed', 'dropped']) ||
            'plan_to_watch',
          asNumber(entry.rating),
          asNumber(entry.currentEpisode) ?? 0,
          asNumber(entry.totalEpisodes),
          asNumber(entry.currentSeason) ?? 1,
          asNumber(entry.totalSeasons),
          asText(entry.notes),
          asDate(entry.addedAt) || new Date(),
          asDate(entry.updatedAt) || new Date(),
        ],
      )
      watchlistCount += 1
    }

    const seenRatings = new Set()
    for (const rating of doc.ratings || []) {
      const contentId = contentByMongo.get(mongoId(rating.content))
      if (!contentId || seenRatings.has(contentId) || asNumber(rating.rating) == null) continue
      seenRatings.add(contentId)
      await insertRow(
        client,
        'user_ratings',
        ['user_id', 'content_id', 'rating', 'review', 'watched_at'],
        [
          id,
          contentId,
          asNumber(rating.rating),
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
        'user_favorite_entities',
        ['user_id', 'entity_id', 'added_at'],
        [id, entityId, asDate(fav.addedAt) || new Date()],
      )
    }

    for (const name of new Set((doc.preferences?.favoriteGenres || []).map(asText).filter(Boolean))) {
      await insertRow(client, 'user_favorite_genres', ['user_id', 'name'], [id, name])
    }

    const studios = [
      ...(doc.preferences?.favoriteStudios || []),
      ...(doc.preferences?.preferredStudios || []),
    ]
    for (const name of new Set(studios.map(asText).filter(Boolean))) {
      await insertRow(client, 'user_favorite_studios', ['user_id', 'name'], [id, name])
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
