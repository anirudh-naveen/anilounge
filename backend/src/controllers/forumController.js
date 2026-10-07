/**
 * HTTP handlers for the forum: posts, comments, likes, tag search, and highlights.
 *
 * Layer: controller. Reads are public (`optionalAuthenticate` fills `req.user` so
 * likes and edit rights show); writes require auth, are blocked while muted, and are
 * refused for the demo account. Business rules live in `services/forumService.js`.
 * Writes that masked blocked language return the language `warning` beside `data`.
 */

import forumService from '../services/forumService.js'
import { assertNotDemo, sendError } from '../utils/httpError.js'

/**
 * Wrap a handler: run it, send `{ success, ...result }`, map errors.
 * @param {(req: import('express').Request) => Promise<object>} handler - Returns the body fields.
 * @param {string} fallback - 500 message.
 * @param {number} [status]
 * @returns {import('express').RequestHandler}
 */
const handle =
  (handler, fallback, status = 200) =>
  async (req, res) => {
    try {
      res.status(status).json({ success: true, ...(await handler(req)) })
    } catch (error) {
      sendError(res, error, fallback)
    }
  }

/** Same as `handle`, refusing the demo account first. */
const write = (handler, fallback, status) =>
  handle(
    (req) => {
      assertNotDemo(req.user)
      return handler(req)
    },
    fallback,
    status,
  )

/** `GET /forum/posts` — query `tag`, `season`, `episode`, `kind`, `sort`, `page`, `author`. */
export const listPosts = handle(
  async (req) => ({ data: await forumService.listPosts(req.user || null, req.query) }),
  'Error loading posts',
)

/** `GET /forum/posts/:id` — `{ data: { post, comments } }`. */
export const getPost = handle(
  async (req) => ({ data: await forumService.getPost(req.user || null, req.params.id) }),
  'Error loading post',
)

/** `GET /forum/tags?q=` — taggable titles, franchises, and characters. */
export const searchTags = handle(
  async (req) => ({ data: await forumService.searchTags(req.query.q) }),
  'Error searching tags',
)

/** `GET /forum/highlights/:id` — leading posts and highlighted comments for a page. */
export const getHighlights = handle(
  async (req) => ({ data: await forumService.getHighlights(req.user || null, req.params.id) }),
  'Error loading forum highlights',
)

/** `GET /home/forum` — Home's forum highlights (watchlist-based when signed in). */
export const getHomeHighlights = handle(
  async (req) => ({ data: await forumService.getHomeHighlights(req.user || null) }),
  'Error loading forum highlights',
)

/** `POST /forum/posts` — 201 `{ data: post, warning }`. */
export const createPost = write(
  async (req) => {
    const { post, warning } = await forumService.createPost(req.user, req.body || {})
    return { message: 'Posted.', data: post, warning }
  },
  'Error creating post',
  201,
)

/** `PATCH /forum/posts/:id` — `{ data: post, warning }`. */
export const updatePost = write(async (req) => {
  const { post, warning } = await forumService.updatePost(req.user, req.params.id, req.body || {})
  return { message: 'Post updated.', data: post, warning }
}, 'Error updating post')

/** `DELETE /forum/posts/:id`. */
export const deletePost = handle(async (req) => {
  await forumService.deletePost(req.user, req.params.id)
  return { message: 'Post deleted.' }
}, 'Error deleting post')

/** `PUT` / `DELETE /forum/posts/:id/like` — `{ data: { liked, likeCount } }`. */
export const likePost = write(
  async (req) => ({ data: await forumService.setPostLike(req.user, req.params.id, true) }),
  'Error liking post',
)
export const unlikePost = handle(
  async (req) => ({ data: await forumService.setPostLike(req.user, req.params.id, false) }),
  'Error updating like',
)

/** `POST /forum/posts/:id/comments` — body `{ body, parentId? }`; 201 `{ data: comment, warning }`. */
export const createComment = write(
  async (req) => {
    const { comment, warning } = await forumService.createComment(
      req.user,
      req.params.id,
      req.body || {},
    )
    return { data: comment, warning }
  },
  'Error posting comment',
  201,
)

/** `PATCH /forum/comments/:id` — `{ data: comment, warning }`. */
export const updateComment = write(async (req) => {
  const { comment, warning } = await forumService.updateComment(
    req.user,
    req.params.id,
    req.body || {},
  )
  return { data: comment, warning }
}, 'Error updating comment')

/** `DELETE /forum/comments/:id` — `{ data: { removed } }` (false when blanked to keep replies). */
export const deleteComment = handle(
  async (req) => ({ data: await forumService.deleteComment(req.user, req.params.id) }),
  'Error deleting comment',
)

/** `PUT` / `DELETE /forum/comments/:id/like` — `{ data: { liked, likeCount } }`. */
export const likeComment = write(
  async (req) => ({ data: await forumService.setCommentLike(req.user, req.params.id, true) }),
  'Error liking comment',
)
export const unlikeComment = handle(
  async (req) => ({ data: await forumService.setCommentLike(req.user, req.params.id, false) }),
  'Error updating like',
)

export default {
  listPosts,
  getPost,
  searchTags,
  getHighlights,
  getHomeHighlights,
  createPost,
  updatePost,
  deletePost,
  likePost,
  unlikePost,
  createComment,
  updateComment,
  deleteComment,
  likeComment,
  unlikeComment,
}
