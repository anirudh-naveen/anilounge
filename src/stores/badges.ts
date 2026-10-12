/**
 * badges.ts — Pinia store for who holds which badges.
 *
 * Loads the public `/badges` list once so `UserAvatar` frames and the profile Badges
 * section work anywhere without every endpoint returning badges. It lists badge holders
 * and anyone who picked an accent, with each one's frame and accent; everyone else wears
 * the default User ring. Failures leave the list empty rather than breaking the page.
 */

import { defineStore } from 'pinia'
import { ref } from 'vue'
import { badgesAPI } from '@/services/api'
import { USER_FRAME } from '@/utils/badges'
import type { ProfileAccent } from '@/types/profile'

type Holder = {
  badges: string[]
  frame: string
  accent: ProfileAccent | null
}

/** Reload the list after this long, so badge changes show up without a page reload. */
const STALE_MS = 5 * 60 * 1000

export const useBadgesStore = defineStore('badges', () => {
  const holders = ref<Map<string, Holder>>(new Map())
  let loadedAt = 0
  let loading: Promise<void> | null = null

  /** Fetch the list; concurrent callers share the request. */
  const load = (force = false): Promise<void> => {
    if (!force && loadedAt && Date.now() - loadedAt < STALE_MS) return Promise.resolve()
    // A forced reload (after the user changed something) must not reuse a fetch that
    // started before the change.
    if (force && loading) return loading.then(() => load(true))
    if (!loading) {
      loading = badgesAPI
        .list(force)
        .then((response) => {
          const rows = (response.data?.data || []) as Array<Holder & { username: string }>
          holders.value = new Map(
            rows.map((row) => [
              row.username.toLowerCase(),
              {
                badges: row.badges || [],
                frame: row.frame || USER_FRAME,
                accent: row.accent ?? null,
              },
            ]),
          )
          loadedAt = Date.now()
        })
        .catch(() => {})
        .finally(() => {
          loading = null
        })
    }
    return loading
  }

  const holder = (username?: string | null) =>
    (username && holders.value.get(username.toLowerCase())) || null

  /** Every badge a user holds, in registry order. */
  const badgesFor = (username?: string | null): string[] => holder(username)?.badges || []

  /** Their avatar frame: a badge id, or the User ring for everyone not listed. */
  const frameFor = (username?: string | null): string => holder(username)?.frame ?? USER_FRAME

  /** Their profile accent (tints their avatar frame), or null when never picked. */
  const accentFor = (username?: string | null): ProfileAccent | null =>
    holder(username)?.accent ?? null

  return { load, badgesFor, frameFor, accentFor }
})
