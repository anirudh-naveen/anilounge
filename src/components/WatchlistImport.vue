<!--
  WatchlistImport.vue — import a list from AniList, MyAnimeList, or TMDB (component).

  Modal opened from the Watchlist page. Starts a background import on the backend
  and polls it until it finishes; closing the modal leaves the import running and
  reopening it picks the progress back up. TMDB needs the user to approve access on
  themoviedb.org, which sends them back to /watchlist with `request_token`.
-->
<template>
  <div class="import-overlay" @click="emit('close')">
    <div
      class="import-modal"
      role="dialog"
      aria-modal="true"
      aria-labelledby="watchlist-import-title"
      data-testid="watchlist-import"
      @click.stop
    >
      <div class="import-header">
        <h2 id="watchlist-import-title">Import your list</h2>
        <button type="button" class="close-btn" aria-label="Close" @click="emit('close')">
          &times;
        </button>
      </div>

      <!-- Title: Running -->
      <div v-if="job?.state === 'running'" class="import-progress" aria-live="polite">
        <div class="spinner"></div>
        <p>{{ phaseLabel }}</p>
        <p class="hint">You can close this window; the import keeps going.</p>
      </div>

      <!-- Title: Finished -->
      <div v-else-if="job?.state === 'done' && job.result && !restarting" class="import-result">
        <p class="result-lead">
          Imported {{ job.result.matched }} of {{ job.result.total }} entries from
          {{ sourceLabel(job.source) }}.
        </p>
        <ul class="result-stats">
          <li>
            <strong>{{ job.result.added }}</strong> added to your watchlist
          </li>
          <li v-if="job.result.updated">
            <strong>{{ job.result.updated }}</strong> already there and updated
          </li>
          <li v-if="job.result.unchanged">
            <strong>{{ job.result.unchanged }}</strong> already there and left as they were
          </li>
          <li v-if="job.result.rated">
            <strong>{{ job.result.rated }}</strong> ratings saved
          </li>
          <li v-if="job.result.catalogAdded">
            <strong>{{ job.result.catalogAdded }}</strong> titles added to AniLounge
          </li>
        </ul>
        <details v-if="job.result.notFound" class="not-found">
          <summary>
            {{ job.result.notFound }} not on AniLounge
            <span v-if="job.source === 'tmdb'"> (AniLounge only lists animation)</span>
          </summary>
          <ul>
            <li v-for="title in job.result.notFoundTitles" :key="title">{{ title }}</li>
            <li v-if="job.result.notFound > job.result.notFoundTitles.length" class="hint">
              and {{ job.result.notFound - job.result.notFoundTitles.length }} more
            </li>
          </ul>
        </details>
        <div class="import-actions">
          <button type="button" class="btn btn-secondary" @click="restarting = true">
            Import another list
          </button>
          <button type="button" class="btn btn-primary" @click="emit('close')">Done</button>
        </div>
      </div>

      <!-- Title: Form -->
      <form v-else class="import-form" @submit.prevent="startImport">
        <p v-if="job?.state === 'failed' && !restarting" class="import-error" role="alert">
          {{ job.error }}
        </p>
        <p v-if="errorMessage" class="import-error" role="alert">{{ errorMessage }}</p>

        <div class="source-tabs" role="tablist">
          <button
            v-for="tab in SOURCE_TABS"
            :key="tab.value"
            type="button"
            role="tab"
            class="source-tab"
            :class="{ active: tab.value === sourceTab }"
            :aria-selected="tab.value === sourceTab"
            @click="sourceTab = tab.value"
          >
            {{ tab.label }}
          </button>
        </div>

        <div v-if="sourceTab === 'anilist'" class="source-panel">
          <label for="import-anilist-user">AniList username</label>
          <input
            id="import-anilist-user"
            v-model.trim="username"
            class="form-control"
            autocomplete="off"
            placeholder="e.g. Josh"
            required
          />
          <p class="hint">Your list must be public. Paused lists come in as On Hold.</p>
        </div>

        <div v-else-if="sourceTab === 'mal'" class="source-panel">
          <div class="mal-modes">
            <label><input v-model="malMode" type="radio" value="username" /> Username</label>
            <label><input v-model="malMode" type="radio" value="file" /> Export file</label>
          </div>
          <template v-if="malMode === 'username'">
            <label for="import-mal-user">MyAnimeList username</label>
            <input
              id="import-mal-user"
              v-model.trim="username"
              class="form-control"
              autocomplete="off"
              required
            />
            <p class="hint">Your list must be public. Private list? Use the export file.</p>
          </template>
          <template v-else>
            <label for="import-mal-file">MyAnimeList export (.xml or .xml.gz)</label>
            <input
              id="import-mal-file"
              type="file"
              accept=".xml,.gz,application/xml,text/xml,application/gzip"
              class="form-control"
              required
              @change="onFileChosen"
            />
            <p class="hint">
              On MyAnimeList, open
              <a href="https://myanimelist.net/panel.php?go=export" target="_blank" rel="noopener"
                >Export</a
              >, choose Anime List, and upload the file it downloads.
            </p>
          </template>
        </div>

        <div v-else class="source-panel">
          <p>
            You'll be sent to TMDB to approve read access, then brought back here. AniLounge reads
            your watchlist and ratings once and doesn't keep the access.
          </p>
          <p class="hint">
            Rated titles come in as Completed with your rating; watchlist titles as Planned. Only
            animated titles on AniLounge can be matched.
          </p>
        </div>

        <fieldset class="import-options">
          <label>
            <input v-model="overwrite" type="checkbox" />
            Replace titles already on my watchlist with the imported status, progress, and rating
          </label>
          <label v-if="sourceTab !== 'tmdb'">
            <input v-model="addMissing" type="checkbox" />
            Add anime AniLounge doesn't have yet (up to 60 per import; slower)
          </label>
        </fieldset>

        <div class="import-actions">
          <button type="button" class="btn btn-secondary" @click="emit('close')">Cancel</button>
          <button type="submit" class="btn btn-primary" :disabled="isSubmitting">
            {{ sourceTab === 'tmdb' ? 'Continue to TMDB' : 'Import' }}
          </button>
        </div>
      </form>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { watchlistImportAPI } from '@/services/api'
