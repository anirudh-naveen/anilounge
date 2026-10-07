<!--
  Connections.vue — linked AniList / MyAnimeList / TMDB accounts.

  Each site is a row: connect, import its list, sync now, disconnect. Connected sites
  receive every watchlist change; AniList and MyAnimeList changes come back (two-way).
  Approval happens on the site in a new tab. The site sends that tab back here with a
  code (AniList, MAL: `?code&state`, the state starting with the provider) or a TMDB
  request token; this page hands it to the tab that asked over a BroadcastChannel and
  closes. If no tab answers (or the popup was blocked and the approval ran in this tab)
  it finishes the connection itself. Imports, their results, clashes, and imports
  without connecting are in WatchlistImport. Disabled for the shared demo account.
-->
<template>
  <div class="connections-page">
    <div class="container">
      <!-- Page Header -->
      <div class="page-header">
        <h1>Connections</h1>
        <p>Link your accounts to bring your list over and keep it in sync everywhere</p>
      </div>

      <!-- Title: Handed Off -->
      <div v-if="handedOff" class="panel handoff" aria-live="polite">
        <p class="handoff-lead">{{ handedOff }} is connected. You can close this tab.</p>
      </div>

      <div v-else-if="authStore.isDemoUser" class="panel">
        <p class="demo-restriction">Connections are disabled for the demo account.</p>
      </div>

      <template v-else>
        <!-- Title: Sync Note -->
        <div class="sync-note">
          <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path
              stroke="currentColor"
              stroke-width="1.8"
              stroke-linecap="round"
              stroke-linejoin="round"
              d="M20 11a8 8 0 0 0-14.6-4.5M4 4v3h3M4 13a8 8 0 0 0 14.6 4.5M20 20v-3h-3"
            />
          </svg>
          <p>
            <strong>Updates sync automatically.</strong> Once a site is connected, changes you make
            on AniLounge update it for you, and changes you make on AniList or MyAnimeList show up
            here too. TMDB receives your plan-to-watch list and ratings.
          </p>
        </div>

        <p v-if="pageError" class="message error" role="alert">{{ pageError }}</p>
        <p v-if="notice" class="message success" role="status">{{ notice }}</p>

        <!-- Title: Accounts -->
        <section class="panel connection-list" aria-label="Accounts" data-testid="connection-list">
          <div v-if="loading" class="loading-row">
            <div class="spinner small"></div>
            <span>Loading your connections…</span>
          </div>

          <article
            v-for="connection in connections"
            v-else
            :key="connection.provider"
            class="connection-row"
            :class="{ connected: connection.connected }"
            :data-testid="`connection-${connection.provider}`"
          >
            <ProviderLogo :provider="connection.provider" />

            <div class="connection-body">
              <div class="connection-title">
                <h2>{{ connection.label }}</h2>
                <span class="sync-badge" :class="connection.sync">
                  {{ connection.sync === 'two-way' ? 'Two-way sync' : 'Receives updates' }}
                </span>
              </div>

              <p v-if="connection.connected" class="connection-status">
                <span class="status-dot" aria-hidden="true"></span>
                Connected<template v-if="connection.username">
                  as <strong>{{ connection.username }}</strong></template
                ><template v-if="connection.sync === 'two-way' && connection.lastSyncedAt">
                  · synced {{ timeAgo(connection.lastSyncedAt) }}</template
                >
              </p>
              <p v-else class="connection-desc">{{ DESCRIPTIONS[connection.provider] }}</p>

              <p v-if="connection.connected && connection.lastError" class="connection-error">
                {{ connection.lastError }}
              </p>

              <div
                v-if="pending?.provider === connection.provider"
                class="waiting"
                aria-live="polite"
              >
                <div class="spinner small"></div>
                <p>
                  Waiting for you to approve AniLounge on {{ connection.label }}…
                  <a :href="pending.authorizeUrl" target="_blank" rel="noopener">Reopen</a>
                  <button type="button" class="link-btn" @click="cancelPending">Cancel</button>
                </p>
              </div>
            </div>

            <div class="connection-actions">
              <span v-if="!connection.available && !connection.connected" class="unavailable">
                Not available yet
              </span>
              <button
                v-else-if="!connection.connected"
                type="button"
                class="btn primary"
                :disabled="Boolean(working) || Boolean(pending)"
                :data-testid="`connect-${connection.provider}`"
                @click="connect(connection.provider)"
              >
                Connect
              </button>
              <template v-else>
                <button
                  type="button"
                  class="btn primary"
                  :class="{ pulse: justConnected === connection.provider }"
                  :disabled="Boolean(working) || importBusy"
                  :data-testid="`import-${connection.provider}`"
                  @click="importFrom(connection.provider)"
                >
                  Import list
                </button>
                <button
                  v-if="connection.sync === 'two-way'"
                  type="button"
                  class="btn ghost"
                  :disabled="Boolean(working)"
                  :data-testid="`sync-${connection.provider}`"
                  @click="syncNow(connection)"
                >
                  {{ working === `sync:${connection.provider}` ? 'Syncing…' : 'Sync now' }}
                </button>
                <button
                  type="button"
                  class="btn text danger"
                  :disabled="Boolean(working)"
                  :data-testid="`disconnect-${connection.provider}`"
                  @click="disconnect(connection)"
                >
                  Disconnect
                </button>
              </template>
            </div>
          </article>
        </section>

        <p class="fine-print">
          Removing a title on AniLounge removes it from connected sites; titles you remove on
          AniList or MyAnimeList stay here. Disconnecting never deletes anything from either list.
        </p>

        <label class="check">
          <input v-model="addMissing" type="checkbox" />
          <span>
            When importing, add anime AniLounge doesn't have yet
            <span class="hint">Makes large imports slower.</span>
          </span>
        </label>

        <WatchlistImport ref="importer" :add-missing="addMissing" @imported="onImported" />
      </template>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { useContentStore } from '@/stores/content'
