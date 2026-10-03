<!--
  WatchlistImport.vue — import lists from AniList, MyAnimeList, and TMDB (component).

  Two cards in Settings → Import. Anime lists: type the AniList/MyAnimeList usernames
  and one Import runs them in order as a background job this form polls. TMDB: needs
  approval on themoviedb.org first, so it has its own Connect button that opens the
  approval page in a new tab. When TMDB sends that tab back to /settings it hands the
  `request_token` to this tab over a BroadcastChannel and closes; if no tab answers
  (or the popup was blocked and the approval ran in this tab) it imports itself.
  Titles the sites disagree on are listed below for the user to pick a version
  (ImportConflicts).
-->
<template>
  <div class="watchlist-import" data-testid="watchlist-import">
    <!-- Title: Running -->
    <div v-if="job?.state === 'running'" class="import-progress" aria-live="polite">
      <div class="spinner"></div>
      <div>
        <p>{{ phaseLabel }}</p>
        <p v-if="connectionLost" class="import-error" role="alert">
          Can't reach the server. Still retrying; if this doesn't clear up, the server may have
          stopped and the import with it.
        </p>
        <p v-else-if="stalled" class="hint">
          This step is taking longer than usual (AniList and MyAnimeList limit how fast we can ask
          for titles). It will move on by itself.
        </p>
        <p class="hint">You can leave this page; the import will continue in the background.</p>
      </div>
    </div>

    <!-- Title: Handed Off -->
    <div v-else-if="handedOff" class="import-card" aria-live="polite">
      <p class="result-lead">TMDB is connected. Your import is running in your other tab.</p>
      <p class="hint">You can close this tab.</p>
    </div>

    <template v-else>
      <p v-if="errorMessage" class="import-error" role="alert">{{ errorMessage }}</p>

      <!-- Title: Anime Lists -->
      <form class="import-card" @submit.prevent="startImport">
        <div class="card-head">
          <h4>AniList &amp; MyAnimeList</h4>
          <p class="hint">Fill in either or both; AniList is imported first.</p>
        </div>

        <label class="field">
          <span class="field-label">AniList username</span>
          <input
            v-model.trim="anilistUser"
            class="form-input"
            autocomplete="off"
            placeholder="Leave empty to skip"
            data-testid="import-anilist-user"
          />
        </label>

        <div class="field">
          <label v-if="malMode === 'username'" class="field">
            <span class="field-label">MyAnimeList username</span>
            <input
              v-model.trim="malUser"
              class="form-input"
              autocomplete="off"
              placeholder="Leave empty to skip"
              data-testid="import-mal-user"
            />
          </label>
          <label v-else class="field">
            <span class="field-label">MyAnimeList export (.xml or .xml.gz)</span>
            <input
              type="file"
              accept=".xml,.gz,application/xml,text/xml,application/gzip"
              class="form-input"
              data-testid="import-mal-file"
              @change="onFileChosen"
            />
            <span class="hint">
              On MyAnimeList open
              <a href="https://myanimelist.net/panel.php?go=export" target="_blank" rel="noopener"
                >Export</a
              >, choose Anime List, and upload the file it downloads.
            </span>
          </label>
          <button type="button" class="link-btn" @click="toggleMalMode">
            {{
              malMode === 'username'
                ? 'Private list? Upload your MAL export file instead'
                : 'Use a username instead'
            }}
          </button>
        </div>

        <label class="check">
          <input v-model="addMissing" type="checkbox" />
          <span>
            Add anime AniLounge doesn't have yet
            <span class="hint">Up to 60 per import; makes the import slower.</span>
          </span>
        </label>

        <div class="import-actions">
          <button type="submit" class="import-btn" :disabled="!canSubmit || isSubmitting">
            Import
          </button>
        </div>
      </form>

      <!-- Title: TMDB -->
      <div class="import-card" data-testid="import-tmdb-card">
        <div class="card-head">
          <h4>TMDB</h4>
          <p class="hint">
            Imports your TMDB watchlist and ratings. TMDB asks you to approve read access first, on
            their site in a new tab.
          </p>
        </div>

        <div v-if="tmdbPending" class="tmdb-waiting" aria-live="polite">
          <div class="spinner small"></div>
          <div>
            <p>Waiting for you to approve AniLounge on TMDB…</p>
            <p class="hint">
              The import starts here on its own once you approve.
              <a :href="tmdbPending.authorizeUrl" target="_blank" rel="noopener">Reopen TMDB</a>
            </p>
            <div class="import-actions">
              <button
                type="button"
                class="import-btn secondary"
                :disabled="isSubmitting"
                data-testid="import-tmdb-approved"
                @click="finishTmdb(tmdbPending.requestToken)"
              >
                I've approved it
              </button>
              <button type="button" class="link-btn" @click="cancelTmdb">Cancel</button>
            </div>
          </div>
        </div>
        <div v-else class="import-actions">
          <button
            type="button"
            class="import-btn"
            :disabled="isSubmitting"
            data-testid="import-tmdb"
            @click="connectTmdb"
          >
            Connect TMDB
            <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
                d="M14 5h5v5M19 5l-8 8M17 14v4a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V8a1 1 0 0 1 1-1h4"
              />
            </svg>
          </button>
        </div>
      </div>
    </template>

    <!-- Title: Last Result -->
    <div v-if="job?.state === 'done' && job.result" class="import-result" aria-live="polite">
      <p class="result-lead">
        Imported {{ job.result.matched }} of {{ job.result.total }} entries from
        {{ job.sources.map(sourceLabel).join(', ') }}: {{ job.result.added }} added<template
          v-if="job.result.unchanged"
          >, {{ job.result.unchanged }} already matched</template
        ><template v-if="job.result.conflicts"
          >, {{ job.result.conflicts }} to review below</template
        >.
      </p>
      <p v-for="failed in failedSources" :key="failed.source" class="import-error">
        {{ sourceLabel(failed.source) }}: {{ failed.error }}
      </p>
      <p v-if="job.result.catalogAdded || job.result.catalogLinked" class="hint">
        {{ job.result.catalogAdded }} new titles added to AniLounge<template
          v-if="job.result.catalogLinked"
          >, {{ job.result.catalogLinked }} linked to AniList</template
        >.
      </p>
      <details v-if="job.result.notFound" class="not-found">
        <summary>{{ job.result.notFound }} not on AniLounge</summary>
        <ul>
          <li v-for="title in job.result.notFoundTitles" :key="title">{{ title }}</li>
          <li v-if="job.result.notFound > job.result.notFoundTitles.length" class="hint">
            and {{ job.result.notFound - job.result.notFoundTitles.length }} more
          </li>
        </ul>
      </details>
    </div>
    <p v-else-if="job?.state === 'failed'" class="import-error" role="alert">{{ job.error }}</p>

    <ImportConflicts ref="conflictsPanel" @resolved="emit('imported')" />
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { watchlistImportAPI } from '@/services/api'
import ImportConflicts from '@/components/ImportConflicts.vue'
import type {
  WatchlistImportJob,
  WatchlistImportSource,
  WatchlistImportSourceRequest,
} from '@/types'

