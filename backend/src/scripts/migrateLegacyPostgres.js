/**
 * Move a live Postgres catalog from the Mongo-shaped tables onto the
 * content-supertype schema. Renames old tables to legacy_*, applies schema.sql,
 * then copies rows. Legacy tables are left in place until you drop them.
 *
 * Usage: npm run db:migrate-legacy
 * Requires DATABASE_URL.
 */

import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import pg from 'pg'
import dotenv from 'dotenv'
import { sslForDatabaseUrl } from '../../config/postgres.js'
import { splitStatements } from './applySchema.js'

dotenv.config()

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const schemaPath = path.resolve(__dirname, '../../db/schema.sql')

const LEGACY_TABLES = [
  'voice_credits',
  'appearances',
  'content_studios',
  'entity_alternative_names',
  'content_studio_names',
  'content_production_companies',
  'content_origin_countries',
  'content_alternative_titles',
  'content_genres',
  'content_relations',
  'franchise_members',
  'franchises',
  'user_favorite_studios',
  'user_favorite_genres',
  'user_favorite_entities',
  'user_ratings',
  'watchlist_entries',
  'refresh_tokens',
  'ip_bans',
  'users',
  'entities',
  'content',
]

/**
 * @param {import('pg').Client} client
 * @param {string} sql
 * @returns {Promise<boolean>}
 */
async function columnExists(client, table, column) {
  const { rows } = await client.query(
    `SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = $1 AND column_name = $2`,
    [table, column],
  )
  return rows.length > 0
}

/**
 * @param {import('pg').Client} client
 * @param {string} table
 * @returns {Promise<boolean>}
 */
async function tableExists(client, table) {
  const { rows } = await client.query(
    `SELECT 1 FROM information_schema.tables
     WHERE table_schema = 'public' AND table_name = $1`,
    [table],
  )
  return rows.length > 0
}

/**
 * @param {import('pg').Client} client
 * @returns {Promise<void>}
 */
async function renameLegacy(client) {
  for (const table of LEGACY_TABLES) {
    if (await tableExists(client, table)) {
      await client.query(`ALTER TABLE ${table} RENAME TO legacy_${table}`)
    }
  }

  await client.query(`
    DO $$
    DECLARE r RECORD;
    BEGIN
      FOR r IN
        SELECT indexname
        FROM pg_indexes
        WHERE schemaname = 'public'
          AND tablename LIKE 'legacy_%'
          AND indexname NOT LIKE 'legacy_%'
      LOOP
        EXECUTE format('ALTER INDEX %I RENAME TO %I', r.indexname, 'legacy_' || r.indexname);
      END LOOP;

      FOR r IN
        SELECT conrelid::regclass AS table_name, conname
        FROM pg_constraint
        WHERE connamespace = 'public'::regnamespace
          AND conrelid::regclass::text LIKE 'legacy_%'
          AND conname NOT LIKE 'legacy_%'
      LOOP
        EXECUTE format(
          'ALTER TABLE %s RENAME CONSTRAINT %I TO %I',
          r.table_name,
          r.conname,
          'legacy_' || r.conname
        );
      END LOOP;
    END $$;
  `)
}

/**
 * @param {import('pg').Client} client
 * @returns {Promise<void>}
 */
async function applyTargetSchema(client) {
  const sql = fs.readFileSync(schemaPath, 'utf8')
  for (const statement of splitStatements(sql)) {
    await client.query(statement)
  }
}

/**
 * @param {import('pg').Client} client
 * @returns {Promise<void>}
 */