import { connectionsAPI } from '@/services/api'
import { timeAgo } from '@/utils/homeFeed'
import ProviderLogo from '@/components/ProviderLogo.vue'
import WatchlistImport from '@/components/WatchlistImport.vue'
import type { AccountConnection, ConnectionProvider } from '@/types'

// Component name for Vue devtools
defineOptions({
  name: 'ConnectionsPage',
})

/** Carries a site's answer from the tab it returns to back to the tab that asked. */
const CHANNEL = 'anilounge:connection-approval'
/** How long the returning tab waits for the asking tab to take over. */
const HANDOFF_MS = 1500
/** Set before approving in this same tab (popup blocked), so the return skips the handoff. */
const SAME_TAB_KEY = 'anilounge:connection-same-tab'
const PROVIDERS: ConnectionProvider[] = ['anilist', 'mal', 'tmdb']

const DESCRIPTIONS: Record<ConnectionProvider, string> = {
  anilist:
    'Import your list (private entries too) and keep progress, scores, and dates in sync both ways.',
  mal: 'Import your anime list and keep progress, scores, and dates in sync both ways.',
  tmdb: 'Import your TMDB watchlist and ratings, and send rating and plan-to-watch changes back.',
}

type Callback = {
  provider: ConnectionProvider
  code?: string
  state?: string
  requestToken?: string
  denied?: boolean
}

const authStore = useAuthStore()
const route = useRoute()
const router = useRouter()

const connections = ref<AccountConnection[]>([])
const loading = ref(true)
const pageError = ref('')
const notice = ref('')
const working = ref<string | null>(null)
const pending = ref<{ provider: ConnectionProvider; authorizeUrl: string } | null>(null)
const justConnected = ref<ConnectionProvider | null>(null)
const handedOff = ref('')
const addMissing = ref(true)
const importer = ref<InstanceType<typeof WatchlistImport> | null>(null)
let channel: BroadcastChannel | null = null

const importBusy = computed(() => Boolean(importer.value?.busy))

const labelOf = (provider: ConnectionProvider) =>
  ({ anilist: 'AniList', mal: 'MyAnimeList', tmdb: 'TMDB' })[provider]

/** Message from an axios error response, or a fallback. */
const messageFrom = (error: unknown, fallback: string) => {
  const data = (error as { response?: { data?: { message?: string } } })?.response?.data
  return data?.message || fallback
}

const flash = (text: string) => {
  pageError.value = ''
  notice.value = text
}

const fail = (text: string) => {
  notice.value = ''
  pageError.value = text
}

const load = async () => {
  try {
    const response = await connectionsAPI.list()
    connections.value = response.data.data
  } catch (error) {
    fail(messageFrom(error, "Couldn't load your connections. Refresh to try again."))
  } finally {
    loading.value = false
  }
}

const replaceConnection = (next: AccountConnection) => {
  connections.value = connections.value.map((item) =>
    item.provider === next.provider ? next : item,
  )
}