const emit = defineEmits<{ imported: [] }>()

const route = useRoute()
const router = useRouter()

/** Carries TMDB's approval from the tab TMDB returns to back to the tab that asked. */
const TMDB_CHANNEL = 'anilounge:tmdb-approval'
/** How long the returning tab waits for the asking tab to take over before importing itself. */
const HANDOFF_MS = 1500
const POLL_MS = 1500
/** Failed status checks in a row before the form says the server is unreachable. */
const MAX_POLL_FAILURES = 4
/** No progress for this long reads as a slow step. */
const STALL_MS = 60 * 1000

const anilistUser = ref('')
const malUser = ref('')
const malMode = ref<'username' | 'file'>('username')
const malFile = ref<File | null>(null)
const addMissing = ref(true)
const tmdbPending = ref<{ requestToken: string; authorizeUrl: string } | null>(null)
const handedOff = ref(false)
const isSubmitting = ref(false)
const errorMessage = ref('')
const job = ref<WatchlistImportJob | null>(null)
const connectionLost = ref(false)
const stalled = ref(false)
const conflictsPanel = ref<InstanceType<typeof ImportConflicts> | null>(null)
let pollTimer: ReturnType<typeof setTimeout> | null = null
let pollFailures = 0
let progressKey = ''
let progressAt = 0
let channel: BroadcastChannel | null = null

