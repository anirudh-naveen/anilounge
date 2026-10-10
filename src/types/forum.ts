/**
 * forum.ts — forum payloads (`/forum/*`, `/home/forum`).
 */

import type { PublicUser } from './social'

export type PostKind = 'discussion' | 'review' | 'guide' | 'article' | 'megathread'
export type PostSort = 'hot' | 'new' | 'top' | 'active'
export type TagKind = 'movie' | 'series' | 'special' | 'franchise' | 'character'

/** What a post is about; `season` + `episode` make it an episode thread. */
export interface PostTag {
  contentId: string
  kind: TagKind
  name: string
  imagePath: string | null
  season: number | null
  episode: number | null
  /** The author's top tag: highlighted, and its picture is the post's image. */
  top?: boolean
  /** Franchises only: the poster of its first title, used when it's a post's only tag. */
  coverPath?: string | null
}

export interface ForumPost {
  id: string
  kind: PostKind
  title: string
  /** Full text on the post page. */
  body?: string
  /** Preview in lists. */
  excerpt?: string
  /** Reviews only, 1–10: the author's current watchlist rating for `subjectId`. */
  score: number | null
  /** Reviews only: the title being reviewed. */
  subjectId: string | null
  spoiler: boolean
  createdAt: string
  editedAt: string | null
  lastActivityAt: string
  author: PublicUser
  likeCount: number
  commentCount: number
  liked: boolean
  tags: PostTag[]
  canEdit: boolean
  canDelete: boolean
  /** Home only: picked from the viewer's watchlist. */
  forYou?: boolean
}

export interface ForumComment {
  id: string
  postId: string
  /** Top-level comment this replies to. */
  parentId: string | null
  body: string
  /** Deleted but kept because it has replies. */
  deleted: boolean
  createdAt: string
  editedAt: string | null
  author: PublicUser | null
  likeCount: number
  liked: boolean
  canEdit: boolean
  canDelete: boolean
  /** Highlights only. */
  postTitle?: string
}

export interface PostPage {
  items: ForumPost[]
  page: number
  pageSize: number
  total: number
  tag: Omit<PostTag, 'season' | 'episode'> | null
  sort: PostSort
}

export interface TagSearchHit {
  contentId: string
  kind: TagKind
  name: string
  imagePath: string | null
  seasonCount: number | null
  episodeCount: number | null
  year: number | null
}

export interface ForumHighlights {
  posts: ForumPost[]
  comments: ForumComment[]
  total: number
  franchise: { contentId: string; name: string } | null
}

export interface HomeForum {
  items: ForumPost[]
  personalized: boolean
  refreshesAt: string
}

/** Body of a new or edited post. */
export interface PostInput {
  kind?: PostKind
  title?: string
  body?: string
  score?: number
  spoiler?: boolean
  tags?: Array<{
    contentId: string
    season?: number | null
    episode?: number | null
    top?: boolean
  }>
}

/** A character offered under a title in the tag picker. */
export interface CharacterHit {
  contentId: string
  kind: 'character'
  name: string
  imagePath: string | null
  role: string
}