async function copyLegacyData(client) {
  await client.query(`
    INSERT INTO content (
      id, kind, name, native_name, about, image_path, mal_id, tmdb_id, created_at, updated_at
    )
    SELECT
      id,
      CASE content_type WHEN 'movie' THEN 'movie' WHEN 'special' THEN 'special' ELSE 'series' END,
      COALESCE(NULLIF(english_title, ''), title),
      native_title,
      overview,
      poster_path,
      mal_id,
      tmdb_id,
      created_at,
      updated_at
    FROM legacy_content
  `)

  await client.query(`
    INSERT INTO movies (
      content_id, original_title, tagline, backdrop_path, release_date, origin_country,
      runtime_minutes, tmdb_score, tmdb_votes, mal_score, mal_votes, popularity, unified_score,
      airing_status
    )
    SELECT
      c.id,
      c.original_title,
      c.tagline,
      c.backdrop_path,
      c.release_date,
      (
        SELECT country_code FROM legacy_content_origin_countries o
        WHERE o.content_id = c.id
        LIMIT 1
      ),
      c.runtime,
      c.vote_average,
      c.vote_count,
      c.mal_score,
      c.mal_scored_by,
      c.popularity,
      c.unified_score,
      CASE c.mal_status
        WHEN 'currently_airing' THEN 'airing'
        WHEN 'not_yet_aired' THEN 'upcoming'
        WHEN 'finished_airing' THEN 'finished'
        ELSE NULL
      END
    FROM legacy_content c
    WHERE c.content_type = 'movie'
  `)

  await client.query(`
    INSERT INTO specials (
      content_id, original_title, tagline, backdrop_path, release_date, origin_country,
      runtime_minutes, tmdb_score, tmdb_votes, mal_score, mal_votes, popularity, unified_score,
      airing_status
    )
    SELECT
      c.id,
      c.original_title,
      c.tagline,
      c.backdrop_path,
      c.release_date,
      (
        SELECT country_code FROM legacy_content_origin_countries o
        WHERE o.content_id = c.id
        LIMIT 1
      ),
      c.runtime,
      c.vote_average,
      c.vote_count,
      c.mal_score,
      c.mal_scored_by,
      c.popularity,
      c.unified_score,
      CASE c.mal_status
        WHEN 'currently_airing' THEN 'airing'
        WHEN 'not_yet_aired' THEN 'upcoming'
        WHEN 'finished_airing' THEN 'finished'
        ELSE NULL
      END
    FROM legacy_content c
    WHERE c.content_type = 'special'
  `)

  await client.query(`
    INSERT INTO series (
      content_id, original_title, tagline, backdrop_path, release_date, origin_country,
      season_count, episode_count, airing_status, start_season, start_year, broadcast_day,
      next_episode_at, next_episode_number, tmdb_score, tmdb_votes, mal_score, mal_votes,
      popularity, unified_score
    )
    SELECT
      c.id,
      c.original_title,
      c.tagline,
      c.backdrop_path,
      c.release_date,
      (
        SELECT country_code FROM legacy_content_origin_countries o
        WHERE o.content_id = c.id
        LIMIT 1
      ),
      c.season_count,
      COALESCE(c.episode_count, c.mal_episodes),
      CASE c.mal_status
        WHEN 'currently_airing' THEN 'airing'
        WHEN 'not_yet_aired' THEN 'upcoming'
        WHEN 'finished_airing' THEN 'finished'
        ELSE NULL
      END,
      c.start_season,
      c.start_season_year,
      c.broadcast_day,
      c.next_episode_air_date,
      c.next_episode_number,
      c.vote_average,
      c.vote_count,
      c.mal_score,
      c.mal_scored_by,
      c.popularity,
      c.unified_score
    FROM legacy_content c
    WHERE c.content_type = 'tv'
  `)

  if (await tableExists(client, 'legacy_content_genres')) {
    await client.query(`
      INSERT INTO genres (name)
      SELECT DISTINCT name FROM legacy_content_genres
      ON CONFLICT (name) DO NOTHING
    `)
    await client.query(`
      INSERT INTO content_genres (content_id, genre_id)
      SELECT g.content_id, genres.id
      FROM legacy_content_genres g
      JOIN genres ON genres.name = g.name
      ON CONFLICT DO NOTHING
    `)
  }

  if (await tableExists(client, 'legacy_content_alternative_titles')) {
    await client.query(`
      INSERT INTO content_akas (content_id, name)
      SELECT content_id, title FROM legacy_content_alternative_titles
      ON CONFLICT DO NOTHING
    `)
  }

  if (await tableExists(client, 'legacy_franchises')) {
    await client.query(`
      INSERT INTO content (id, kind, name, created_at, updated_at)
      SELECT id, 'franchise', name, created_at, updated_at FROM legacy_franchises
      ON CONFLICT (id) DO NOTHING
    `)
    await client.query(`
      INSERT INTO franchises (content_id)
      SELECT id FROM legacy_franchises
      ON CONFLICT DO NOTHING
    `)
  }

  if (await tableExists(client, 'legacy_franchise_members')) {
    await client.query(`
      INSERT INTO franchise_members (franchise_id, member_id)
      SELECT fm.franchise_id, fm.content_id
      FROM legacy_franchise_members fm
      JOIN franchises f ON f.content_id = fm.franchise_id
      JOIN content w ON w.id = fm.content_id AND w.kind IN ('movie', 'series', 'special')
      ON CONFLICT DO NOTHING
    `)
  }

  if (await tableExists(client, 'legacy_content_relations')) {
    await client.query(`
      INSERT INTO content_relations (id, from_id, to_id, kind, source, created_at)
      SELECT id, from_id, to_id, kind, source, created_at FROM legacy_content_relations
      ON CONFLICT DO NOTHING
    `)
  }

  if (await tableExists(client, 'legacy_entities')) {
    await client.query(`
      INSERT INTO content (
        id, kind, name, native_name, about, image_path, mal_id, tmdb_id, created_at, updated_at
      )
      SELECT
        id,
        CASE entity_type
          WHEN 'voice_actor' THEN 'voice'
          WHEN 'studio' THEN 'studio'
          ELSE 'character'
        END,
        name,
        native_name,
        about,
        image_path,
        mal_id,
        tmdb_id,
        created_at,
        updated_at
      FROM legacy_entities
      ON CONFLICT (id) DO NOTHING
    `)
    await client.query(`
      INSERT INTO characters (content_id, english_name)
      SELECT id, english_name FROM legacy_entities WHERE entity_type = 'character'
      ON CONFLICT DO NOTHING
    `)
    await client.query(`
      INSERT INTO voices (content_id, english_name)
      SELECT id, english_name FROM legacy_entities WHERE entity_type = 'voice_actor'
      ON CONFLICT DO NOTHING
    `)
    await client.query(`
      INSERT INTO studios (content_id)
      SELECT id FROM legacy_entities WHERE entity_type = 'studio'
      ON CONFLICT DO NOTHING
    `)
  }

  if (await tableExists(client, 'legacy_entity_alternative_names')) {
    await client.query(`
      INSERT INTO content_akas (content_id, name)
      SELECT entity_id, name FROM legacy_entity_alternative_names
      ON CONFLICT DO NOTHING
    `)
  }

  if (await tableExists(client, 'legacy_appearances')) {
    await client.query(`
      INSERT INTO appearances (id, work_id, character_id, role, importance)
      SELECT
        a.id,
        a.content_id,
        a.character_id,
        CASE lower(a.role)
          WHEN 'main' THEN 'main'
          WHEN 'cameo' THEN 'cameo'
          ELSE 'supporting'
        END,
        a.importance
      FROM legacy_appearances a
      JOIN characters ch ON ch.content_id = a.character_id
      JOIN content w ON w.id = a.content_id AND w.kind IN ('movie', 'series', 'special')
      ON CONFLICT DO NOTHING
    `)
  }

  if (await tableExists(client, 'legacy_voice_credits')) {
    await client.query(`
      INSERT INTO voice_credits (id, appearance_id, voice_id, language)
      SELECT v.id, v.appearance_id, v.voice_actor_id, v.language
      FROM legacy_voice_credits v
      JOIN appearances a ON a.id = v.appearance_id
      JOIN voices vo ON vo.content_id = v.voice_actor_id
      ON CONFLICT DO NOTHING
    `)
  }

  if (await tableExists(client, 'legacy_content_studios')) {
    await client.query(`
      INSERT INTO studio_credits (work_id, studio_id)
      SELECT cs.content_id, cs.studio_id
      FROM legacy_content_studios cs
      JOIN studios st ON st.content_id = cs.studio_id
      JOIN content w ON w.id = cs.content_id AND w.kind IN ('movie', 'series', 'special')
      ON CONFLICT DO NOTHING
    `)
  }

  if (await tableExists(client, 'legacy_content_studio_names')) {
    await client.query(`
      INSERT INTO content (id, kind, name)
      SELECT gen_random_uuid(), 'studio', name
      FROM (
        SELECT DISTINCT name FROM legacy_content_studio_names
      ) s
      WHERE NOT EXISTS (
        SELECT 1 FROM content c WHERE c.kind = 'studio' AND lower(c.name) = lower(s.name)
      )
    `)
    await client.query(`
      INSERT INTO studios (content_id)
      SELECT id FROM content WHERE kind = 'studio'
      ON CONFLICT DO NOTHING
    `)
    await client.query(`
      INSERT INTO studio_credits (work_id, studio_id)
      SELECT n.content_id, c.id
      FROM legacy_content_studio_names n
      JOIN content c ON c.kind = 'studio' AND lower(c.name) = lower(n.name)
      ON CONFLICT DO NOTHING
    `)
  }

  if (await tableExists(client, 'legacy_users')) {
    await client.query(`
      INSERT INTO users (
        id, username, email, password_hash, profile_picture, is_demo,
        failed_login_attempts, lock_until, last_login_at, created_at
      )
      SELECT
        id, username, email, password_hash, profile_picture, is_demo_account,
        failed_login_attempts, lock_until, last_login, created_at
      FROM legacy_users
      ON CONFLICT (id) DO NOTHING
    `)
  }

  if (await tableExists(client, 'legacy_watchlist_entries')) {
    await client.query(`
      INSERT INTO watchlist (
        user_id, content_id, status, current_episode, current_season, notes, added_at, updated_at
      )
      SELECT
        user_id, content_id, status, current_episode, current_season, notes, added_at, updated_at
      FROM legacy_watchlist_entries
      ON CONFLICT DO NOTHING
    `)
    await client.query(`
      INSERT INTO ratings (user_id, content_id, score, rated_at)
      SELECT user_id, content_id, rating, COALESCE(updated_at, now())
      FROM legacy_watchlist_entries
      WHERE rating IS NOT NULL
      ON CONFLICT DO NOTHING
    `)
  }

  if (await tableExists(client, 'legacy_user_ratings')) {
    await client.query(`
      INSERT INTO ratings (user_id, content_id, score, review, rated_at)
      SELECT user_id, content_id, rating, review, watched_at
      FROM legacy_user_ratings
      ON CONFLICT (user_id, content_id) DO UPDATE SET
        review = COALESCE(EXCLUDED.review, ratings.review)
    `)
  }

  if (await tableExists(client, 'legacy_user_favorite_entities')) {
    await client.query(`
      INSERT INTO favorites (user_id, content_id, added_at)
      SELECT f.user_id, f.entity_id, f.added_at
      FROM legacy_user_favorite_entities f
      JOIN content c ON c.id = f.entity_id
      JOIN users u ON u.id = f.user_id
      ON CONFLICT DO NOTHING
    `)
  }

  if (await tableExists(client, 'legacy_refresh_tokens')) {
    await client.query(`
      INSERT INTO refresh_tokens (id, token, user_id, expires_at, is_revoked, created_at)
      SELECT id, token, user_id, expires_at, is_revoked, created_at
      FROM legacy_refresh_tokens
      ON CONFLICT (token) DO NOTHING
    `)
  }

  if (await tableExists(client, 'legacy_ip_bans')) {
    await client.query(`
      INSERT INTO ip_bans (
        id, ip, reason, banned_at, expires_at, attempts, user_agent, last_seen, is_active
      )
      SELECT id, ip, reason, banned_at, expires_at, attempts, user_agent, last_seen, is_active
      FROM legacy_ip_bans
      ON CONFLICT (ip) DO NOTHING
    `)
  }
}

