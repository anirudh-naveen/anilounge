/**
 * inbox.ts — Pinia store for the profile menu's Inbox badge.
 *
 * Counts unread notifications and site news plus unresolved import clashes.
 * Failures keep the last counts rather than breaking the menu.
 */

import { defineStore } from 'pinia'
import { ref } from 'vue'
import { inboxAPI } from '@/services/api'
import type { InboxCounts } from '@/types/inbox'

const EMPTY: InboxCounts = { notifications: 0, news: 0, importClashes: 0, total: 0 }

export const useInboxStore = defineStore('inbox', () => {
  const counts = ref<InboxCounts>({ ...EMPTY })
  let loading: Promise<void> | null = null

  /** Fetch the counts; concurrent callers share the request. */
  const refresh = (): Promise<void> => {
    if (!loading) {
      loading = inboxAPI
        .unread()
        .then((response) => {
          counts.value = response.data.data as InboxCounts
        })
        .catch(() => {})
        .finally(() => {
          loading = null
        })
    }
    return loading
  }

  /** Take counts a mark-read call returned. */
  const set = (next: InboxCounts) => {
    counts.value = next
  }

  const reset = () => {
    counts.value = { ...EMPTY }
  }

  return { counts, refresh, set, reset }
})