// ---------------------------------------------------------------------------
// Connecting
// ---------------------------------------------------------------------------

/**
 * Open the site's approval page in a new tab. The tab is opened before the API call so
 * popup blockers see it as part of the click; if it's blocked anyway, approve here.
 */
const connect = async (provider: ConnectionProvider) => {
  const tab = window.open('', '_blank')
  if (tab) tab.opener = null
  working.value = `connect:${provider}`
  pageError.value = ''
  try {
    // TMDB appends `&request_token=…` to this address; AniList and MAL use the
    // redirect registered with them (this page) and tag `state` with the provider.
    const redirectTo = `${window.location.origin}/connections?provider=tmdb`
    const response = await connectionsAPI.start(provider, provider === 'tmdb' ? redirectTo : undefined)
    const { authorizeUrl } = response.data.data as { authorizeUrl: string }
    if (!tab) {
      try {
        sessionStorage.setItem(SAME_TAB_KEY, '1')
      } catch {
        // Without storage the return just waits briefly for a handoff first.
      }
      window.location.assign(authorizeUrl)
      return
    }
    tab.location.href = authorizeUrl
    pending.value = { provider, authorizeUrl }
    listenForApproval()
  } catch (error) {
    tab?.close()
    fail(messageFrom(error, `Couldn't reach ${labelOf(provider)}. Try again.`))
  } finally {
    working.value = null
  }
}

const closeChannel = () => {
  channel?.close()
  channel = null
}

const cancelPending = () => {
  pending.value = null
  closeChannel()
}

/** Trade the site's answer for a connection. */
const finish = async (callback: Callback) => {
  const label = labelOf(callback.provider)
  cancelPending()
  if (callback.denied) {
    fail(`${label} access was not approved, so nothing was connected.`)
    return
  }
  working.value = `connect:${callback.provider}`
  try {
    const response = await connectionsAPI.finish(callback.provider, {
      code: callback.code,
      state: callback.state,
      requestToken: callback.requestToken,
    })
    const connection = response.data.data as AccountConnection
    replaceConnection(connection)
    justConnected.value = callback.provider
    flash(
      `${label} connected${connection.username ? ` as ${connection.username}` : ''}. ` +
        `Choose Import list to bring over what's already there; new changes sync from now on.`,
    )
  } catch (error) {
    fail(messageFrom(error, `Couldn't connect ${label}. Try again.`))
  } finally {
    working.value = null
  }
}

/** In the asking tab: take over when the site's tab reports back. */
const listenForApproval = () => {
  closeChannel()
  if (typeof BroadcastChannel === 'undefined') return
  channel = new BroadcastChannel(CHANNEL)
  channel.onmessage = (event: MessageEvent) => {
    const message = event.data as { type?: string; callback?: Callback }
    const callback = message?.callback
    if (message?.type !== 'connection-result' || !callback) return
    if (!pending.value || pending.value.provider !== callback.provider) return
    channel?.postMessage({ type: 'connection-ack', provider: callback.provider })
    finish(callback)
  }
}

/** In the site's tab: hand the answer to the tab that asked; true if it took over. */
const handOff = (callback: Callback) =>
  new Promise<boolean>((resolve) => {
    if (typeof BroadcastChannel === 'undefined') return resolve(false)
    const reply = new BroadcastChannel(CHANNEL)
    const timer = setTimeout(() => {
      reply.close()
      resolve(false)
    }, HANDOFF_MS)
    reply.onmessage = (event: MessageEvent) => {
      if (event.data?.type !== 'connection-ack' || event.data.provider !== callback.provider) return
      clearTimeout(timer)
      reply.close()
      resolve(true)
    }
    reply.postMessage({ type: 'connection-result', callback })
  })

/** What the site appended to this page's address, if it just sent the user back. */
const readCallback = (): Callback | null => {
  const query = route.query
  const text = (value: unknown) => (typeof value === 'string' ? value : undefined)
  if (query.provider === 'tmdb' && (query.request_token || query.denied)) {
    return {
      provider: 'tmdb',
      requestToken: text(query.request_token),
      denied: Boolean(query.denied) || query.approved !== 'true',
    }
  }
  const state = text(query.state)
  const provider = state?.split('.')[0] as ConnectionProvider | undefined
  if (!state || !provider || !PROVIDERS.includes(provider)) return null
  if (query.error) return { provider, state, denied: true }
  if (!query.code) return null
  return { provider, code: text(query.code), state }
}

