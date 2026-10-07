/**
 * Forum: discussion and review posts, tags, comments, and likes.
 *
 * Layer: service. A post is a 'discussion' or a 'review' (reviews carry a 1–10 score)
 * and is tagged with up to TAGS_MAX catalog rows: movies, series, specials,
 * franchises, characters, or one episode of a series (season + episode number).
 * Filtering by a franchise also finds posts tagged with its members. Comments nest
 * one level: a reply to a reply attaches to the top-level comment. Likes rank the
 * "leading" posts and "highlighted" comments shown on title pages and on Home.
 *
 * A review's score follows the author's watchlist: it shows their current rating for
 * the reviewed title (`posts.content_id`, the first movie/series/special tag), falling
 * back to the score saved with the post when they have no rating. The client writes
 * the score to the watchlist when the review is saved. Tags are listed franchise
 * first, then movies/series/specials (episodes after their series), then characters.
 *
 * Text is public, so blocked language is always masked (no profanity opt-in) and the
 * author gets a language warning (`screenText`). Authors edit and delete their own
 * posts and comments; admins can delete anyone's (logged). Banned users' posts and
 * comments are hidden. Throws `HttpError` for user-facing failures.
 */

import { query, startSession } from '../../config/postgres.js'
import { isUuid } from '../db/ids.js'
import Content from '../models/Content.js'
import { isAdminUser } from '../middleware/adminOnly.js'
import { HttpError } from '../utils/httpError.js'
import { cleanUserText } from '../utils/userText.js'
import { logAction, quoteValue } from './adminLog.js'
import { escapeLike, publicUser } from './friendService.js'
import { getSeasonGuide } from './seasonService.js'
import { screenText } from './languageWarningService.js'
import { notify } from './notificationService.js'

export const POST_KINDS = ['discussion', 'review']
export const TAG_KINDS = ['movie', 'series', 'special', 'franchise', 'character']
/** Kinds a review can score. */
export const REVIEWABLE_KINDS = ['movie', 'series', 'special']
export const SORTS = ['hot', 'new', 'top', 'active']
export const TITLE_MAX = 150
export const BODY_MAX = 10000
export const COMMENT_MAX = 4000
export const TAGS_MAX = 5
export const PAGE_SIZE = 20
export const EXCERPT_LENGTH = 280
/** Burst limits per author: posts per 10 minutes, comments per minute. */
export const POST_BURST = { max: 5, seconds: 600 }
export const COMMENT_BURST = { max: 10, seconds: 60 }
/** Home highlights are recomputed on this boundary (UTC), so they "refresh every few hours". */
export const HOME_REFRESH_HOURS = 3
const HOME_LIMIT = 6
const HIGHLIGHT_POSTS = 3
const HIGHLIGHT_COMMENTS = 3
const CHARACTERS_MAX = 30
const SEARCH_WORDS_MAX = 6

/**
 * Ranking for 'hot': engagement decayed by age in hours (comments weigh double).
 * @param {string} [alias] - posts alias.
 * @returns {string}
 */
export function hotScoreSql(alias = 'p') {
  return `((${likeCountSql(alias)} + 2 * ${commentCountSql(alias)} + 1)
    / power(extract(epoch FROM now() - ${alias}.created_at) / 3600 + 2, 1.5))`
}

/** Count queries share the list's params, so `$1` (viewer id) needs a typed use. */
const VIEWER_PARAM = 'CROSS JOIN (SELECT $1::uuid AS viewer_id) viewer'

const likeCountSql = (alias) => `(SELECT count(*) FROM post_likes l WHERE l.post_id = ${alias}.id)`
const commentCountSql = (alias) =>
  `(SELECT count(*) FROM comments c WHERE c.post_id = ${alias}.id AND c.deleted_at IS NULL)`

/** Tag display order: franchise, then movies/series/specials, then characters. */
const TAG_LEVEL_SQL = `CASE tc.kind WHEN 'franchise' THEN 0 WHEN 'character' THEN 2 ELSE 1 END`

/**
 * Columns for a post card. `$1` must be the viewer id (or null).
 * @returns {string}
 */
function postColumns() {
  return `p.id, p.kind, p.title, p.body, p.content_id AS subject_id, p.spoiler,
    p.created_at, p.edited_at,
    COALESCE((
      SELECT r.score FROM ratings r
      WHERE r.user_id = p.user_id AND r.content_id = p.content_id AND r.score >= 1
    ), p.score) AS score,
    p.last_activity_at, u.id AS author_id, u.username AS author_username,
    u.profile_picture AS author_picture,
    ${likeCountSql('p')}::int AS like_count,
    ${commentCountSql('p')}::int AS comment_count,
    EXISTS (SELECT 1 FROM post_likes l WHERE l.post_id = p.id AND l.user_id = $1::uuid) AS liked,
    COALESCE((
      SELECT json_agg(json_build_object(
        'contentId', t.content_id, 'kind', tc.kind, 'name', tc.name,
        'imagePath', tc.image_path, 'season', t.season_number, 'episode', t.episode_number
      ) ORDER BY ${TAG_LEVEL_SQL}, tc.name, t.season_number NULLS FIRST, t.episode_number)
      FROM post_tags t JOIN content tc ON tc.id = t.content_id
      WHERE t.post_id = p.id
    ), '[]'::json) AS tags`
}

/**
 * Text cut to a preview length on a word boundary.
 * @param {string} text
 * @param {number} [length]
 * @returns {string}
 */