import type { WatchlistImportJob, WatchlistImportRequest, WatchlistImportSource } from '@/types'

const emit = defineEmits<{ close: []; imported: [] }>()

const route = useRoute()
const router = useRouter()

type SourceTab = 'anilist' | 'mal' | 'tmdb'

const SOURCE_TABS: { value: SourceTab; label: string }[] = [
  { value: 'anilist', label: 'AniList' },
  { value: 'mal', label: 'MyAnimeList' },
  { value: 'tmdb', label: 'TMDB' },
]

/** Options kept across the TMDB round trip. */
const TMDB_OPTIONS_KEY = 'anilounge:tmdb-import-options'
const POLL_MS = 1500

const sourceTab = ref<SourceTab>('anilist')
const malMode = ref<'username' | 'file'>('username')
const username = ref('')
const file = ref<File | null>(null)
const overwrite = ref(false)
const addMissing = ref(true)
const isSubmitting = ref(false)
const errorMessage = ref('')
const restarting = ref(false)
const job = ref<WatchlistImportJob | null>(null)
let pollTimer: ReturnType<typeof setTimeout> | null = null

const sourceLabel = (source: WatchlistImportSource) =>
  ({ anilist: 'AniList', mal: 'MyAnimeList', mal_file: 'MyAnimeList', tmdb: 'TMDB' })[source]