/** Finish (or hand off) a connection when a site has sent the user back here. */
const resumeCallback = async () => {
  const callback = readCallback()
  if (!callback) return false
  router.replace({ query: {} })
  let sameTab = false
  try {
    sameTab = sessionStorage.getItem(SAME_TAB_KEY) === '1'
    sessionStorage.removeItem(SAME_TAB_KEY)
  } catch {
    sameTab = false
  }
  if (!sameTab && (await handOff(callback))) {
    handedOff.value = labelOf(callback.provider)
    window.close()
    return true
  }
  await load()
  await finish(callback)
  return true
}

// ---------------------------------------------------------------------------
// Connected accounts
// ---------------------------------------------------------------------------

const importFrom = async (provider: ConnectionProvider) => {
  justConnected.value = null
  notice.value = ''
  pageError.value = ''
  await importer.value?.begin([{ source: provider, connected: true }])
}

const syncNow = async (connection: AccountConnection) => {
  working.value = `sync:${connection.provider}`
  try {
    const response = await connectionsAPI.sync(connection.provider)
    const { applied } = response.data.data as { applied: number }
    flash(
      applied
        ? `Pulled ${applied} ${applied === 1 ? 'change' : 'changes'} from ${connection.label}.`
        : `Your watchlist is up to date with ${connection.label}.`,
    )
    if (applied) await useContentStore().loadWatchlist(true)
  } catch (error) {
    fail(messageFrom(error, `Couldn't sync with ${connection.label}. Try again.`))
  } finally {
    working.value = null
    await load()
  }
}

const disconnect = async (connection: AccountConnection) => {
  const ok = window.confirm(
    `Disconnect ${connection.label}? Nothing is removed from either list; changes just stop syncing.`,
  )
  if (!ok) return
  working.value = `disconnect:${connection.provider}`
  try {
    await connectionsAPI.disconnect(connection.provider)
    if (justConnected.value === connection.provider) justConnected.value = null
    flash(
      connection.provider === 'tmdb'
        ? `${connection.label} disconnected.`
        : `${connection.label} disconnected. You can also remove AniLounge from your ${connection.label} app settings.`,
    )
    await load()
  } catch (error) {
    fail(messageFrom(error, `Couldn't disconnect ${connection.label}. Try again.`))
  } finally {
    working.value = null
  }
}

const onImported = async () => {
  if (authStore.user) authStore.user.watchlistImportedAt = new Date().toISOString()
  await useContentStore().loadWatchlist(true)
}

onMounted(async () => {
  if (authStore.isDemoUser) return
  if (await resumeCallback()) return
  await load()
})

onUnmounted(closeChannel)
</script>

<style scoped>
.connections-page {
  padding: 2rem 0;
  min-height: calc(100vh - 140px);
}

