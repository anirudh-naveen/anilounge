/**
 * social.ts — friends payloads (`/friends/*`).
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