const phaseLabel = computed(() => {
  const current = job.value
  if (!current) return ''
  const from = sourceLabel(current.source)
  switch (current.phase) {
    case 'matching':
      return `Matching ${current.total} entries to AniLounge titles…`
    case 'adding':
      return `Adding missing anime to AniLounge (${current.done} of ${current.total})…`
    case 'saving':
      return 'Saving to your watchlist…'
    default:
      return `Reading your ${from} list…`
  }
})

/** Message from an axios error response, or a fallback. */
const messageFrom = (error: unknown, fallback: string) => {
  const data = (error as { response?: { data?: { message?: string } } })?.response?.data
  return data?.message || fallback
}

const stopPolling = () => {
  if (pollTimer) clearTimeout(pollTimer)
  pollTimer = null
}

const poll = async () => {
  stopPolling()
  try {
    const response = await watchlistImportAPI.status()
    const previous = job.value?.state
    job.value = response.data.data
    if (job.value?.state === 'running') {
      pollTimer = setTimeout(poll, POLL_MS)
    } else if (previous === 'running' && job.value?.state === 'done') {
      emit('imported')
    }
  } catch {
    pollTimer = setTimeout(poll, POLL_MS * 2)
  }
}

const begin = async (request: WatchlistImportRequest) => {
  isSubmitting.value = true
  errorMessage.value = ''
  try {
    const response = await watchlistImportAPI.start(request)
    job.value = response.data.data
    restarting.value = false
    pollTimer = setTimeout(poll, POLL_MS)
  } catch (error) {
    errorMessage.value = messageFrom(error, 'Could not start the import. Try again.')
  } finally {
    isSubmitting.value = false
  }
}

const onFileChosen = (event: Event) => {
  file.value = (event.target as HTMLInputElement).files?.[0] || null
}

/** Base64 of a binary file, in chunks so large exports don't overflow the call stack. */
const toBase64 = async (blob: Blob) => {
  const bytes = new Uint8Array(await blob.arrayBuffer())
  let binary = ''
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  }
  return btoa(binary)
}

const startTmdb = async () => {
  isSubmitting.value = true
  errorMessage.value = ''
  try {
    try {
      sessionStorage.setItem(TMDB_OPTIONS_KEY, JSON.stringify({ overwrite: overwrite.value }))
    } catch {
      // Storage unavailable: the import falls back to the default options.
    }
    const redirectTo = `${window.location.origin}/watchlist?import=tmdb`
    const response = await watchlistImportAPI.tmdbToken(redirectTo)
    window.location.assign(response.data.data.authorizeUrl)
  } catch (error) {
    errorMessage.value = messageFrom(error, 'Could not reach TMDB. Try again.')
    isSubmitting.value = false
  }
}

const startImport = async () => {
  const options = { overwrite: overwrite.value, addMissing: addMissing.value }
  if (sourceTab.value === 'tmdb') return startTmdb()
  if (sourceTab.value === 'mal' && malMode.value === 'file') {
    if (!file.value) {
      errorMessage.value = 'Choose your MyAnimeList export file.'
      return
    }
    const isGzip = /\.gz$/i.test(file.value.name)
    const payload = isGzip
      ? { gzipBase64: await toBase64(file.value) }
      : { xml: await file.value.text() }
    return begin({ source: 'mal_file', file: payload, ...options })
  }
  return begin({ source: sourceTab.value, username: username.value, ...options })
}

/** Finish a TMDB import when TMDB has sent the user back here. */
const resumeTmdb = async () => {
  const { request_token: token, approved, denied } = route.query
  if (!token && !denied) return false
  router.replace({ query: {} })
  sourceTab.value = 'tmdb'
  if (denied || approved !== 'true' || typeof token !== 'string') {
    errorMessage.value = 'TMDB access was not approved, so nothing was imported.'
    return true
  }
  let saved: { overwrite?: boolean } = {}
  try {
    saved = JSON.parse(sessionStorage.getItem(TMDB_OPTIONS_KEY) || '{}')
    sessionStorage.removeItem(TMDB_OPTIONS_KEY)
  } catch {
    saved = {}
  }
  overwrite.value = saved.overwrite === true
  await begin({ source: 'tmdb', requestToken: token, overwrite: overwrite.value })
  return true
}

