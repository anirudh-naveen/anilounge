<!--
  Import.vue — watchlist import view.

  Bring a list over from AniList, MyAnimeList, or TMDB (WatchlistImport).
  Disabled for the shared demo account.
-->
<template>
  <div class="import-page">
    <div class="container">
      <!-- Page Header -->
      <div class="page-header">
        <h1>Import</h1>
        <p>Bring your list from AniList, MyAnimeList, or TMDB, with all the data preserved</p>
      </div>

      <!-- Title: Watchlist Import -->
      <div class="import-card">
        <p v-if="authStore.isDemoUser" class="demo-restriction">
          Importing is disabled for the demo account.
        </p>
        <WatchlistImport v-else @imported="onImported" />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useAuthStore } from '@/stores/auth'
import { useContentStore } from '@/stores/content'
import WatchlistImport from '@/components/WatchlistImport.vue'

// Component name for Vue devtools
defineOptions({
  name: 'ImportPage',
})

const authStore = useAuthStore()

const onImported = async () => {
  if (authStore.user) authStore.user.watchlistImportedAt = new Date().toISOString()
  await useContentStore().loadWatchlist(true)
}
</script>

<style scoped>
.import-page {
  padding: 2rem 0;
  min-height: calc(100vh - 140px);
}

.container {
  max-width: 900px;
  margin: 0 auto;
  padding: 0 1rem;
}

.page-header {
  text-align: center;
  margin-bottom: 3rem;
}

.page-header h1 {
  font-family: var(--font-display);
  font-size: 2.5rem;
  font-weight: 650;
  color: var(--text-primary);
  margin-bottom: 0.5rem;
  letter-spacing: -0.03em;
}

.page-header p {
  font-size: 1.1rem;
  color: var(--text-secondary);
}

.import-card {
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: 12px;
  padding: 2rem;
  box-shadow: var(--shadow-sm);
}

.demo-restriction {
  color: var(--text-secondary);
  margin: 0;
}

@media (max-width: 768px) {
  .page-header h1 {
    font-size: 2rem;
  }

  .import-card {
    padding: 1.25rem;
  }
}
</style>