/**
 * @returns {Promise<void>}
 */
async function migrate() {
  const connectionString = process.env.DATABASE_URL
  if (!connectionString) {
    console.error('DATABASE_URL is not set')
    process.exit(1)
  }

  const client = new pg.Client({
    connectionString,
    ssl: sslForDatabaseUrl(connectionString),
  })
  await client.connect()

  try {
    const alreadyNew = (await tableExists(client, 'movies')) && (await columnExists(client, 'content', 'kind'))
    const isLegacy = await columnExists(client, 'content', 'content_type')

    if (alreadyNew && !isLegacy) {
      console.log('Database already uses the content-supertype schema. Applying schema.sql only.')
      await client.query('BEGIN')
      await applyTargetSchema(client)
      await client.query('COMMIT')
      console.log('Schema applied')
      return
    }

    if (!isLegacy && !(await tableExists(client, 'content'))) {
      console.log('Empty database. Applying schema.sql.')
      await client.query('BEGIN')
      await applyTargetSchema(client)
      await client.query('COMMIT')
      console.log('Schema applied')
      return
    }

    if (!isLegacy) {
      console.error('Could not detect legacy content.content_type or new content.kind. Aborting.')
      process.exitCode = 1
      return
    }

    console.log('Migrating legacy Postgres catalog onto content supertype…')
    await client.query('BEGIN')
    await renameLegacy(client)
    await applyTargetSchema(client)
    await copyLegacyData(client)
    await client.query('COMMIT')
    console.log('Legacy data copied. Old tables remain as legacy_*.')
  } catch (error) {
    await client.query('ROLLBACK')
    console.error('Migration failed:', error)
    process.exitCode = 1
  } finally {
    await client.end()
  }
}

migrate()