const sourceLabel = (source: WatchlistImportSource) =>
  ({ anilist: 'AniList', mal: 'MyAnimeList', mal_file: 'MyAnimeList', tmdb: 'TMDB' })[source]

const canSubmit = computed(
  () =>
    Boolean(anilistUser.value) ||
    (malMode.value === 'username' ? Boolean(malUser.value) : Boolean(malFile.value)),
)

const failedSources = computed(
  () => job.value?.sourceResults?.filter((result) => result.error) ?? [],
)

const phaseLabel = computed(() => {
  const current = job.value
  if (!current) return ''
  switch (current.phase) {
    case 'matching':
      return `Matching ${current.total} entries to AniLounge titles…`
    case 'adding':
      return `Adding missing anime to AniLounge (${current.done} of ${current.total})…`
    case 'saving':
      return 'Saving to your watchlist…'
    default: {
      const step = current.source ? current.sources.indexOf(current.source) + 1 : 1
      const of = current.sources.length > 1 ? ` (${step} of ${current.sources.length})` : ''
      return `Reading your ${current.source ? sourceLabel(current.source) : ''} list${of}…`
    }
  }
})

/** Message from an axios error response, or a fallback. */
const messageFrom = (error: unknown, fallback: string) => {
  const data = (error as { response?: { data?: { message?: string } } })?.response?.data
  return data?.message || fallback
}

const toggleMalMode = () => {
  malMode.value = malMode.value === 'username' ? 'file' : 'username'
}

const onFileChosen = (event: Event) => {
  malFile.value = (event.target as HTMLInputElement).files?.[0] || null
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

/** AniList and MyAnimeList sources from the form. */
const formSources = async (): Promise<WatchlistImportSourceRequest[]> => {
  const sources: WatchlistImportSourceRequest[] = []
  if (anilistUser.value) sources.push({ source: 'anilist', username: anilistUser.value })
  if (malMode.value === 'username' && malUser.value) {
    sources.push({ source: 'mal', username: malUser.value })
  } else if (malMode.value === 'file' && malFile.value) {
    const file = /\.gz$/i.test(malFile.value.name)
      ? { gzipBase64: await toBase64(malFile.value) }
      : { xml: await malFile.value.text() }
    sources.push({ source: 'mal_file', file })
  }
  return sources
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
    const next: WatchlistImportJob | null = response.data.data
    pollFailures = 0
    connectionLost.value = false
    if (previous === 'running' && !next) {
      // The server restarted mid-import and forgot the job; nothing was saved.
      job.value = null
      errorMessage.value =
        'The import was interrupted (the server restarted). Your watchlist was not changed; start it again.'
      return
    }
    job.value = next
    if (next?.state === 'running') {
      const key = `${next.source}:${next.phase}:${next.done}`
      if (key !== progressKey) {
        progressKey = key
        progressAt = Date.now()
      }
      stalled.value = Date.now() - progressAt > STALL_MS
      pollTimer = setTimeout(poll, POLL_MS)
    } else if (previous === 'running' && next?.state === 'done') {
      emit('imported')
      await conflictsPanel.value?.load()
    }
  } catch {
    pollFailures += 1
    connectionLost.value = pollFailures >= MAX_POLL_FAILURES
    pollTimer = setTimeout(poll, POLL_MS * 2)
  }
}

const begin = async (sources: WatchlistImportSourceRequest[]) => {
  isSubmitting.value = true
  errorMessage.value = ''
  try {
    const response = await watchlistImportAPI.start({ sources, addMissing: addMissing.value })
    job.value = response.data.data
    progressKey = ''
    progressAt = Date.now()
    pollTimer = setTimeout(poll, POLL_MS)
  } catch (error) {
    errorMessage.value = messageFrom(error, 'Could not start the import. Try again.')
  } finally {
    isSubmitting.value = false
  }
}