export function excerptOf(text, length = EXCERPT_LENGTH) {
  const flat = String(text || '')
    .replace(/\s+/g, ' ')
    .trim()
  if (flat.length <= length) return flat
  const cut = flat.slice(0, length)
  const space = cut.lastIndexOf(' ')
  return `${(space > length * 0.6 ? cut.slice(0, space) : cut).trimEnd()}…`
}

/**
 * Client shape for a post row.
 * @param {object} row - From `postColumns`.
 * @param {{ full?: boolean, viewer?: object | null }} [options] - `full` keeps the whole
 *   body (post page); otherwise only an excerpt.
 * @returns {object}
 */
export function postEntry(row, { full = false, viewer = null } = {}) {
  const mine = Boolean(viewer && String(viewer._id) === String(row.author_id))
  return {
    id: String(row.id),
    kind: row.kind,
    title: row.title,
    ...(full ? { body: row.body } : { excerpt: excerptOf(row.body) }),
    score: row.score === null || row.score === undefined ? null : Number(row.score),
    subjectId: row.subject_id ? String(row.subject_id) : null,
    spoiler: Boolean(row.spoiler),
    createdAt: row.created_at,
    editedAt: row.edited_at || null,
    lastActivityAt: row.last_activity_at,
    author: publicUser({
      id: row.author_id,
      username: row.author_username,
      profile_picture: row.author_picture,
    }),
    likeCount: row.like_count || 0,
    commentCount: row.comment_count || 0,
    liked: Boolean(row.liked),
    tags: (row.tags || []).map((tag) => ({
      contentId: String(tag.contentId),
      kind: tag.kind,
      name: tag.name,
      imagePath: tag.imagePath || null,
      season: tag.season ?? null,
      episode: tag.episode ?? null,
    })),
    canEdit: mine,
    canDelete: mine || Boolean(viewer && isAdminUser(viewer)),
  }
}

/**
 * Client shape for a comment row.
 * @param {object} row
 * @param {object | null} viewer
 * @returns {object}
 */
function commentEntry(row, viewer) {
  const mine = Boolean(viewer && String(viewer._id) === String(row.user_id))
  const deleted = Boolean(row.deleted_at)
  return {
    id: String(row.id),
    postId: String(row.post_id),
    parentId: row.parent_id ? String(row.parent_id) : null,
    body: deleted ? '' : row.body,
    deleted,
    createdAt: row.created_at,
    editedAt: row.edited_at || null,
    author: deleted
      ? null
      : publicUser({
          id: row.user_id,
          username: row.username,
          profile_picture: row.profile_picture,
        }),
    likeCount: row.like_count || 0,
    liked: Boolean(row.liked),
    canEdit: mine && !deleted,
    canDelete: !deleted && (mine || Boolean(viewer && isAdminUser(viewer))),
  }
}

/**
 * `S<season>E<episode>` keys for every episode of a series, from the same season guide
 * the series page shows. Empty when no list is available (no TMDB/MAL data, or the
 * lookup failed).
 * @param {string} seriesId
 * @returns {Promise<Set<string>>}
 */
export async function loadEpisodeKeys(seriesId) {
  try {
    const content = await Content.findById(seriesId)
    if (!content) return new Set()
    const guide = await getSeasonGuide(content)
    return new Set(
      (guide.episodes || []).map((ep) => episodeKey(ep.seasonNumber, ep.episodeNumber)),
    )
  } catch (error) {
    console.error('Episode list for forum tag failed:', error.message)
    return new Set()
  }
}

/**
 * @param {number} season
 * @param {number} episode
 * @returns {string} e.g. `S1E5`.
 */
export const episodeKey = (season, episode) => `S${Number(season)}E${Number(episode)}`

/**
 * Validate the tag list of a new or edited post. Episode tags must be a real episode
 * of the series (checked against its episode list).
 * @param {unknown} input - `[{ contentId, season?, episode? }]`.
 * @param {{ loadEpisodes?: (seriesId: string) => Promise<Set<string>> }} [options] - For tests.
 * @returns {Promise<Array<{ contentId: string, kind: string, season: number | null, episode: number | null }>>}
 * @throws {HttpError} 400 on bad shape, too many, unknown content, an episode on a
 *   non-series, or an episode the series doesn't have.
 */
export async function validateTags(input, { loadEpisodes = loadEpisodeKeys } = {}) {
  if (input === undefined || input === null) return []
  if (!Array.isArray(input)) throw new HttpError(400, 'Tags must be a list.')
  const seen = new Set()
  const tags = []
  for (const raw of input) {
    const contentId = String(raw?.contentId || '')
    if (!isUuid(contentId)) throw new HttpError(400, 'Invalid tag.')
    const hasEpisode = raw?.season !== undefined && raw?.season !== null && raw?.season !== ''
    const season = hasEpisode ? Number(raw.season) : null
    const episode = hasEpisode ? Number(raw.episode) : null
    if (hasEpisode && !(Number.isInteger(season) && season >= 0 && season <= 999)) {
      throw new HttpError(400, 'Episode tags need a season number (0 or more).')
    }
    if (hasEpisode && !(Number.isInteger(episode) && episode >= 1 && episode <= 9999)) {
      throw new HttpError(400, 'Episode tags need an episode number (1 or more).')
    }
    const key = `${contentId}:${season ?? ''}:${episode ?? ''}`
    if (seen.has(key)) continue
    seen.add(key)
    tags.push({ contentId, season, episode })
  }
  if (tags.length > TAGS_MAX) throw new HttpError(400, `Posts can have up to ${TAGS_MAX} tags.`)
  if (!tags.length) return []

  const { rows } = await query(`SELECT id, kind, name FROM content WHERE id = ANY($1::uuid[])`, [
    [...new Set(tags.map((tag) => tag.contentId))],
  ])
  const found = new Map(rows.map((row) => [String(row.id), row]))
  const episodeLists = new Map()
  const out = []
  for (const tag of tags) {
    const row = found.get(tag.contentId)
    if (!row || !TAG_KINDS.includes(row.kind)) {
      throw new HttpError(400, 'One of the tags no longer exists.')
    }
    if (tag.season !== null) {
      if (row.kind !== 'series')
        throw new HttpError(400, 'Only series can be tagged with an episode.')
      if (!episodeLists.has(tag.contentId)) {
        episodeLists.set(tag.contentId, await loadEpisodes(tag.contentId))
      }
      const episodes = episodeLists.get(tag.contentId)
      if (!episodes.size) {
        throw new HttpError(
          400,
          `There's no episode list for ${row.name} right now, so tag the whole series instead.`,
        )
      }
      if (!episodes.has(episodeKey(tag.season, tag.episode))) {
        throw new HttpError(
          400,
          `${row.name} has no episode ${episodeKey(tag.season, tag.episode)}.`,
        )
      }
    }
    out.push({ ...tag, kind: row.kind })
  }
  return out
}

