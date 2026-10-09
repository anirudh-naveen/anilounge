/**
 * badges.ts — badge registry (frontend copy of backend/src/utils/badges.js).
 *
 * Every badge a user can hold, in display order. `emblem` badges can be chosen as
 * the one emblem next to a username; emblem-less badges (future ones) only appear in
 * the profile Badges section. `grantable` badges are handed out on the admin page;
 * Supporter is also granted automatically for a Ko-fi donation.
 */

export interface BadgeDef {
  id: string
  label: string
  description: string
  emblem: boolean
  grantable: boolean
}

export const BADGES: BadgeDef[] = [
  {
    id: 'creator',
    label: 'Creator',
    description: 'Created AniLounge.',
    emblem: true,
    grantable: false,
  },
  {
    id: 'admin',
    label: 'Admin',
    description: 'Helps run AniLounge.',
    emblem: true,
    grantable: false,
  },
  {
    id: 'developer',
    label: 'Developer',
    description: 'Builds AniLounge.',
    emblem: true,
    grantable: true,
  },
  {
    id: 'artist',
    label: 'Artist',
    description: 'Makes art for AniLounge.',
    emblem: true,
    grantable: true,
  },
  {
    id: 'influencer',
    label: 'Influencer',
    description: 'Shares AniLounge with the world.',
    emblem: true,
    grantable: true,
  },
  {
    id: 'supporter',
    label: 'Supporter',
    description: 'Donated to keep AniLounge running.',
    emblem: true,
    grantable: true,
  },
]

const BY_ID = new Map(BADGES.map((badge) => [badge.id, badge]))

/** Badges admins can grant from the Users tab. */
export const GRANTABLE_BADGES = BADGES.filter((badge) => badge.grantable).map((badge) => badge.id)

/** `featured_badge` value meaning "show no emblem". */
export const NO_EMBLEM = 'none'

/** Registry entry for a badge id; unknown ids (newer than this build) get a plain entry. */
export const badgeInfo = (id: string): BadgeDef =>
  BY_ID.get(id) ?? { id, label: id, description: '', emblem: false, grantable: false }
