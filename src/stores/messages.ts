/**
 * messages.ts — Pinia store for the unread badge on the profile menu's Friends item.
 *
 * Counts unread direct messages plus incoming friend requests (both live in the
 * Friends page). Failures keep the last counts rather than breaking the menu.
 */

import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { messagesAPI } from '@/services/api'
import type { UnreadCounts } from '@/types/social'

export const useMessagesStore = defineStore('messages', () => {
  const counts = ref<UnreadCounts>({ messages: 0, requests: 0 })
  let loading: Promise<void> | null = null

  /** Badge total. */
  const total = computed(() => counts.value.messages + counts.value.requests)

  /** Fetch the counts; concurrent callers share the request. */
  const refresh = (): Promise<void> => {
    if (!loading) {
      loading = messagesAPI
        .unread()
        .then((response) => {
          counts.value = response.data.data as UnreadCounts
        })
        .catch(() => {})
        .finally(() => {
          loading = null
        })
    }
    return loading
  }

  const reset = () => {
    counts.value = { messages: 0, requests: 0 }
  }

  return { counts, total, refresh, reset }
})
