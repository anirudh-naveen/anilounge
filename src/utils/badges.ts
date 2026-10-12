/**
 * badges.ts — badge registry (frontend copy of backend/src/utils/badges.js).
 *
 * Every badge a user can hold, highest first (the automatic avatar frame is the
 * highest held). `emblem` badges have an avatar frame; emblem-less badges (future
 * ones) only appear in the profile Badges section. `grantable` badges are toggled on the admin page; the
 * Admin toggle sets admin access itself (creator only; never stored as a badge);
 * Mascot (id `bot`) is worn only by the bot accounts (Lounge Keeper, Cleaner, Guide);
 * Supporter is also granted automatically for a Ko-fi donation, and Influencer for 5 forum
 * posts or 10 comments in a week.
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
    id: 'bot',
    label: 'Mascot',
    description: "One of AniLounge's own mascots.",
    emblem: true,
    grantable: false,
  },
  {
    id: 'admin',
    label: 'Admin',
    description: 'Helps run AniLounge.',
    emblem: true,
    grantable: true,
  },
  {
    id: 'developer',
    label: 'Developer',
    description: 'Helps build AniLounge.',
    emblem: true,
    grantable: true,
  },
  {
    id: 'supporter',
    label: 'Supporter',
    description: 'Donates to keep AniLounge running.',
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
    description: 'Shares their thoughts with AniLounge.',
    emblem: true,
    grantable: true,
  },
]

const BY_ID = new Map(BADGES.map((badge) => [badge.id, badge]))

/** Badges admins can grant from the Users tab. */
export const GRANTABLE_BADGES = BADGES.filter((badge) => badge.grantable).map((badge) => badge.id)

/** The plain ring frame every user can wear (`profile_settings.frame`). */
export const USER_FRAME = 'user'

/** Registry entry for a badge id; unknown ids (newer than this build) get a plain entry. */
export const badgeInfo = (id: string): BadgeDef =>
  BY_ID.get(id) ?? { id, label: id, description: '', emblem: false, grantable: false }
