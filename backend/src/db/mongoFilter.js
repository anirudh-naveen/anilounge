/**
 * Compile a subset of Mongo filters used by this API into parameterized SQL.
 */

import { asId } from './ids.js'

const CONTENT_COLUMNS = {
  title: 'c.title',
  englishTitle: 'c.english_title',
  nativeTitle: 'c.native_title',
  originalTitle: 'c.original_title',
  overview: 'c.overview',
  contentType: 'c.content_type',
  posterPath: 'c.poster_path',
  backdropPath: 'c.backdrop_path',
  releaseDate: 'c.release_date',
  lastAirDate: 'c.last_air_date',
  runtime: 'c.runtime',
  episodeCount: 'c.episode_count',
  seasonCount: 'c.season_count',
  tmdbId: 'c.tmdb_id',
  malId: 'c.mal_id',
  voteAverage: 'c.vote_average',
  voteCount: 'c.vote_count',
  popularity: 'c.popularity',
  unifiedScore: 'c.unified_score',
  userRatingAverage: 'c.user_rating_average',
  userRatingCount: 'c.user_rating_count',
  malScore: 'c.mal_score',
  malScoredBy: 'c.mal_scored_by',
  malRank: 'c.mal_rank',
  malStatus: 'c.mal_status',
  malEpisodes: 'c.mal_episodes',
  malMediaType: 'c.mal_media_type',
  malSource: 'c.mal_source',
  malRating: 'c.mal_rating',
  nextEpisodeAirDate: 'c.next_episode_air_date',
  startSeasonYear: 'c.start_season_year',
  startSeason: 'c.start_season',
  characterSyncAt: 'c.character_sync_at',
  internalId: 'c.internal_id',
}

const ENTITY_COLUMNS = {
  entityType: 'e.entity_type',
  name: 'e.name',
  englishName: 'e.english_name',
  nativeName: 'e.native_name',
  about: 'e.about',
  imagePath: 'e.image_path',
  malId: 'e.mal_id',
  tmdbId: 'e.tmdb_id',
  favoritesCount: 'e.favorites_count',
}

const USER_COLUMNS = {
  username: 'u.username',
  email: 'u.email',
  isDemoAccount: 'u.is_demo_account',
}

/**
 * @param {string} pattern
 * @returns {string}
 */
function likePattern(pattern) {
  const unescaped = String(pattern).replace(/\\([.*+?^${}()|[\]\\])/g, '$1')
  return unescaped.replace(/\\/g, '\\\\').replace(/%/g, '\\%').replace(/_/g, '\\_')
}

/**
 * @param {unknown} value
 * @returns {{ pattern: string, mode: 'contains' | 'prefix' | 'exact' } | null}
 */
function regexToLike(value) {
  if (value instanceof RegExp) {
    return regexToLike({ $regex: value.source, $options: value.flags })
  }
  if (!value || typeof value !== 'object' || value.$regex == null) return null
  let source = String(value.$regex)
  let mode = 'contains'
  if (source.startsWith('^') && source.endsWith('$')) {
    mode = 'exact'
    source = source.slice(1, -1)
  } else if (source.startsWith('^')) {
    mode = 'prefix'
    source = source.slice(1)
  } else if (source.endsWith('$')) {
    source = source.slice(0, -1)
  }
  const body = likePattern(source)
  if (mode === 'exact') return { pattern: body, mode }
  if (mode === 'prefix') return { pattern: `${body}%`, mode }
  return { pattern: `%${body}%`, mode }
}

/**
 * @param {{ params: unknown[] }} ctx
 * @param {unknown} value
 * @returns {string}
 */
function pushParam(ctx, value) {
  ctx.params.push(value)
  return `$${ctx.params.length}`
}

/**
 * @param {string} table
 * @returns {{ alias: string, columns: Record<string, string> }}
 */
function tableConfig(table) {
  if (table === 'entities') return { alias: 'e', columns: ENTITY_COLUMNS }
  if (table === 'users') return { alias: 'u', columns: USER_COLUMNS }
  return { alias: 'c', columns: CONTENT_COLUMNS }
}

/**
 * @param {string} table
 * @param {string} field
 * @param {unknown} condition
 * @param {{ params: unknown[] }} ctx
 * @returns {string}
 */