/**
 * Validate and clean the fields of a post.
 * @param {object} input - `{ kind, title, body, score, spoiler, tags }`.
 * @param {{ partial?: boolean, kind?: string }} [options] - `partial` for edits (kind is fixed).
 * @returns {Promise<object>} Cleaned fields; tags validated.
 * @throws {HttpError} 400 on any invalid field.
 */
export async function validatePostInput(input = {}, { partial = false, kind: fixedKind } = {}) {
  const kind = fixedKind || input.kind
  if (!POST_KINDS.includes(kind))
    throw new HttpError(400, 'Post type must be discussion or review.')
  const out = { kind }

  if (!partial || input.title !== undefined) {
    const title = cleanUserText(input.title).replace(/\s+/g, ' ')
    if (!title) throw new HttpError(400, 'Give your post a title.')
    if (title.length > TITLE_MAX)
      throw new HttpError(400, `Titles must be ${TITLE_MAX} characters or fewer.`)
    out.title = title
  }
  if (!partial || input.body !== undefined) {
    const body = cleanUserText(input.body)
    if (!body) throw new HttpError(400, "Posts can't be empty.")
    if (body.length > BODY_MAX)
      throw new HttpError(400, `Posts must be ${BODY_MAX} characters or fewer.`)
    out.body = body
  }
  if (kind === 'review' && (!partial || input.score !== undefined)) {
    const score = Math.round(Number(input.score) * 10) / 10
    if (!Number.isFinite(score) || score < 1 || score > 10) {
      throw new HttpError(400, 'Reviews need a score from 1 to 10.')
    }
    out.score = score
  }
  if (input.spoiler !== undefined) out.spoiler = input.spoiler === true
  if (!partial || input.tags !== undefined) {
    out.tags = await validateTags(input.tags)
    if (kind === 'review' && !out.tags.some((tag) => REVIEWABLE_KINDS.includes(tag.kind))) {
      throw new HttpError(400, 'Tag the movie, series, or special you are reviewing.')
    }
  }
  return out
}

/**
 * The title a review scores: its first movie, series, or special tag.
 * @param {Array<{ contentId: string, kind: string }>} tags - Validated, in submitted order.
 * @returns {string | null}
 */
export function reviewSubject(tags) {
  return tags.find((tag) => REVIEWABLE_KINDS.includes(tag.kind))?.contentId || null
}

/**
 * Refuse a write while the author is over a burst limit.
 * @param {string} table - 'posts' or 'comments'.
 * @param {string} userId
 * @param {{ max: number, seconds: number }} burst
 * @returns {Promise<void>}
 * @throws {HttpError} 429
 */
async function assertBurst(table, userId, burst) {
  const { rows } = await query(
    `SELECT count(*)::int AS count FROM ${table}
     WHERE user_id = $1 AND created_at > now() - make_interval(secs => $2)`,
    [userId, burst.seconds],
  )
  if ((rows[0]?.count || 0) >= burst.max) {
    throw new HttpError(429, "You're posting too fast. Wait a moment and try again.")
  }
}

/**
 * @param {Array<{ contentId: string, season: number | null, episode: number | null }>} tags
 * @param {string} postId
 * @returns {Promise<void>}
 */
async function insertTags(postId, tags) {
  if (!tags.length) return
  await query(
    `INSERT INTO post_tags (post_id, content_id, season_number, episode_number)
     SELECT $1, t.content_id, t.season, t.episode
     FROM unnest($2::uuid[], $3::int[], $4::int[]) AS t(content_id, season, episode)`,
    [
      postId,
      tags.map((tag) => tag.contentId),
      tags.map((tag) => tag.season),
      tags.map((tag) => tag.episode),
    ],
  )
}

/**
 * Run `work` in a transaction.
 * @template T
 * @param {() => Promise<T>} work
 * @returns {Promise<T>}
 */
async function inTransaction(work) {
  const session = await startSession()
  try {
    session.startTransaction()
    const result = await work()
    await session.commitTransaction()
    return result
  } catch (error) {
    await session.abortTransaction()
    throw error
  } finally {
    session.endSession()
  }
}

/**
 * Load one visible post.
 * @param {string} postId
 * @param {object | null} viewer
 * @returns {Promise<object>} Row from `postColumns`.
 * @throws {HttpError} 404
 */