.container {
  max-width: 900px;
  margin: 0 auto;
  padding: 0 1rem;
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.page-header {
  text-align: center;
  margin-bottom: 1.5rem;
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

.panel {
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: 12px;
  box-shadow: var(--shadow-sm);
}

.handoff,
.panel:has(.demo-restriction) {
  padding: 1.5rem 2rem;
}

.handoff-lead {
  margin: 0;
  color: var(--text-primary);
  font-weight: 500;
}

.demo-restriction {
  color: var(--text-secondary);
  margin: 0;
}

.sync-note {
  display: flex;
  gap: 0.75rem;
  align-items: flex-start;
  padding: 0.9rem 1.1rem;
  border-radius: 12px;
  background: var(--bg-secondary);
  color: var(--text-secondary);
  font-size: 0.92rem;
  line-height: 1.5;
}

.sync-note svg {
  width: 20px;
  height: 20px;
  flex-shrink: 0;
  margin-top: 0.1rem;
  color: var(--coral-primary);
}

.sync-note p {
  margin: 0;
}

.sync-note strong {
  color: var(--text-primary);
}

.message {
  margin: 0;
  padding: 0.7rem 0.9rem;
  border-radius: 8px;
  font-size: 0.92rem;
}

.message.error {
  background: rgba(244, 67, 54, 0.1);
  color: var(--error-color);
}

.message.success {
  background: rgba(76, 175, 80, 0.12);
  color: var(--text-primary);
}

.connection-list {
  overflow: hidden;
}

.loading-row {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 1.25rem 1.5rem;
  color: var(--text-secondary);
}

.connection-row {
  display: flex;
  align-items: center;
  gap: 1rem;
  padding: 1.15rem 1.4rem;
}

.connection-row + .connection-row {
  border-top: 1px solid var(--border-color);
}

.connection-body {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.connection-title {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.5rem;
}

.connection-title h2 {
  margin: 0;
  font-size: 1.05rem;
  font-weight: 650;
  color: var(--text-primary);
}

.sync-badge {
  padding: 0.12rem 0.5rem;
  border-radius: 999px;
  font-size: 0.72rem;
  font-weight: 600;
  letter-spacing: 0.01em;
  background: var(--bg-secondary);
  color: var(--text-secondary);
}

.sync-badge.two-way {
  background: rgba(224, 122, 95, 0.14);
  color: var(--coral-primary);
}

.connection-desc,
.connection-status {
  margin: 0;
  font-size: 0.9rem;
  color: var(--text-secondary);
}

.connection-status strong {
  color: var(--text-primary);
  font-weight: 600;
}

.status-dot {
  display: inline-block;
  width: 8px;
  height: 8px;
  margin-right: 0.3rem;
  border-radius: 50%;
  background: var(--success-color);
  vertical-align: 0.05em;
}

.connection-error {
  margin: 0.15rem 0 0;
  font-size: 0.85rem;
  color: var(--error-color);
}

.waiting {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  margin-top: 0.35rem;
}

.waiting p {
  margin: 0;
  font-size: 0.88rem;
  color: var(--text-primary);
}

.waiting a {
  margin-left: 0.4rem;
  color: var(--coral-primary);
}

.connection-actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  align-items: center;
  gap: 0.5rem;
  flex-shrink: 0;
}

.btn {
  padding: 0.55rem 1.1rem;
  border-radius: 8px;
  font: inherit;
  font-size: 0.9rem;
  font-weight: 600;
  cursor: pointer;
  white-space: nowrap;
  transition:
    background 0.2s ease,
    border-color 0.2s ease,
    color 0.2s ease,
    transform 0.2s ease;
}

.btn:disabled {
  cursor: not-allowed;
  opacity: 0.55;
}

.btn.primary {
  border: none;
  background: var(--blend-color);
  color: white;
}

.btn.primary:hover:not(:disabled) {
  background: var(--coral-primary);
  transform: translateY(-1px);
}

.btn.primary.pulse {
  box-shadow: 0 0 0 0 rgba(224, 122, 95, 0.5);
  animation: pulse 1.8s ease-out 3;
}

.btn.ghost {
  border: 1px solid var(--border-color);
  background: transparent;
  color: var(--text-primary);
}

.btn.ghost:hover:not(:disabled) {
  border-color: var(--coral-primary);
  color: var(--coral-primary);
}

.btn.text {
  padding-inline: 0.6rem;
  border: none;
  background: none;
}

.btn.danger {
  color: var(--text-muted);
}

.btn.danger:hover:not(:disabled) {
  color: var(--error-color);
}

.unavailable {
  font-size: 0.85rem;
  color: var(--text-muted);
}

.link-btn {
  margin-left: 0.4rem;
  padding: 0;
  border: none;
  background: none;
  color: var(--coral-primary);
  font: inherit;
  cursor: pointer;
}

.link-btn:hover {
  text-decoration: underline;
}

.fine-print {
  margin: -0.25rem 0.25rem 0;
  font-size: 0.82rem;
  color: var(--text-muted);
}

.check {
  display: flex;
  gap: 0.6rem;
  align-items: flex-start;
  padding: 0 0.25rem;
  color: var(--text-primary);
  font-size: 0.95rem;
}

.check input {
  margin-top: 0.25rem;
  accent-color: var(--coral-primary);
}

.hint {
  display: block;
  margin-top: 0.15rem;
  color: var(--text-muted);
  font-size: 0.85rem;
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
  width: 18px;
  height: 18px;
  border-width: 2px;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

@keyframes pulse {
  to {
    box-shadow: 0 0 0 10px rgba(224, 122, 95, 0);
  }
}

@media (max-width: 640px) {
  .page-header h1 {
    font-size: 2rem;
  }

  .connection-row {
    flex-wrap: wrap;
    align-items: flex-start;
    padding: 1rem;
  }

  .connection-body {
    flex-basis: calc(100% - 60px);
  }

  .connection-actions {
    width: 100%;
    justify-content: flex-start;
    padding-left: calc(44px + 1rem);
  }
}
</style>