function compileRelation(table, field, condition, ctx) {
  if (table !== 'content' && field !== 'alternativeNames' && field !== 'appearances.content') {
    if (field !== 'alternativeNames') return 'TRUE'
  }

  if (field === 'franchise') {
    const p = pushParam(ctx, condition)
    return `EXISTS (
      SELECT 1 FROM franchise_members fm
      JOIN franchises f ON f.id = fm.franchise_id
      WHERE fm.content_id = c.id AND f.name = ${p}
    )`
  }

  if (field === 'genres' || field === 'genres.name') {
    return compileExists(ctx, 'content_genres', 'cg', 'content_id', 'name', condition, 'c.id')
  }
  if (field === 'studios') {
    return compileExists(ctx, 'content_studio_names', 'cs', 'content_id', 'name', condition, 'c.id')
  }
  if (field === 'productionCompanies') {
    return compileExists(
      ctx,
      'content_production_companies',
      'cp',
      'content_id',
      'name',
      condition,
      'c.id',
    )
  }
  if (field === 'alternativeTitles') {
    return compileExists(
      ctx,
      'content_alternative_titles',
      'ca',
      'content_id',
      'title',
      condition,
      'c.id',
    )
  }
  if (field === 'originCountries') {
    return compileExists(
      ctx,
      'content_origin_countries',
      'cc',
      'content_id',
      'country_code',
      condition,
      'c.id',
    )
  }
  if (field === 'alternativeNames') {
    return compileExists(ctx, 'entity_alternative_names', 'en', 'entity_id', 'name', condition, 'e.id')
  }
  return 'TRUE'
}

/**
 * @param {{ params: unknown[] }} ctx
 * @param {string} relTable
 * @param {string} fk
 * @param {string} column
 * @param {unknown} condition
 * @param {string} parentId
 * @returns {string}
 */
function compileExists(ctx, relTable, alias, fk, column, condition, parentId) {
  if (
    condition &&
    typeof condition === 'object' &&
    !(condition instanceof Date) &&
    (condition.$exists === false || condition.$size === 0)
  ) {
    return `NOT EXISTS (SELECT 1 FROM ${relTable} ${alias} WHERE ${alias}.${fk} = ${parentId})`
  }
  const inner = compileLeaf(`${alias}.${column}`, condition, ctx)
  return `EXISTS (
    SELECT 1 FROM ${relTable} ${alias}
    WHERE ${alias}.${fk} = ${parentId} AND ${inner}
  )`
}

/**
 * @param {string} sqlCol
 * @param {unknown} condition
 * @param {{ params: unknown[] }} ctx
 * @returns {string}
 */
function compileLeaf(sqlCol, condition, ctx) {
  if (condition instanceof RegExp || (condition && typeof condition === 'object' && condition.$regex != null)) {
    const like = regexToLike(condition)
    const p = pushParam(ctx, like.pattern)
    return `${sqlCol} ILIKE ${p} ESCAPE '\\'`
  }

  if (condition && typeof condition === 'object' && !(condition instanceof Date) && !Array.isArray(condition)) {
    const parts = []
    if (condition.$exists === false || condition.$size === 0) {
      parts.push(`${sqlCol} IS NULL`)
    }
    if (condition.$exists === true || condition.$type === 'number') {
      parts.push(`${sqlCol} IS NOT NULL`)
    }
    if (Object.prototype.hasOwnProperty.call(condition, '$eq')) {
      parts.push(`${sqlCol} = ${pushParam(ctx, condition.$eq)}`)
    }
    if (Object.prototype.hasOwnProperty.call(condition, '$ne')) {
      if (condition.$ne == null) parts.push(`${sqlCol} IS NOT NULL`)
      else parts.push(`(${sqlCol} IS DISTINCT FROM ${pushParam(ctx, condition.$ne)})`)
    }
    if (condition.$in) {
      const values = condition.$in.map((value) => asId(value))
      parts.push(`${sqlCol} = ANY(${pushParam(ctx, values)})`)
    }
    if (condition.$nin) {
      const values = condition.$nin.map((value) => asId(value))
      parts.push(`NOT (${sqlCol} = ANY(${pushParam(ctx, values)}))`)
    }
    if (condition.$gt != null) parts.push(`${sqlCol} > ${pushParam(ctx, condition.$gt)}`)
    if (condition.$gte != null) parts.push(`${sqlCol} >= ${pushParam(ctx, condition.$gte)}`)
    if (condition.$lt != null) parts.push(`${sqlCol} < ${pushParam(ctx, condition.$lt)}`)
    if (condition.$lte != null) parts.push(`${sqlCol} <= ${pushParam(ctx, condition.$lte)}`)
    if (parts.length === 0) return 'TRUE'
    return parts.join(' AND ')
  }

  if (condition == null) return `${sqlCol} IS NULL`
  return `${sqlCol} = ${pushParam(ctx, condition)}`
}

/**
 * @param {string} table
 * @param {object} filter
 * @param {{ params: unknown[] }} ctx
 * @returns {string}
 */