onMounted(async () => {
  if (await resumeTmdb()) return
  await poll()
})

onUnmounted(stopPolling)
</script>

<style scoped>
.import-overlay {
  position: fixed;
  inset: 0;
  z-index: 1100;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 1rem;
  background: rgba(0, 0, 0, 0.6);
}

.import-modal {
  width: 100%;
  max-width: 560px;
  max-height: 90vh;
  overflow-y: auto;
  padding: 1.75rem;
  border-radius: 12px;
  background: var(--bg-card);
  color: var(--text-primary);
  text-align: left;
}

.import-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 1.25rem;
}

.import-header h2 {
  margin: 0;
  font-family: var(--font-display);
  font-size: 1.5rem;
}

.close-btn {
  width: 40px;
  height: 40px;
  border: none;
  border-radius: 50%;
  background: none;
  color: var(--text-primary);
  font-size: 2rem;
  line-height: 1;
  cursor: pointer;
}

.close-btn:hover {
  background: var(--bg-hover);
}

.import-form,
.source-panel,
.import-options {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.source-tabs {
  display: flex;
  gap: 0.25rem;
  padding: 0.25rem;
  border-radius: 10px;
  background: var(--bg-secondary);
}

.source-tab {
  flex: 1;
  padding: 0.6rem 0.5rem;
  border: none;
  border-radius: 8px;
  background: none;
  color: var(--text-secondary);
  font-weight: 500;
  cursor: pointer;
}

.source-tab.active {
  background: var(--bg-card);
  color: var(--text-primary);
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.12);
}

.source-panel label,
.import-options label,
.mal-modes label {
  font-weight: 500;
  font-size: 0.9rem;
}

.mal-modes {
  display: flex;
  gap: 1.25rem;
}

.form-control {
  padding: 0.7rem;
  border: 1px solid var(--border-color);
  border-radius: 8px;
  background: var(--bg-card);
  color: var(--text-primary);
  font-size: 0.95rem;
}

.form-control:focus {
  outline: none;
  border-color: var(--highlight-color);
}

.import-options {
  margin: 0.5rem 0 0;
  padding: 0.75rem 0 0;
  border: none;
  border-top: 1px solid var(--border-color);
}

.import-options label {
  display: flex;
  gap: 0.5rem;
  align-items: flex-start;
  font-weight: 400;
}

.import-options input {
  margin-top: 0.2rem;
}

.hint {
  margin: 0;
  color: var(--text-muted);
  font-size: 0.85rem;
}

.hint a {
  color: var(--highlight-color);
}

.import-error {
  margin: 0;
  padding: 0.75rem;
  border-radius: 8px;
  background: rgba(244, 67, 54, 0.1);
  color: var(--error-color);
  font-size: 0.9rem;
}

.import-actions {
  display: flex;
  justify-content: flex-end;
  gap: 0.75rem;
  margin-top: 1rem;
}

.import-progress {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.75rem;
  padding: 1.5rem 0;
  text-align: center;
}

.spinner {
  width: 36px;
  height: 36px;
  border: 3px solid var(--border-color);
  border-top-color: var(--highlight-color);
  border-radius: 50%;
  animation: spin 0.9s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

.result-lead {
  margin: 0 0 0.75rem;
  font-weight: 500;
}

.result-stats {
  margin: 0 0 1rem;
  padding-left: 1.25rem;
  line-height: 1.7;
}

.not-found summary {
  cursor: pointer;
  color: var(--text-secondary);
}

.not-found ul {
  max-height: 200px;
  overflow-y: auto;
  margin: 0.5rem 0 0;
  padding-left: 1.25rem;
  font-size: 0.9rem;
}
</style>
