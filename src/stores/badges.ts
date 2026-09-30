/**
 * badges.ts — Pinia store for who holds which badges.
 *
 * Loads the public `/badges` list once so `RoleBadge` (the emblem next to usernames)
 * and the profile Badges section work anywhere without every endpoint returning
 * badges. Failures leave the list empty (no badges) rather than breaking the page.
 */

import { defineStore } from 'pinia'
import { ref } from 'vue'
import { badgesAPI } from '@/services/api'

type Holder = { badges: string[]; featured: string | null; choice: string | null }

/** Reload the list after this long, so badge changes show up without a page reload. */
const STALE_MS = 5 * 60 * 1000

export const useBadgesStore = defineStore('badges', () => {
  const holders = ref<Map<string, Holder>>(new Map())
  let loadedAt = 0
  let loading: Promise<void> | null = null

  /** Fetch the list; concurrent callers share the request. */
  const load = (force = false): Promise<void> => {
    if (!force && loadedAt && Date.now() - loadedAt < STALE_MS) return Promise.resolve()
    if (!loading) {
      loading = badgesAPI
        .list()
        .then((response) => {
          const rows = (response.data?.data || []) as Array<Holder & { username: string }>
          holders.value = new Map(
            rows.map((row) => [
              row.username.toLowerCase(),
              {
                badges: row.badges || [],
                featured: row.featured ?? null,
                choice: row.choice ?? null,
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

  /** The emblem shown next to their name, or null. */
  const featuredFor = (username?: string | null): string | null =>
    holder(username)?.featured ?? null

  /** Their raw pick: a badge id, null (automatic), or 'none'. */
  const choiceFor = (username?: string | null): string | null => holder(username)?.choice ?? null

  return { load, badgesFor, featuredFor, choiceFor }
})