const startImport = async () => {
  const sources = await formSources()
  if (!sources.length) {
    errorMessage.value = 'Enter a username (or choose a file) to import.'
    return
  }
  return begin(sources)
}

/**
 * Open TMDB's approval page in a new tab. The tab is opened before the token request
 * so popup blockers see it as part of the click; if it's blocked anyway, approve here.
 */
const connectTmdb = async () => {
  const tab = window.open('', '_blank')
  if (tab) tab.opener = null
  isSubmitting.value = true
  errorMessage.value = ''
  try {
    // No #fragment: TMDB appends `&request_token=…` to this address.
    const redirectTo = `${window.location.origin}/settings?import=${tab ? 'tmdb-tab' : 'tmdb'}`
    const response = await watchlistImportAPI.tmdbToken(redirectTo)
    const { requestToken, authorizeUrl } = response.data.data
    if (!tab) {
      window.location.assign(authorizeUrl)
      return
    }
    tab.location.href = authorizeUrl
    tmdbPending.value = { requestToken, authorizeUrl }
    listenForApproval()
  } catch (error) {
    tab?.close()
    errorMessage.value = messageFrom(error, 'Could not reach TMDB. Try again.')
  } finally {
    isSubmitting.value = false
  }
}

const closeChannel = () => {
  channel?.close()
  channel = null
}

const cancelTmdb = () => {
  tmdbPending.value = null
  closeChannel()
}

const finishTmdb = async (requestToken: string) => {
  tmdbPending.value = null
  closeChannel()
  await begin([{ source: 'tmdb', requestToken }])
}

/** In the asking tab: take over the import when the TMDB tab reports back. */
const listenForApproval = () => {
  closeChannel()
  if (typeof BroadcastChannel === 'undefined') return
  channel = new BroadcastChannel(TMDB_CHANNEL)
  channel.onmessage = (event: MessageEvent) => {
    const message = event.data as { type?: string; token?: string; approved?: boolean }
    const pending = tmdbPending.value
    if (message?.type !== 'tmdb-result' || !pending || message.token !== pending.requestToken) {
      return
    }
    channel?.postMessage({ type: 'tmdb-ack', token: message.token })
    if (message.approved) {
      finishTmdb(pending.requestToken)
    } else {
      cancelTmdb()
      errorMessage.value = 'TMDB access was not approved, so nothing was imported.'
    }
  }
}

/** In the TMDB tab: hand the result to the tab that asked; true if it took over. */
const handOff = (token: string, approved: boolean) =>
  new Promise<boolean>((resolve) => {
    if (typeof BroadcastChannel === 'undefined') return resolve(false)
    const reply = new BroadcastChannel(TMDB_CHANNEL)
    const timer = setTimeout(() => {
      reply.close()
      resolve(false)
    }, HANDOFF_MS)
    reply.onmessage = (event: MessageEvent) => {
      if (event.data?.type !== 'tmdb-ack' || event.data.token !== token) return
      clearTimeout(timer)
      reply.close()
      resolve(true)
    }
    reply.postMessage({ type: 'tmdb-result', token, approved })
  })

/** Finish the import when TMDB has sent the user back here. */
const resumeTmdb = async () => {
  const { import: mode, request_token: token, approved, denied } = route.query
  if (!token && !denied) return false
  router.replace({ query: {} })
  const ok = !denied && approved === 'true' && typeof token === 'string'
  if (mode === 'tmdb-tab' && typeof token === 'string' && (await handOff(token, ok))) {
    handedOff.value = true
    window.close()
    return true
  }
  if (!ok) {
    errorMessage.value = 'TMDB access was not approved, so nothing was imported.'
    return true
  }
  await begin([{ source: 'tmdb', requestToken: token }])
  return true
}

onMounted(async () => {
  if (await resumeTmdb()) return
  await poll()
})

onUnmounted(() => {
  stopPolling()
  closeChannel()
})
</script>

