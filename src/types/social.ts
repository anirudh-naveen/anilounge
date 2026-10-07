/**
 * social.ts — friends and direct-message payloads (`/friends/*`, `/messages/*`).
 */

export interface PublicUser {
  id: string
  username: string
  profilePicture: string | null
}

/** The viewer's side of a link with another user. */
export type Relationship = 'friends' | 'outgoing' | 'incoming' | 'none'

export interface FriendEntry {
  user: PublicUser
  since: string
}

export interface FriendRequest {
  user: PublicUser
  /** Optional note sent with the request. */
  message: string
  at: string
  /** Unanswered requests are removed a week after they are sent. */
  expiresAt: string
}

export interface FriendsPayload {
  friends: FriendEntry[]
  incoming: FriendRequest[]
  outgoing: FriendRequest[]
}

export interface UserSearchHit extends PublicUser {
  relationship: Relationship
}

/** One direct message, from the viewer's side (`/messages/*`). */
export interface DirectMessage {
  id: string
  body: string
  at: string
  fromMe: boolean
  readAt: string | null
}

export interface ConversationSummary {
  user: PublicUser
  lastMessage: { body: string; at: string; fromMe: boolean }
  unread: number
  /** False once the two are no longer friends; history stays readable. */
  canMessage: boolean
}

export interface ConversationsPayload {
  conversations: ConversationSummary[]
  /** Incoming friend requests, shown so their notes read like opening messages. */
  requests: FriendRequest[]
}

export interface MessageThread {
  user: PublicUser
  relationship: Relationship
  canMessage: boolean
  /** Open friend request between the two, either direction. */
  request: { message: string; at: string; expiresAt: string; fromMe: boolean } | null
  messages: DirectMessage[]
  /** More, older messages exist (page back with `before`). */
  hasMore: boolean
}

export interface UnreadCounts {
  messages: number
  requests: number
}