function compileNode(table, filter, ctx) {
  if (!filter || typeof filter !== 'object' || Object.keys(filter).length === 0) return 'TRUE'
  const { alias, columns } = tableConfig(table)

  if (Array.isArray(filter.$and)) {
    return filter.$and.map((part) => `(${compileNode(table, part, ctx)})`).join(' AND ') || 'TRUE'
  }
  if (Array.isArray(filter.$or)) {
    return filter.$or.map((part) => `(${compileNode(table, part, ctx)})`).join(' OR ') || 'TRUE'
  }

  const parts = []
  for (const [field, condition] of Object.entries(filter)) {
    if (field === '$and' || field === '$or') {
      parts.push(compileNode(table, { [field]: condition }, ctx))
      continue
    }
    if (field === '_id' || field === 'id') {
      parts.push(compileId(alias, condition, ctx))
      continue
    }
    if (
      field === 'franchise' ||
      field.startsWith('genres') ||
      field === 'studios' ||
      field === 'productionCompanies' ||
      field === 'alternativeTitles' ||
      field === 'originCountries' ||
      field === 'alternativeNames'
    ) {
      parts.push(compileRelation(table, field, condition, ctx))
      continue
    }
    const sqlCol = columns[field]
    if (!sqlCol) {
      parts.push('TRUE')
      continue
    }
    parts.push(compileLeaf(sqlCol, condition, ctx))
  }
  return parts.filter(Boolean).join(' AND ') || 'TRUE'
}

/**
 * @param {string} alias
 * @param {unknown} condition
 * @param {{ params: unknown[] }} ctx
 * @returns {string}
 */
function compileId(alias, condition, ctx) {
  const idSql = (param) => `(${alias}.id::text = ${param} OR ${alias}.mongo_id = ${param})`
  if (condition && typeof condition === 'object' && !Array.isArray(condition) && !(condition instanceof Date)) {
    if (condition.$in) {
      const values = condition.$in.map((value) => asId(value))
      const p = pushParam(ctx, values)
      return `(${alias}.id::text = ANY(${p}) OR ${alias}.mongo_id = ANY(${p}))`
    }
    if (condition.$nin) {
      const values = condition.$nin.map((value) => asId(value))
      const p = pushParam(ctx, values)
      return `NOT (${alias}.id::text = ANY(${p}) OR ${alias}.mongo_id = ANY(${p}))`
    }
    if (condition.$ne) {
      const p = pushParam(ctx, asId(condition.$ne))
      return `NOT ${idSql(p)}`
    }
  }
  const p = pushParam(ctx, asId(condition))
  return idSql(p)
}

/**
 * @param {object} [filter]
 * @param {'content' | 'entities' | 'users'} [table='content']
 * @returns {{ sql: string, params: unknown[] }}
 */
export function compileMongoFilter(filter = {}, table = 'content') {
  const ctx = { params: [] }
  const sql = compileNode(table, filter, ctx)
  return { sql, params: ctx.params }
}

const SORT_COLUMNS = {
  ...CONTENT_COLUMNS,
  favoritesCount: 'e.favorites_count',
  name: 'e.name',
  createdAt: 'created_at',
  popularity: 'c.popularity',
  unifiedScore: 'c.unified_score',
  releaseDate: 'c.release_date',
  nextEpisodeAirDate: 'c.next_episode_air_date',
  _id: 'c.id',
}

/**
 * @param {object | null} sort
 * @param {'content' | 'entities' | 'users'} [table='content']
 * @returns {string}
 */
export function compileSort(sort, table = 'content') {
  if (!sort || typeof sort !== 'object') {
    return table === 'entities' ? 'e.name ASC' : 'c.unified_score DESC NULLS LAST'
  }

  const hiddenScore = `(
    COALESCE(c.unified_score, 0)
    + CASE WHEN c.tmdb_id IS NOT NULL THEN 1.0 ELSE 0 END
    + CASE WHEN c.tmdb_id IS NOT NULL THEN COALESCE(c.popularity, 0) * 0.05 ELSE 0 END
  )`

  const parts = []
  for (const [field, direction] of Object.entries(sort)) {
    const dir = direction === 1 || direction === 'asc' ? 'ASC' : 'DESC'
    if (field === 'hiddenSortScore') {
      parts.push(`${hiddenScore} ${dir} NULLS LAST`)
      continue
    }
    if (field === 'hasScheduleDate') {
      if ('nextEpisodeAirDate' in sort) {
        parts.push(`(c.next_episode_air_date IS NOT NULL) ${dir}`)
      } else {
        parts.push(`(c.release_date IS NOT NULL) ${dir}`)
      }
      continue
    }
    const col =
      field === '_id'
        ? `${table === 'entities' ? 'e' : table === 'users' ? 'u' : 'c'}.id`
        : SORT_COLUMNS[field] || CONTENT_COLUMNS[field]
    if (!col) continue
    parts.push(`${col} ${dir} NULLS LAST`)
  }
  return parts.join(', ') || 'c.id DESC'
}
