<!--
  ImportReminder.vue — "import your list" reminder for new accounts (component).

  Shown on Home and Watchlist during an account's first month until the user
  finishes an import (or dismisses it). Points to the import in Settings.
-->
<template>
  <div v-if="visible" class="import-reminder" role="status" data-testid="import-reminder">
    <p>
      <strong>Coming from AniList, MyAnimeList, or TMDB?</strong>
      You can import your list in
      <router-link to="/settings#import">Settings</router-link>.
    </p>
    <button type="button" class="dismiss-btn" aria-label="Dismiss" @click="dismiss">&times;</button>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { useAuthStore } from '@/stores/auth'
import { shouldShowImportReminder } from '@/utils/watchlist'

const authStore = useAuthStore()

const dismissKey = computed(() => `anilounge:import-reminder-dismissed:${authStore.user?.id ?? ''}`)

const readDismissed = (key: string) => {
  try {
    return localStorage.getItem(key) === '1'
  } catch {
    return false
  }
}

const dismissedNow = ref(false)

const visible = computed(
  () =>
    !dismissedNow.value &&
    shouldShowImportReminder(authStore.user) &&
    !readDismissed(dismissKey.value),
)

const dismiss = () => {
  dismissedNow.value = true
  try {
    localStorage.setItem(dismissKey.value, '1')
  } catch {
    // Storage unavailable: it stays hidden until the page reloads.
  }
}
</script>

<style scoped>
.import-reminder {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  margin: 0 auto 1.25rem;
  padding: 0.75rem 0.75rem 0.75rem 1rem;
  border: 1px solid var(--border-hover);
  border-radius: 10px;
  background: var(--bg-hover);
  color: var(--text-primary);
  font-size: 0.95rem;
  text-align: left;
}

.import-reminder p {
  flex: 1;
  margin: 0;
  line-height: 1.45;
}

.import-reminder a {
  color: var(--coral-primary);
  font-weight: 600;
}

.dismiss-btn {
  flex-shrink: 0;
  width: 32px;
  height: 32px;
  border: none;
  border-radius: 50%;
  background: none;
  color: var(--text-secondary);
  font-size: 1.4rem;
  line-height: 1;
  cursor: pointer;
}

.dismiss-btn:hover {
  background: var(--bg-secondary);
  color: var(--text-primary);
}
</style>
