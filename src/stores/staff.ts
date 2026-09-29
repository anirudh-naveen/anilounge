/**
 * staff.ts — Pinia store for staff accounts (creator and admins).
 *
 * Loads the public `/staff` list once so `RoleBadge` can mark usernames anywhere
 * on the site without every endpoint returning roles. Failures leave the list empty
 * (no badges) rather than breaking the page.
 */

import { defineStore } from 'pinia'
import { ref } from 'vue'
import { staffAPI } from '@/services/api'

export type StaffRole = 'creator' | 'admin'

/** Reload the list after this long, so role changes show up without a page reload. */
const STALE_MS = 5 * 60 * 1000

export const useStaffStore = defineStore('staff', () => {
  const roles = ref<Map<string, StaffRole>>(new Map())
  let loadedAt = 0
  let loading: Promise<void> | null = null

  /** Fetch the staff list; concurrent callers share the request. */
  const load = (force = false): Promise<void> => {
    if (!force && loadedAt && Date.now() - loadedAt < STALE_MS) return Promise.resolve()
    if (!loading) {
      loading = staffAPI
        .list()
        .then((response) => {
          const rows = (response.data?.data || []) as Array<{ username: string; role: StaffRole }>
          roles.value = new Map(rows.map((row) => [row.username.toLowerCase(), row.role]))
          loadedAt = Date.now()
        })
        .catch(() => {})
        .finally(() => {
          loading = null
        })
    }
    return loading
  }

  /** Staff role for a username, or null for regular users. */
  const roleFor = (username?: string | null): StaffRole | null =>
    (username && roles.value.get(username.toLowerCase())) || null

  return { load, roleFor }
})