async function loadPost(postId, viewer) {
  if (!isUuid(postId)) throw new HttpError(404, 'Post not found.')
  const { rows } = await query(
    `SELECT ${postColumns()}, p.user_id FROM posts p JOIN users u ON u.id = p.user_id
     WHERE p.id = $2 AND u.banned_at IS NULL`,
    [viewer?._id || null, postId],
  )
  if (!rows[0]) throw new HttpError(404, 'Post not found.')
  return rows[0]
}

/**
 * Create a post.
 * @param {{ _id: string, username: string }} user
 * @param {object} input - `{ kind, title, body, score?, spoiler?, tags? }`.
 * @returns {Promise<{ post: object, warning: object | null }>}
 */
export async function createPost(user, input) {
  const fields = await validatePostInput(input)
  await assertBurst('posts', user._id, POST_BURST)
  const screened = await screenText(user, 'post', { title: fields.title, body: fields.body })
  const postId = await inTransaction(async () => {
    const { rows } = await query(
      `INSERT INTO posts (user_id, kind, title, body, score, spoiler, content_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
      [
        user._id,
        fields.kind,
        screened.fields.title,
        screened.fields.body,
        fields.kind === 'review' ? fields.score : null,
        fields.spoiler === true,
        fields.kind === 'review' ? reviewSubject(fields.tags) : null,
      ],
    )
    await insertTags(rows[0].id, fields.tags)
    return rows[0].id
  })
  return {
    post: postEntry(await loadPost(postId, user), { full: true, viewer: user }),
    warning: screened.warning,
  }
}

/**
 * Edit your own post: title, body, score (reviews), spoiler flag, and tags.
 * @param {{ _id: string, username: string }} user
 * @param {string} postId
 * @param {object} input
 * @returns {Promise<{ post: object, warning: object | null }>}
 * @throws {HttpError} 403 not yours, 404
 */
export async function updatePost(user, postId, input = {}) {
  const row = await loadPost(postId, user)
  if (String(row.author_id) !== String(user._id))
    throw new HttpError(403, 'You can only edit your own posts.')
  const fields = await validatePostInput(input, { partial: true, kind: row.kind })
  const text = {}
  if (fields.title !== undefined) text.title = fields.title
  if (fields.body !== undefined) text.body = fields.body
  const screened = Object.keys(text).length
    ? await screenText(user, 'post', text)
    : { fields: {}, warning: null }

  await inTransaction(async () => {
    await query(
      `UPDATE posts SET
         title = COALESCE($2, title),
         body = COALESCE($3, body),
         score = COALESCE($4, score),
         spoiler = COALESCE($5, spoiler),
         content_id = COALESCE($6, content_id),
         edited_at = now()
       WHERE id = $1`,
      [
        row.id,
        screened.fields.title ?? null,
        screened.fields.body ?? null,
        fields.score ?? null,
        fields.spoiler ?? null,
        row.kind === 'review' && fields.tags ? reviewSubject(fields.tags) : null,
      ],
    )
    if (fields.tags) {
      await query('DELETE FROM post_tags WHERE post_id = $1', [row.id])
      await insertTags(row.id, fields.tags)
    }
  })
  return {
    post: postEntry(await loadPost(row.id, user), { full: true, viewer: user }),
    warning: screened.warning,
  }
}

/**
 * Delete a post (author, or an admin; admin deletions are logged).
 * @param {object} user
 * @param {string} postId
 * @returns {Promise<void>}
 * @throws {HttpError} 403, 404
 */
export async function deletePost(user, postId) {
  const row = await loadPost(postId, user)
  const mine = String(row.author_id) === String(user._id)
  if (!mine && !isAdminUser(user)) throw new HttpError(403, 'You can only delete your own posts.')
  await query('DELETE FROM posts WHERE id = $1', [row.id])
  if (!mine) {
    await logAction(
      'moderation',
      user,
      `Deleted forum post ${quoteValue(row.title)} by ${quoteValue(row.author_username)}`,
    )
  }
}

/**
 * Tag filter: posts tagged with `$n`, or (for a franchise) with any of its members.
 * Optional season/episode narrow it to one episode thread.
 * @param {unknown[]} params - Mutated: tag values are pushed.
 * @param {{ tag?: string, season?: number | null, episode?: number | null }} filter
 * @returns {string} SQL condition ('' without a tag).
 */
function tagFilterSql(params, { tag, season, episode }) {
  if (!tag) return ''
  params.push(tag)
  const tagParam = `$${params.length}`
  let episodeSql = ''
  if (season !== null && season !== undefined && episode !== null && episode !== undefined) {
    params.push(season, episode)
    episodeSql = `AND t.season_number = $${params.length - 1} AND t.episode_number = $${params.length}`
  }
  return `AND EXISTS (
    SELECT 1 FROM post_tags t
    WHERE t.post_id = p.id ${episodeSql}
      AND t.content_id IN (
        SELECT ${tagParam}::uuid
        UNION SELECT member_id FROM franchise_members WHERE franchise_id = ${tagParam}::uuid
      )
  )`
}

/**
 * Describe a tag for the forum header.
 * @param {string} contentId
 * @returns {Promise<{ contentId: string, kind: string, name: string, imagePath: string | null } | null>}
 */
async function describeTag(contentId) {
  const { rows } = await query('SELECT id, kind, name, image_path FROM content WHERE id = $1', [
    contentId,
  ])
  if (!rows[0] || !TAG_KINDS.includes(rows[0].kind)) return null
  return {
    contentId: String(rows[0].id),
    kind: rows[0].kind,
    name: rows[0].name,
    imagePath: rows[0].image_path || null,
  }
}

/**
 * Parse an integer query value.
 * @param {unknown} value
 * @returns {number | null}
 */
const intOrNull = (value) => {
  if (value === undefined || value === null || value === '') return null
  const n = Number(value)
  return Number.isInteger(n) ? n : null
}

/**
 * Words of a forum search, at most SEARCH_WORDS_MAX, each 2+ characters.
 * @param {unknown} q
 * @returns {string[]}
 */
export function searchWords(q) {
  if (typeof q !== 'string') return []
  return [...new Set(q.trim().slice(0, 100).toLowerCase().split(/\s+/))]
    .filter((word) => word.length >= 2)
    .slice(0, SEARCH_WORDS_MAX)
}

/**
 * A page of posts.
 * @param {object | null} viewer
 * @param {{ tag?: unknown, season?: unknown, episode?: unknown, kind?: unknown, sort?: unknown, page?: unknown, author?: unknown, q?: unknown }} [filters]
 *   `q` searches post titles, bodies, and tag names; every word must match.
 * @returns {Promise<{ items: object[], page: number, pageSize: number, total: number, tag: object | null, sort: string }>}
 * @throws {HttpError} 400 bad tag, 404 unknown tag.
 */
export async function listPosts(viewer, filters = {}) {
  const sort = SORTS.includes(filters.sort) ? filters.sort : 'hot'
  const page = Math.max(1, intOrNull(filters.page) || 1)
  const tagId = filters.tag ? String(filters.tag) : ''
  if (tagId && !isUuid(tagId)) throw new HttpError(400, 'Invalid tag.')
  const tag = tagId ? await describeTag(tagId) : null
  if (tagId && !tag) throw new HttpError(404, 'That tag no longer exists.')

  const params = [viewer?._id || null]
  const clauses = ['u.banned_at IS NULL']
  if (POST_KINDS.includes(filters.kind)) {
    params.push(filters.kind)
    clauses.push(`p.kind = $${params.length}`)
  }
  if (typeof filters.author === 'string' && filters.author) {
    params.push(filters.author)
    clauses.push(`lower(u.username) = lower($${params.length})`)
  }
  for (const word of searchWords(filters.q)) {
    params.push(`%${escapeLike(word)}%`)
    const like = `$${params.length}`
    clauses.push(`(p.title ILIKE ${like} OR p.body ILIKE ${like} OR EXISTS (
      SELECT 1 FROM post_tags st JOIN content sc ON sc.id = st.content_id
      WHERE st.post_id = p.id AND (sc.name ILIKE ${like} OR sc.native_name ILIKE ${like})
    ))`)
  }
  const tagSql = tagFilterSql(params, {
    tag: tagId,
    season: intOrNull(filters.season),
    episode: intOrNull(filters.episode),
  })
  const where = `${clauses.join(' AND ')} ${tagSql}`
  const order = {
    hot: `${hotScoreSql('p')} DESC, p.created_at DESC`,
    new: 'p.created_at DESC',
    top: `${likeCountSql('p')} DESC, p.created_at DESC`,
    active: 'p.last_activity_at DESC',
  }[sort]

  const [{ rows }, count] = await Promise.all([
    query(
      `SELECT ${postColumns()} FROM posts p JOIN users u ON u.id = p.user_id
       WHERE ${where}
       ORDER BY ${order}
       LIMIT ${PAGE_SIZE} OFFSET ${(page - 1) * PAGE_SIZE}`,
      params,
    ),
    query(
      `SELECT count(*)::int AS n FROM posts p JOIN users u ON u.id = p.user_id ${VIEWER_PARAM} WHERE ${where}`,
      params,
    ),
  ])
  return {
    items: rows.map((row) => postEntry(row, { viewer })),
    page,
    pageSize: PAGE_SIZE,
    total: count.rows[0].n,
    tag,
    sort,
  }
}

/**
 * Comment rows for a set of posts (or one), with likes; banned authors hidden.
 * @param {string} where - SQL condition on `c`.
 * @param {unknown[]} params - `$1` is the viewer id.
 * @param {string} [tail] - ORDER/LIMIT.
 * @returns {Promise<object[]>}
 */
async function commentRows(where, params, tail = 'ORDER BY c.created_at') {
  const { rows } = await query(
    `SELECT c.id, c.post_id, c.parent_id, c.user_id, c.body, c.created_at, c.edited_at,
            c.deleted_at, u.username, u.profile_picture,
            (SELECT count(*)::int FROM comment_likes l WHERE l.comment_id = c.id) AS like_count,
            EXISTS (SELECT 1 FROM comment_likes l WHERE l.comment_id = c.id AND l.user_id = $1::uuid) AS liked
     FROM comments c JOIN users u ON u.id = c.user_id
     WHERE u.banned_at IS NULL AND ${where}
     ${tail}`,
    params,
  )
  return rows
}

/**
 * One post with its comments (oldest first; `parentId` links replies).
 * @param {object | null} viewer
 * @param {string} postId
 * @returns {Promise<{ post: object, comments: object[] }>}
 * @throws {HttpError} 404
 */
export async function getPost(viewer, postId) {
  const row = await loadPost(postId, viewer)
  const comments = await commentRows('c.post_id = $2', [viewer?._id || null, row.id])
  return {
    post: postEntry(row, { full: true, viewer }),
    comments: comments.map((comment) => commentEntry(comment, viewer)),
  }
}

/**
 * Like or unlike a post. You can't like your own.
 * @param {object} user
 * @param {string} postId
 * @param {boolean} liked
 * @returns {Promise<{ liked: boolean, likeCount: number }>}
 */
export async function setPostLike(user, postId, liked) {
  const row = await loadPost(postId, user)
  if (String(row.author_id) === String(user._id))
    throw new HttpError(400, "You can't like your own post.")
  if (liked) {
    await query(
      'INSERT INTO post_likes (post_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
      [row.id, user._id],
    )
  } else {
    await query('DELETE FROM post_likes WHERE post_id = $1 AND user_id = $2', [row.id, user._id])
  }
  const { rows } = await query('SELECT count(*)::int AS n FROM post_likes WHERE post_id = $1', [
    row.id,
  ])
  return { liked, likeCount: rows[0].n }
}

/**
 * Load one visible comment.
 * @param {string} commentId
 * @param {object | null} viewer
 * @returns {Promise<object>}
 * @throws {HttpError} 404
 */
async function loadComment(commentId, viewer) {
  if (!isUuid(commentId)) throw new HttpError(404, 'Comment not found.')
  const rows = await commentRows('c.id = $2', [viewer?._id || null, commentId])
  if (!rows[0]) throw new HttpError(404, 'Comment not found.')
  return rows[0]
}

/**
 * Validate a comment body.
 * @param {unknown} value
 * @returns {string}
 * @throws {HttpError} 400
 */
export function cleanCommentBody(value) {
  const body = cleanUserText(value)
  if (!body) throw new HttpError(400, "Comments can't be empty.")
  if (body.length > COMMENT_MAX)
    throw new HttpError(400, `Comments must be ${COMMENT_MAX} characters or fewer.`)
  return body
}

/**
 * Comment on a post, or reply to a comment (replies to replies attach to the
 * top-level comment). Notifies the post author and the replied-to author.
 * @param {{ _id: string, username: string }} user
 * @param {string} postId
 * @param {{ body?: unknown, parentId?: unknown }} input
 * @returns {Promise<{ comment: object, warning: object | null }>}
 * @throws {HttpError} 400, 404, 429
 */
export async function createComment(user, postId, { body, parentId } = {}) {
  const text = cleanCommentBody(body)
  const post = await loadPost(postId, user)
  let parent = null
  if (parentId) {
    parent = await loadComment(String(parentId), user)
    if (String(parent.post_id) !== String(post.id))
      throw new HttpError(400, 'That comment is on another post.')
    // One level of nesting: a reply to a reply attaches to its top-level comment.
    if (parent.parent_id) parent = await loadComment(String(parent.parent_id), user)
  }
  await assertBurst('comments', user._id, COMMENT_BURST)
  const screened = await screenText(user, 'comment', { body: text })
  const { rows } = await query(
    `INSERT INTO comments (post_id, user_id, parent_id, body) VALUES ($1, $2, $3, $4) RETURNING id`,
    [post.id, user._id, parent?.id || null, screened.fields.body],
  )
  await query('UPDATE posts SET last_activity_at = now() WHERE id = $1', [post.id])

  const commentId = rows[0].id
  await notify(post.author_id, 'post_comment', { actorId: user._id, postId: post.id, commentId })
  if (parent && !parent.deleted_at && String(parent.user_id) !== String(post.author_id)) {
    await notify(parent.user_id, 'comment_reply', { actorId: user._id, postId: post.id, commentId })
  }
  return {
    comment: commentEntry(await loadComment(commentId, user), user),
    warning: screened.warning,
  }
}

/**
 * Edit your own comment.
 * @param {object} user
 * @param {string} commentId
 * @param {{ body?: unknown }} input
 * @returns {Promise<{ comment: object, warning: object | null }>}
 */
export async function updateComment(user, commentId, { body } = {}) {
  const row = await loadComment(commentId, user)
  if (row.deleted_at) throw new HttpError(404, 'Comment not found.')
  if (String(row.user_id) !== String(user._id))
    throw new HttpError(403, 'You can only edit your own comments.')
  const screened = await screenText(user, 'comment', { body: cleanCommentBody(body) })
  await query('UPDATE comments SET body = $2, edited_at = now() WHERE id = $1', [
    row.id,
    screened.fields.body,
  ])
  return { comment: commentEntry(await loadComment(row.id, user), user), warning: screened.warning }
}

/**
 * Delete a comment (author or admin). A comment with replies is blanked to keep the
 * thread readable; one without is removed.
 * @param {object} user
 * @param {string} commentId
 * @returns {Promise<{ removed: boolean }>} `removed` false when blanked.
 */
export async function deleteComment(user, commentId) {
  const row = await loadComment(commentId, user)
  if (row.deleted_at) throw new HttpError(404, 'Comment not found.')
  const mine = String(row.user_id) === String(user._id)
  if (!mine && !isAdminUser(user))
    throw new HttpError(403, 'You can only delete your own comments.')
  const { rows } = await query('SELECT 1 FROM comments WHERE parent_id = $1 LIMIT 1', [row.id])
  if (rows.length) {
    await query(`UPDATE comments SET deleted_at = now(), body = '[deleted]' WHERE id = $1`, [
      row.id,
    ])
    await query('DELETE FROM comment_likes WHERE comment_id = $1', [row.id])
  } else {
    await query('DELETE FROM comments WHERE id = $1', [row.id])
  }
  if (!mine) {
    await logAction(
      'moderation',
      user,
      `Deleted a forum comment by ${quoteValue(row.username)}: ${quoteValue(row.body)}`,
    )
  }
  return { removed: !rows.length }
}

/**
 * Like or unlike a comment. You can't like your own.
 * @param {object} user
 * @param {string} commentId
 * @param {boolean} liked
 * @returns {Promise<{ liked: boolean, likeCount: number }>}
 */
export async function setCommentLike(user, commentId, liked) {
  const row = await loadComment(commentId, user)
  if (row.deleted_at) throw new HttpError(404, 'Comment not found.')
  if (String(row.user_id) === String(user._id))
    throw new HttpError(400, "You can't like your own comment.")
  if (liked) {
    await query(
      'INSERT INTO comment_likes (comment_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
      [row.id, user._id],
    )
  } else {
    await query('DELETE FROM comment_likes WHERE comment_id = $1 AND user_id = $2', [
      row.id,
      user._id,
    ])
  }
  const { rows } = await query(
    'SELECT count(*)::int AS n FROM comment_likes WHERE comment_id = $1',
    [row.id],
  )
  return { liked, likeCount: rows[0].n }
}

/**
 * Taggable catalog rows by name, for the composer's tag picker. Prefix matches first.
 * @param {unknown} term
 * @returns {Promise<Array<{ contentId: string, kind: string, name: string, imagePath: string | null, seasonCount: number | null, episodeCount: number | null, year: number | null }>>}
 */
export async function searchTags(term) {
  const q = typeof term === 'string' ? term.trim().slice(0, 80) : ''
  if (q.length < 2) return []
  const escaped = escapeLike(q)
  const { rows } = await query(
    `SELECT c.id, c.kind, c.name, c.image_path, s.season_count, s.episode_count,
            EXTRACT(YEAR FROM COALESCE(m.release_date, s.release_date, sp.release_date))::int AS year
     FROM content c
     LEFT JOIN series s ON s.content_id = c.id
     LEFT JOIN movies m ON m.content_id = c.id
     LEFT JOIN specials sp ON sp.content_id = c.id
     LEFT JOIN characters ch ON ch.content_id = c.id
     WHERE c.kind = ANY($1::text[])
       AND (c.name ILIKE $2 OR c.native_name ILIKE $2 OR ch.english_name ILIKE $2)
     ORDER BY (lower(c.name) = lower($4)) DESC, (c.name ILIKE $3) DESC,
              CASE c.kind WHEN 'franchise' THEN 0 WHEN 'series' THEN 1 WHEN 'movie' THEN 2
                          WHEN 'special' THEN 3 ELSE 4 END,
              COALESCE(s.popularity, 0) DESC, c.name
     LIMIT 12`,
    [TAG_KINDS, `%${escaped}%`, `${escaped}%`, q],
  )
  return rows.map((row) => ({
    contentId: String(row.id),
    kind: row.kind,
    name: row.name,
    imagePath: row.image_path || null,
    seasonCount: row.season_count ?? null,
    episodeCount: row.episode_count ?? null,
    year: row.year ?? null,
  }))
}

/**
 * Characters in a movie, series, or special, for the tag picker's expandable list:
 * main cast first, then by importance.
 * @param {string} contentId
 * @returns {Promise<Array<{ contentId: string, kind: 'character', name: string, imagePath: string | null, role: string }>>}
 * @throws {HttpError} 400 invalid id.
 */
export async function contentCharacters(contentId) {
  if (!isUuid(contentId)) throw new HttpError(400, 'Invalid content id.')
  const { rows } = await query(
    `SELECT c.id, c.name, c.image_path, a.role
     FROM appearances a JOIN content c ON c.id = a.character_id
     WHERE a.work_id = $1
     ORDER BY CASE a.role WHEN 'main' THEN 0 WHEN 'supporting' THEN 1 ELSE 2 END,
              a.importance DESC, c.name
     LIMIT ${CHARACTERS_MAX}`,
    [contentId],
  )
  return rows.map((row) => ({
    contentId: String(row.id),
    kind: 'character',
    name: row.name,
    imagePath: row.image_path || null,
    role: row.role,
  }))
}

/**
 * Leading posts and highlighted comments for a title or character page: posts tagged
 * with it (or, for a franchise member, with its franchise), ranked hot (recent
 * engagement); comments with at least one like on those posts, most liked first.
 * @param {object | null} viewer
 * @param {string} contentId
 * @returns {Promise<{ posts: object[], comments: object[], total: number, franchise: object | null }>}
 * @throws {HttpError} 400 invalid id.
 */
export async function getHighlights(viewer, contentId) {
  if (!isUuid(contentId)) throw new HttpError(400, 'Invalid content id.')
  const { rows: franchiseRows } = await query(
    `SELECT c.id, c.name FROM franchise_members fm JOIN content c ON c.id = fm.franchise_id
     WHERE fm.member_id = $1`,
    [contentId],
  )
  const franchise = franchiseRows[0]
    ? { contentId: String(franchiseRows[0].id), name: franchiseRows[0].name }
    : null
  const ids = [contentId, ...(franchise ? [franchise.contentId] : [])]
  const tagged = `EXISTS (SELECT 1 FROM post_tags t WHERE t.post_id = p.id AND t.content_id = ANY($2::uuid[]))`

  const [{ rows: postRows }, count] = await Promise.all([
    query(
      `SELECT ${postColumns()} FROM posts p JOIN users u ON u.id = p.user_id
       WHERE u.banned_at IS NULL AND ${tagged}
       ORDER BY ${hotScoreSql('p')} DESC, p.created_at DESC
       LIMIT ${HIGHLIGHT_POSTS}`,
      [viewer?._id || null, ids],
    ),
    query(
      `SELECT count(*)::int AS n FROM posts p JOIN users u ON u.id = p.user_id ${VIEWER_PARAM}
       WHERE u.banned_at IS NULL AND ${tagged}`,
      [null, ids],
    ),
  ])
  const commentList = await commentRows(
    `c.deleted_at IS NULL AND c.post_id IN (
       SELECT p.id FROM posts p JOIN users pu ON pu.id = p.user_id
       WHERE pu.banned_at IS NULL AND ${tagged})
     AND EXISTS (SELECT 1 FROM comment_likes l WHERE l.comment_id = c.id)`,
    [viewer?._id || null, ids],
    `ORDER BY like_count DESC, c.created_at DESC LIMIT ${HIGHLIGHT_COMMENTS}`,
  )
  const titles = await postTitles(commentList.map((row) => row.post_id))
  return {
    posts: postRows.map((row) => postEntry(row, { viewer })),
    comments: commentList.map((row) => ({
      ...commentEntry(row, viewer),
      postTitle: titles.get(String(row.post_id)) || '',
    })),
    total: count.rows[0].n,
    franchise,
  }
}

/**
 * @param {string[]} postIds
 * @returns {Promise<Map<string, string>>}
 */
async function postTitles(postIds) {
  if (!postIds.length) return new Map()
  const { rows } = await query('SELECT id, title FROM posts WHERE id = ANY($1::uuid[])', [postIds])
  return new Map(rows.map((row) => [String(row.id), row.title]))
}

/**
 * When the current Home highlight window ends (the next HOME_REFRESH_HOURS boundary, UTC).
 * @param {number} [now]
 * @returns {Date}
 */
export function homeWindowEnd(now = Date.now()) {
  const span = HOME_REFRESH_HOURS * 60 * 60 * 1000
  return new Date(Math.floor(now / span) * span + span)
}

/**
 * viewer id (or 'guest') → { expires, pick }. Only which posts were picked is cached
 * (per process); their counts and the viewer's likes are re-read on every request.
 */
const homeCache = new Map()

/**
 * Pick the Home posts for one window: signed in, hot posts tagged with titles on the
 * viewer's watchlist (or their franchises), topped up with hot posts from everyone;
 * guests, hot posts from everyone.
 * @param {object | null} viewer
 * @returns {Promise<{ ids: string[], forYou: Set<string> }>} Ids in display order.
 */
async function pickHomePosts(viewer) {
  const recent = `p.created_at > now() - interval '60 days'`
  let personal = []
  if (viewer?._id) {
    const { rows } = await query(
      `WITH mine AS (
         SELECT w.content_id AS id FROM watchlist w WHERE w.user_id = $1
         UNION SELECT fm.franchise_id FROM watchlist w
           JOIN franchise_members fm ON fm.member_id = w.content_id WHERE w.user_id = $1
       )
       SELECT p.id FROM posts p JOIN users u ON u.id = p.user_id
       WHERE u.banned_at IS NULL AND ${recent} AND p.user_id <> $1
         AND EXISTS (SELECT 1 FROM post_tags t WHERE t.post_id = p.id AND t.content_id IN (SELECT id FROM mine))
       ORDER BY ${hotScoreSql('p')} DESC
       LIMIT ${HOME_LIMIT}`,
      [viewer._id],
    )
    personal = rows.map((row) => String(row.id))
  }
  let general = []
  if (personal.length < HOME_LIMIT) {
    const { rows } = await query(
      `SELECT p.id FROM posts p JOIN users u ON u.id = p.user_id
       WHERE u.banned_at IS NULL AND ${recent} AND NOT (p.id = ANY($1::uuid[]))
       ORDER BY ${hotScoreSql('p')} DESC
       LIMIT ${HOME_LIMIT - personal.length}`,
      [personal],
    )
    general = rows.map((row) => String(row.id))
  }
  return { ids: [...personal, ...general], forYou: new Set(personal) }
}

/**
 * Forum highlights for Home. Which posts show is picked once per window and frozen
 * until it ends, so the selection refreshes every few hours rather than on every
 * visit. Like and comment counts and the viewer's own likes are always current;
 * posts deleted (or whose author was banned) since the pick drop out.
 * @param {object | null} viewer
 * @returns {Promise<{ items: object[], personalized: boolean, refreshesAt: Date }>}
 */
export async function getHomeHighlights(viewer) {
  const key = viewer?._id ? String(viewer._id) : 'guest'
  let cached = homeCache.get(key)
  if (!cached || cached.expires <= Date.now()) {
    const refreshesAt = homeWindowEnd()
    cached = { expires: refreshesAt.getTime(), refreshesAt, pick: await pickHomePosts(viewer) }
    if (homeCache.size >= 5000) homeCache.clear()
    homeCache.set(key, cached)
  }

  const { ids, forYou } = cached.pick
  const { rows } = ids.length
    ? await query(
        `SELECT ${postColumns()} FROM posts p JOIN users u ON u.id = p.user_id
         WHERE u.banned_at IS NULL AND p.id = ANY($2::uuid[])`,
        [viewer?._id || null, ids],
      )
    : { rows: [] }
  const byId = new Map(rows.map((row) => [String(row.id), row]))
  const items = ids
    .filter((id) => byId.has(id))
    .map((id) => ({ ...postEntry(byId.get(id), { viewer }), forYou: forYou.has(id) }))
  return {
    items,
    personalized: items.some((item) => item.forYou),
    refreshesAt: cached.refreshesAt,
  }
}

/** Forget cached Home picks (tests). */
export function clearHomeCache() {
  homeCache.clear()
}

export default {
  listPosts,
  getPost,
  createPost,
  updatePost,
  deletePost,
  setPostLike,
  createComment,
  updateComment,
  deleteComment,
  setCommentLike,
  searchTags,
  contentCharacters,
  getHighlights,
  getHomeHighlights,
  validatePostInput,
  validateTags,
  excerptOf,
  homeWindowEnd,
}