<style scoped>
.watchlist-import {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.import-card {
  display: flex;
  flex-direction: column;
  gap: 1rem;
  padding: 1.1rem 1.25rem;
  border: 1px solid var(--border-color);
  border-radius: 12px;
  background: var(--bg-card);
}

.card-head h4 {
  margin: 0 0 0.2rem;
  color: var(--text-primary);
  font-size: 1rem;
}

.tmdb-waiting {
  display: flex;
  gap: 0.85rem;
  align-items: flex-start;
}

.tmdb-waiting p {
  margin: 0 0 0.4rem;
  color: var(--text-primary);
}

.tmdb-waiting .import-actions {
  margin-top: 0.5rem;
}

.field {
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
}

.field-label {
  color: var(--text-primary);
  font-weight: 500;
  font-size: 0.9rem;
}

.form-input {
  padding: 0.75rem;
  border: 2px solid var(--border-color);
  border-radius: 8px;
  font: inherit;
  font-size: 1rem;
  background: var(--bg-parchment);
  color: var(--text-primary);
}

.form-input:focus {
  outline: none;
  border-color: var(--coral-primary);
  box-shadow: 0 0 0 3px rgba(224, 122, 95, 0.2);
}

.form-input::placeholder {
  color: var(--text-muted);
}

.link-btn {
  align-self: flex-start;
  padding: 0;
  border: none;
  background: none;
  color: var(--coral-primary);
  font: inherit;
  font-size: 0.85rem;
  cursor: pointer;
}

.link-btn:hover {
  text-decoration: underline;
}

.check {
  display: flex;
  gap: 0.6rem;
  align-items: flex-start;
  color: var(--text-primary);
  font-size: 0.95rem;
}

.check input {
  margin-top: 0.25rem;
  accent-color: var(--coral-primary);
}

.check .hint {
  display: block;
  margin-top: 0.15rem;
}

.hint {
  margin: 0;
  color: var(--text-muted);
  font-size: 0.85rem;
}

.hint a {
  color: var(--coral-primary);
}

.import-actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.5rem 1rem;
}

.import-btn {
  padding: 0.75rem 1.75rem;
  border: none;
  border-radius: 8px;
  background: var(--blend-color);
  color: white;
  font: inherit;
  font-size: 1rem;
  font-weight: 600;
  cursor: pointer;
  transition:
    background 0.2s ease,
    transform 0.2s ease,
    box-shadow 0.2s ease;
}

.import-btn {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
}

.import-btn svg {
  width: 16px;
  height: 16px;
}

.import-btn.secondary {
  padding: 0.55rem 1.1rem;
  font-size: 0.9rem;
}

.import-btn:hover:not(:disabled) {
  background: var(--coral-primary);
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
}

.import-btn:disabled {
  background: var(--text-muted);
  cursor: not-allowed;
  opacity: 0.6;
}

.import-error {
  margin: 0;
  padding: 0.65rem 0.75rem;
  border-radius: 8px;
  background: rgba(244, 67, 54, 0.1);
  color: var(--error-color);
  font-size: 0.9rem;
}

.import-progress {
  display: flex;
  gap: 1rem;
  align-items: flex-start;
}

.import-progress p {
  margin: 0 0 0.4rem;
  color: var(--text-primary);
}

.spinner {
  width: 28px;
  height: 28px;
  flex-shrink: 0;
  border: 3px solid var(--border-color);
  border-top-color: var(--coral-primary);
  border-radius: 50%;
  animation: spin 0.9s linear infinite;
}

.spinner.small {
  width: 20px;
  height: 20px;
  border-width: 2px;
  margin-top: 0.1rem;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

.import-result {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  padding: 0.85rem 1rem;
  border-radius: 10px;
  background: var(--bg-secondary);
}

.result-lead {
  margin: 0;
  color: var(--text-primary);
  font-weight: 500;
}

.not-found summary {
  cursor: pointer;
  color: var(--text-secondary);
  font-size: 0.9rem;
}

.not-found ul {
  max-height: 200px;
  overflow-y: auto;
  margin: 0.5rem 0 0;
  padding-left: 1.25rem;
  font-size: 0.9rem;
  color: var(--text-primary);
}
</style>
