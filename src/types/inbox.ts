/**
 * inbox.ts — profile-menu inbox payloads (`/inbox/*`).
 */

import type { PublicUser } from './social'

export type InboxKind =
  | 'friend_request'
  | 'friend_accepted'
  | 'post_comment'
  | 'comment_reply'
  | 'language_warning'
  | 'announcement'

export interface InboxItem {
  id: string
  kind: InboxKind
  createdAt: string
  read: boolean
  /** Site news. */
  news?: { title: string; body: string }
  actor?: PublicUser | null
  post?: { id: string; title: string } | null
  comment?: { id: string; excerpt: string } | null
  /** Language warnings: masked excerpt, term, count, limit, category, message. */
  detail?: {
    excerpt?: string
    term?: string
    count?: number
    limit?: number
    category?: 'curse' | 'slur'
    message?: string
    surface?: string
  } | null
  /** Friend requests: still open, now friends, or declined/cancelled/expired. */
  requestStatus?: 'pending' | 'accepted' | 'closed'
}

export interface InboxPage {
  items: InboxItem[]
  hasMore: boolean
  /** Unresolved watchlist import clashes (first page only). */
  importClashes: number
}

export interface InboxCounts {
  notifications: number
  news: number
  importClashes: number
  total: number
}
