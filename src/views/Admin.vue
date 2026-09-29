<!--
  Admin.vue — admin tools (view).

  Content: browse movies, series, specials, characters, voice actors, and studios,
  edit a row's fields, and jump between linked rows (a title's cast and studios, a
  character's titles and voice actors, ...). Edited fields are locked so the hourly
  catalog sync keeps them; unlocking hands a field back to the sync.
  Users: admins mute users; the creator also adds/removes admins and bans users.
  Admin-only; the server enforces every permission shown here.
-->
<template>
  <div class="social-page">
    <div class="social-container">
      <!-- Header -->
      <header class="social-intro">
        <p class="social-kicker">
          {{ authStore.isCreator ? 'Creator' : 'Admin' }}
          <RoleBadge :username="authStore.user?.username" />
        </p>
        <h1 class="social-title">Manage AniLounge</h1>
        <p class="social-subtitle">
          Edit the catalog and keep the community in check.
        </p>
      </header>

      <div class="admin-tabs" role="tablist" aria-label="Admin sections">
        <button
          v-for="tab in TABS"
          :key="tab.id"
          type="button"
          role="tab"
          class="admin-tab"
          :class="{ active: activeTab === tab.id }"
          :aria-selected="activeTab === tab.id"
          @click="activeTab = tab.id"
        >
          {{ tab.label }}
        </button>
      </div>

      <!-- Title: Content -->
      <template v-if="activeTab === 'content'">
        <div class="kind-tabs" role="tablist" aria-label="Content type">
          <button
            v-for="kind in KINDS"
            :key="kind.id"
            type="button"
            role="tab"
            class="kind-tab"
            :class="{ active: contentKind === kind.id }"
            :aria-selected="contentKind === kind.id"
            :data-testid="`admin-kind-${kind.id}`"
            @click="contentKind = kind.id"
          >
            {{ kind.plural }}
          </button>
        </div>

        <div class="admin-layout">
          <section class="social-panel admin-list-panel" data-testid="admin-content-list">
            <input
              v-model="contentQuery"
              type="search"
              class="input admin-search"
              :placeholder="`Search ${KIND_BY_ID[contentKind].plural.toLowerCase()}`"
              :aria-label="`Search ${KIND_BY_ID[contentKind].plural.toLowerCase()}`"
            />
            <div v-if="contentLoading" class="social-loading"><div class="spinner"></div></div>
            <p v-else-if="!contentResults.items.length" class="social-empty">Nothing found.</p>
            <ul v-else class="social-list">
              <li v-for="item in contentResults.items" :key="item.id">
                <button
                  type="button"
                  class="social-row admin-pick"
                  :class="{ selected: editor?.id === item.id }"
                  data-testid="admin-pick"
                  @click="openContent(item.id, { fresh: true })"
                >
                  <img
                    :src="imageFor(item.imagePath)"
                    alt=""
                    class="admin-thumb"
                    :class="{ round: isPerson(item.kind) }"
                    loading="lazy"
                  />
                  <span class="social-row-body">
                    <span class="social-name">{{ item.title }}</span>
                    <span class="social-meta">
                      <template v-if="item.subtitle">{{ item.subtitle }}</template>
                      <template v-else-if="item.releaseDate">{{ yearOf(item.releaseDate) }}</template>
                      <span v-if="item.edited" class="admin-pill">Edited</span>
                    </span>
                  </span>
                </button>
              </li>
            </ul>
            <div v-if="pageCount(contentResults) > 1" class="admin-pager">
              <button
                type="button"
                class="btn btn-ghost btn-small"
                :disabled="contentResults.page <= 1"
                @click="loadContent(contentResults.page - 1)"
              >
                Previous
              </button>
              <span class="social-meta">
                Page {{ contentResults.page }} of {{ pageCount(contentResults) }}
              </span>
              <button
                type="button"
                class="btn btn-ghost btn-small"
                :disabled="contentResults.page >= pageCount(contentResults)"
                @click="loadContent(contentResults.page + 1)"
              >
                Next
              </button>
            </div>
          </section>

          <!-- Title: Editor -->
          <section
            ref="editorPanel"
            class="social-panel admin-editor"
            data-testid="admin-content-editor"
          >
            <div v-if="editorLoading" class="social-loading"><div class="spinner"></div></div>
            <p v-else-if="editorError" class="social-empty admin-error">{{ editorError }}</p>
            <p v-else-if="!editor" class="social-empty">
              Pick something on the left to edit it.
            </p>
            <template v-else>
              <button v-if="backTarget" type="button" class="admin-link admin-back" @click="goBack">
                ← Back to {{ backTarget.name }}
              </button>
              <header class="editor-head">
                <img
                  :src="imageFor(currentImage)"
                  alt=""
                  class="editor-image"
                  :class="{ round: isPerson(editor.kind) }"
                />
                <div>
                  <p class="social-kicker">{{ KIND_BY_ID[editor.kind].singular }}</p>
                  <h2 class="social-panel-title">{{ currentName }}</h2>
                  <router-link :to="detailsRoute(editor)" target="_blank" class="admin-link">
                    View page ↗
                  </router-link>
                </div>
              </header>

              <form @submit.prevent="saveContent">
                <div v-for="field in editor.fields" :key="field" class="admin-field">
                  <div class="admin-field-head">
                    <label :for="`field-${field}`">{{ FIELD_LABELS[field] || field }}</label>
                    <span v-if="editor.locked.includes(field)" class="admin-lock">
                      Locked
                      <button
                        type="button"
                        class="admin-link"
                        title="Let the catalog sync update this field again"
                        :disabled="saving"
                        @click="unlockField(field)"
                      >
                        Unlock
                      </button>
                    </span>
                  </div>
                  <textarea
                    v-if="field === 'overview' || field === 'about'"
                    :id="`field-${field}`"
                    v-model="draft[field]"
                    class="input social-textarea"
                    rows="6"
                  ></textarea>
                  <select
                    v-else-if="field === 'airingStatus'"
                    :id="`field-${field}`"
                    v-model="draft[field]"
                    class="input"
                  >
                    <option value="">Unknown</option>
                    <option value="upcoming">Upcoming</option>
                    <option value="airing">Airing</option>
                    <option value="finished">Finished</option>
                  </select>
                  <input
                    v-else
                    :id="`field-${field}`"
                    v-model="draft[field]"
                    class="input"
                    :type="inputType(field)"
                    :min="inputType(field) === 'number' ? 0 : undefined"
                  />
                  <img
                    v-if="IMAGE_FIELDS.includes(field) && draft[field]"
                    :src="getImageUrl(String(draft[field]), 'w300')"
                    alt=""
                    class="admin-preview"
                    :class="field"
                  />
                </div>

                <div class="admin-actions">
                  <span class="social-meta">Saved fields are locked against the hourly sync.</span>
                  <button
                    type="button"
                    class="btn btn-ghost btn-small"
                    :disabled="!dirtyFields.length || saving"
                    @click="resetDraft"
                  >
                    Discard
                  </button>
                  <button
                    type="submit"
                    class="btn btn-primary btn-small"
                    :disabled="!dirtyFields.length || saving"
                    data-testid="admin-save"
                  >
                    {{ saving ? 'Saving…' : 'Save changes' }}
                  </button>
                </div>
              </form>

              <!-- Title: Linked Rows -->
              <div class="admin-links">
                <section v-for="group in visibleLinks" :key="group.key" class="link-group">
                  <h3 class="link-title">
                    {{ group.label }} <span class="social-count">{{ group.items.length }}</span>
                  </h3>
                  <div class="link-chips">
                    <button
                      v-for="link in group.items"
                      :key="link.id"
                      type="button"
                      class="link-chip"
                      :title="`Edit ${link.name}`"
                      data-testid="admin-link"
                      @click="openContent(link.id)"
                    >
                      <img
                        :src="imageFor(link.imagePath)"
                        alt=""
                        class="chip-image"
                        :class="{ round: isPerson(link.kind) }"
                        loading="lazy"
                      />
                      <span class="chip-text">
                        <span class="chip-name">{{ link.name }}</span>
                        <span class="chip-note">{{ link.note || KIND_BY_ID[link.kind]?.singular }}</span>
                      </span>
                    </button>
                  </div>
                </section>
                <p v-if="!visibleLinks.length" class="social-meta">Nothing linked to this yet.</p>
              </div>
            </template>
          </section>
        </div>
      </template>

      <!-- Title: Users -->
      <section v-else class="social-panel" data-testid="admin-users">
        <div class="admin-filters">
          <input
            v-model="userQuery"
            type="search"
            class="input"
            placeholder="Search by username or email"
            aria-label="Search users"
          />
          <div class="kind-tabs compact" role="tablist" aria-label="User filter">
            <button
              v-for="option in USER_FILTERS"
              :key="option.id"
              type="button"
              role="tab"
              class="kind-tab"
              :class="{ active: userFilter === option.id }"
              :aria-selected="userFilter === option.id"
              @click="userFilter = option.id"
            >
              {{ option.label }}
            </button>
          </div>
        </div>
        <p class="social-meta admin-rules">
          Admins can mute users.
          <template v-if="authStore.isCreator">
            As the creator, you can also add or remove admins and ban users.
          </template>
          <template v-else>Only the creator can add admins or ban users.</template>
        </p>
        <div v-if="usersLoading" class="social-loading"><div class="spinner"></div></div>
        <p v-else-if="!userResults.items.length" class="social-empty">No users found.</p>
        <ul v-else class="social-list">
          <li
            v-for="user in userResults.items"
            :key="user.id"
            class="user-item"
            :class="{ banned: user.bannedAt }"
          >
            <div class="social-row">
              <UserAvatar :src="user.profilePicture" :name="user.username" :size="40" />
              <div class="social-row-body">
                <router-link :to="profileRoute(user.username)" class="social-name">
                  {{ user.username }}<RoleBadge :username="user.username" />
                </router-link>
                <div class="social-meta">
                  {{ user.email }}
                  <span v-if="user.role === 'creator'" class="admin-pill creator">Creator</span>
                  <span v-else-if="user.isOwner" class="admin-pill owner">Owner</span>
                  <span v-else-if="user.role === 'admin'" class="admin-pill">Admin</span>
                  <span v-if="user.bannedAt" class="admin-pill danger">Banned</span>
                  <span v-if="user.mutedUntil" class="admin-pill warn">
                    Muted {{ muteLabel(user.mutedUntil) }}
                  </span>
                  <span v-if="!user.emailVerified" class="admin-pill muted">Unverified</span>
                  <span v-if="user.isDemo" class="admin-pill muted">Demo</span>
                </div>
                <p v-if="user.bannedAt && user.banReason" class="social-note">
                  Ban reason: {{ user.banReason }}
                </p>
                <p v-else-if="user.mutedUntil && user.muteReason" class="social-note">
                  Mute reason: {{ user.muteReason }}
                </p>
              </div>
              <div class="social-actions user-actions">
                <span v-if="user.id === authStore.user?.id" class="social-meta">That's you</span>
                <template v-else>
                  <template v-if="canManageRole(user)">
                    <button
                      v-if="user.role === 'admin'"
                      type="button"
                      class="btn btn-ghost btn-small"
                      :disabled="busy === user.id"
                      @click="changeRole(user, 'user')"
                    >
                      Remove admin
                    </button>
                    <button
                      v-else
                      type="button"
                      class="btn btn-primary btn-small"
                      :disabled="busy === user.id"
                      @click="changeRole(user, 'admin')"
                    >
                      Make admin
                    </button>
                  </template>
                  <template v-if="canMute(user)">
                    <button
                      v-if="user.mutedUntil"
                      type="button"
                      class="btn btn-ghost btn-small"
                      :disabled="busy === user.id"
                      @click="unmute(user)"
                    >
                      Unmute
                    </button>
                    <button
                      v-else
                      type="button"
                      class="btn btn-ghost btn-small"
                      @click="openAction(user.id, 'mute')"
                    >
                      Mute…
                    </button>
                  </template>
                  <template v-if="canBan(user)">
                    <button
                      v-if="user.bannedAt"
                      type="button"
                      class="btn btn-ghost btn-small"
                      :disabled="busy === user.id"
                      @click="unban(user)"
                    >
                      Unban
                    </button>
                    <button
                      v-else
                      type="button"
                      class="btn btn-danger btn-small"
                      @click="openAction(user.id, 'ban')"
                    >
                      Ban…
                    </button>
                  </template>
                </template>
              </div>
            </div>

            <!-- Title: Mute / Ban Form -->
            <form
              v-if="action?.userId === user.id"
              class="action-form"
              @submit.prevent="submitAction(user)"
            >
              <template v-if="action.kind === 'mute'">
                <label class="social-meta" :for="`mute-${user.id}`">Mute for</label>
                <select :id="`mute-${user.id}`" v-model="action.duration" class="input admin-select">
                  <option v-for="option in MUTE_OPTIONS" :key="option.id" :value="option.id">
                    {{ option.label }}
                  </option>
                </select>
              </template>
              <p v-else class="social-meta action-warning">
                {{ user.username }} will be signed out everywhere and can't sign back in.
              </p>
              <input
                v-model="action.reason"
                class="input"
                maxlength="300"
                :placeholder="`Reason (optional${action.kind === 'mute' ? ', shown to them' : ''})`"
                aria-label="Reason"
              />
              <div class="note-actions">
                <button type="button" class="btn btn-ghost btn-small" @click="action = null">
                  Cancel
                </button>
                <button
                  type="submit"
                  class="btn btn-small"
                  :class="action.kind === 'ban' ? 'btn-danger' : 'btn-primary'"
                  :disabled="busy === user.id"
                >
                  {{ action.kind === 'ban' ? `Ban ${user.username}` : 'Mute' }}
                </button>
              </div>
            </form>
          </li>
        </ul>
        <div v-if="pageCount(userResults) > 1" class="admin-pager">
          <button
            type="button"
            class="btn btn-ghost btn-small"
            :disabled="userResults.page <= 1"
            @click="loadUsers(userResults.page - 1)"
          >
            Previous
          </button>
          <span class="social-meta">Page {{ userResults.page }} of {{ pageCount(userResults) }}</span>
          <button
            type="button"
            class="btn btn-ghost btn-small"
            :disabled="userResults.page >= pageCount(userResults)"
            @click="loadUsers(userResults.page + 1)"
          >
            Next
          </button>
        </div>
      </section>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { useToast } from 'vue-toastification'
import RoleBadge from '@/components/RoleBadge.vue'
import UserAvatar from '@/components/UserAvatar.vue'
import { adminAPI, getDetailsRouteName, getImageUrl } from '@/services/api'
import { useAuthStore } from '@/stores/auth'
import { useStaffStore } from '@/stores/staff'
import { apiErrorMessage, profileRoute } from '@/utils/social'

defineOptions({ name: 'AdminPage' })

type Kind = 'movie' | 'series' | 'special' | 'character' | 'voice' | 'studio'
type Page<T> = { items: T[]; page: number; pageSize: number; total: number }
type ContentHit = {
  id: string
  kind: Kind
  title: string
  subtitle: string | null
  imagePath: string | null
  releaseDate: string | null
  edited: boolean
}
type LinkItem = { id: string; kind: Kind; name: string; imagePath: string | null; note: string | null }
type EditableContent = {
  id: string
  kind: Kind
  fields: string[]
  values: Record<string, string | number | null>
  locked: string[]
  links: Array<{ key: string; label: string; items: LinkItem[] }>
}
type AdminUser = {
  id: string
  username: string
  email: string
  profilePicture: string | null
  role: 'user' | 'admin' | 'creator'
  isOwner: boolean
  isAdmin: boolean
  emailVerified: boolean
  isDemo: boolean
  mutedUntil: string | null
  muteReason: string | null
  bannedAt: string | null
  banReason: string | null
}

const TABS = [
  { id: 'content', label: 'Content' },
  { id: 'users', label: 'Users & moderation' },
] as const
const KINDS: Array<{ id: Kind; singular: string; plural: string }> = [
  { id: 'movie', singular: 'Movie', plural: 'Movies' },
  { id: 'series', singular: 'Series', plural: 'Series' },
  { id: 'special', singular: 'Special', plural: 'Specials' },
  { id: 'character', singular: 'Character', plural: 'Characters' },
  { id: 'voice', singular: 'Voice actor', plural: 'Voice actors' },
  { id: 'studio', singular: 'Studio', plural: 'Studios' },
]
const KIND_BY_ID = Object.fromEntries(KINDS.map((kind) => [kind.id, kind])) as Record<
  Kind,
  (typeof KINDS)[number]
>
const FIELD_LABELS: Record<string, string> = {
  title: 'Title',
  nativeTitle: 'Native title',
  overview: 'Synopsis',
  tagline: 'Tagline',
  posterPath: 'Poster (TMDB path or image URL)',
  backdropPath: 'Backdrop (TMDB path or image URL)',
  releaseDate: 'Release date',
  airingStatus: 'Airing status',
  runtime: 'Runtime (minutes)',
  episodeCount: 'Episodes',
  seasonCount: 'Seasons',
  name: 'Name',
  englishName: 'English name',
  nativeName: 'Native name',
  about: 'About',
  imagePath: 'Image (URL or TMDB path)',
}
const NUMBER_FIELDS = ['runtime', 'episodeCount', 'seasonCount']
const IMAGE_FIELDS = ['posterPath', 'backdropPath', 'imagePath']
const USER_FILTERS = [
  { id: 'all', label: 'All' },
  { id: 'staff', label: 'Staff' },
  { id: 'muted', label: 'Muted' },
  { id: 'banned', label: 'Banned' },
] as const
const MUTE_OPTIONS = [
  { id: '1h', label: '1 hour' },
  { id: '24h', label: '24 hours' },
  { id: '7d', label: '7 days' },
  { id: '30d', label: '30 days' },
  { id: 'permanent', label: 'Until I unmute them' },
]
const SEARCH_DELAY_MS = 300

const toast = useToast()
const authStore = useAuthStore()
const staffStore = useStaffStore()
const activeTab = ref<'content' | 'users'>('content')

const emptyPage = <T,>(): Page<T> => ({ items: [], page: 1, pageSize: 25, total: 0 })
const pageCount = (page: Page<unknown>) => Math.max(1, Math.ceil(page.total / page.pageSize))
const yearOf = (value: string) => new Date(value).getFullYear()
const isPerson = (kind: Kind) => kind === 'character' || kind === 'voice'
const imageFor = (path: string | null | undefined) => getImageUrl(path || '', 'w185')
const inputType = (field: string) =>
  NUMBER_FIELDS.includes(field) ? 'number' : field === 'releaseDate' ? 'date' : 'text'
const detailsRoute = (item: { id: string; kind: Kind }) => ({
  name: getDetailsRouteName({
    contentType: item.kind === 'series' ? 'tv' : item.kind,
    entityType: item.kind === 'voice' ? 'voice_actor' : undefined,
  }),
  params: { id: item.id },
})

// --- Content ---------------------------------------------------------------

const contentKind = ref<Kind>('movie')
const contentQuery = ref('')
const contentResults = ref<Page<ContentHit>>(emptyPage())
const contentLoading = ref(false)
const editor = ref<EditableContent | null>(null)
const editorLoading = ref(false)
const editorError = ref('')
const editorPanel = ref<HTMLElement | null>(null)
const history = ref<Array<{ id: string; name: string }>>([])
const draft = ref<Record<string, string | number | null>>({})
const saving = ref(false)
let contentTimer: ReturnType<typeof setTimeout> | undefined
let contentSeq = 0
let editorSeq = 0

const nameKey = (kind: Kind) => (isPerson(kind) || kind === 'studio' ? 'name' : 'title')
const currentName = computed(() =>
  editor.value ? String(editor.value.values[nameKey(editor.value.kind)] || 'Untitled') : '',
)
const currentImage = computed(() => {
  const values = editor.value?.values || {}
  return String(values.posterPath || values.imagePath || '')
})
const backTarget = computed(() => history.value[history.value.length - 1] ?? null)
const visibleLinks = computed(() => (editor.value?.links || []).filter((group) => group.items.length))

const loadContent = async (page = 1) => {
  const seq = ++contentSeq
  contentLoading.value = true
  try {
    const response = await adminAPI.searchContent({
      q: contentQuery.value.trim() || undefined,
      type: contentKind.value,
      page,
    })
    if (seq === contentSeq) contentResults.value = response.data.data
  } catch (error) {
    if (seq === contentSeq) toast.error(apiErrorMessage(error, 'Could not load the list.'))
  } finally {
    if (seq === contentSeq) contentLoading.value = false
  }
}

watch(contentQuery, () => {
  clearTimeout(contentTimer)
  contentTimer = setTimeout(() => loadContent(1), SEARCH_DELAY_MS)
})

watch(contentKind, () => {
  clearTimeout(contentTimer)
  contentQuery.value = ''
  loadContent(1)
})

const resetDraft = () => {
  draft.value = Object.fromEntries(
    Object.entries(editor.value?.values || {}).map(([key, value]) => [key, value ?? '']),
  )
}

const setEditor = (data: EditableContent) => {
  editor.value = data
  resetDraft()
}

/** Draft value in the API's shape: '' becomes null, number inputs become numbers. */
const normalized = (field: string, value: unknown) => {
  if (value === '' || value === null || value === undefined) return null
  return NUMBER_FIELDS.includes(field) ? Number(value) : value
}

const dirtyFields = computed(() => {
  if (!editor.value) return []
  const values = editor.value.values
  return editor.value.fields.filter(
    (field) => normalized(field, draft.value[field]) !== normalized(field, values[field]),
  )
})

/** Bring the editor into view when it sits below the list (narrow screens). */
const revealEditor = async () => {
  await nextTick()
  const panel = editorPanel.value
  if (!panel) return
  const { top } = panel.getBoundingClientRect()
  if (top < 80 || top > window.innerHeight * 0.6) {
    panel.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }
}

/**
 * Load a row into the editor. From the list (`fresh`) the back history resets;
 * from a linked chip the current row is pushed so "Back" returns to it.
 */
const openContent = async (id: string, { fresh = false, fromBack = false } = {}) => {
  if (editor.value?.id === id && !editorError.value) return
  if (dirtyFields.value.length && !window.confirm('Discard unsaved changes?')) return
  if (fresh) history.value = []
  else if (editor.value && !fromBack) {
    history.value.push({ id: editor.value.id, name: currentName.value })
  }

  const seq = ++editorSeq
  editorLoading.value = true
  editorError.value = ''
  revealEditor()
  try {
    const response = await adminAPI.getContent(id)
    if (seq === editorSeq) setEditor(response.data.data)
  } catch (error) {
    if (seq !== editorSeq) return
    const message = apiErrorMessage(error, 'Could not load that item.')
    editorError.value = message
    editor.value = null
    toast.error(message)
    console.error('Admin editor load failed:', error)
  } finally {
    if (seq === editorSeq) editorLoading.value = false
  }
}

const goBack = () => {
  const previous = history.value.pop()
  if (previous) openContent(previous.id, { fromBack: true })
}

const submit = async (body: { changes?: Record<string, unknown>; unlock?: string[] }) => {
  if (!editor.value) return false
  saving.value = true
  try {
    const response = await adminAPI.updateContent(editor.value.id, body)
    setEditor(response.data.data)
    const hit = contentResults.value.items.find((item) => item.id === editor.value?.id)
    if (hit) {
      hit.title = currentName.value
      hit.edited = editor.value!.locked.length > 0
    }
    return true
  } catch (error) {
    toast.error(apiErrorMessage(error, 'Could not save.'))
    return false
  } finally {
    saving.value = false
  }
}

const saveContent = async () => {
  const changes = Object.fromEntries(
    dirtyFields.value.map((field) => [field, normalized(field, draft.value[field])]),
  )
  if (await submit({ changes })) toast.success('Saved.')
}

const unlockField = async (field: string) => {
  if (dirtyFields.value.includes(field)) {
    toast.info('Save or discard your change to this field first.')
    return
  }
  if (await submit({ unlock: [field] })) {
    toast.success(`${FIELD_LABELS[field] || field} will follow the catalog sync again.`)
  }
}

// --- Users -----------------------------------------------------------------

const userQuery = ref('')
const userFilter = ref<(typeof USER_FILTERS)[number]['id']>('all')
const userResults = ref<Page<AdminUser>>(emptyPage())
const usersLoading = ref(false)
const usersLoaded = ref(false)
const busy = ref<string | null>(null)
const action = ref<{ userId: string; kind: 'mute' | 'ban'; duration: string; reason: string } | null>(
  null,
)
let userTimer: ReturnType<typeof setTimeout> | undefined
let userSeq = 0

const loadUsers = async (page = 1) => {
  const seq = ++userSeq
  usersLoading.value = true
  try {
    const response = await adminAPI.listUsers({
      q: userQuery.value.trim() || undefined,
      filter: userFilter.value,
      page,
    })
    if (seq === userSeq) {
      userResults.value = response.data.data
      usersLoaded.value = true
    }
  } catch (error) {
    if (seq === userSeq) toast.error(apiErrorMessage(error, 'Could not load users.'))
  } finally {
    if (seq === userSeq) usersLoading.value = false
  }
}

watch([userQuery, userFilter], () => {
  clearTimeout(userTimer)
  userTimer = setTimeout(() => loadUsers(1), SEARCH_DELAY_MS)
})

watch(activeTab, (tab) => {
  if (tab === 'users' && !usersLoaded.value && !usersLoading.value) loadUsers(1)
})

const isSelf = (user: AdminUser) => user.id === authStore.user?.id

/** Mirrors adminService.setUserRole: creator only; not owners, demo, banned, or unverified. */
const canManageRole = (user: AdminUser) =>
  authStore.isCreator &&
  !isSelf(user) &&
  user.role !== 'creator' &&
  !user.isOwner &&
  !user.isDemo &&
  !user.bannedAt &&
  (user.role === 'admin' || user.emailVerified)

/** Mirrors adminService.muteUser: admins mute regular users; the creator can mute admins. */
const canMute = (user: AdminUser) =>
  !isSelf(user) && user.role !== 'creator' && !user.bannedAt && (!user.isAdmin || authStore.isCreator)

/** Mirrors adminService.setBan: creator only; owners must leave ADMIN_EMAILS first. */
const canBan = (user: AdminUser) =>
  authStore.isCreator &&
  !isSelf(user) &&
  user.role !== 'creator' &&
  !user.isDemo &&
  (Boolean(user.bannedAt) || !user.isOwner)

const muteLabel = (until: string) => {
  const date = new Date(until)
  if (date.getUTCFullYear() >= 9999) return 'indefinitely'
  return `until ${date.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}`
}

const openAction = (userId: string, kind: 'mute' | 'ban') => {
  action.value = { userId, kind, duration: '24h', reason: '' }
}

/** Run a moderation call and merge the returned user into the list. */
const moderate = async (user: AdminUser, call: () => Promise<{ data: { data: AdminUser; message: string } }>) => {
  busy.value = user.id
  try {
    const response = await call()
    Object.assign(user, response.data.data)
    toast.success(response.data.message)
    action.value = null
    staffStore.load(true)
  } catch (error) {
    toast.error(apiErrorMessage(error, 'That did not work.'))
  } finally {
    busy.value = null
  }
}

const changeRole = (user: AdminUser, role: 'user' | 'admin') => {
  const prompt =
    role === 'admin'
      ? `Make ${user.username} an admin? They'll be able to edit content and mute users.`
      : `Remove admin from ${user.username}?`
  if (!window.confirm(prompt)) return
  moderate(user, () => adminAPI.setUserRole(user.id, role))
}

const submitAction = (user: AdminUser) => {
  const current = action.value
  if (!current) return
  const reason = current.reason.trim() || undefined
  if (current.kind === 'mute') {
    moderate(user, () => adminAPI.muteUser(user.id, current.duration, reason))
  } else if (window.confirm(`Ban ${user.username}? You can unban them later.`)) {
    moderate(user, () => adminAPI.setBan(user.id, true, reason))
  }
}

const unmute = (user: AdminUser) => moderate(user, () => adminAPI.muteUser(user.id, 'off'))

const unban = (user: AdminUser) => {
  if (!window.confirm(`Unban ${user.username}? They'll be able to sign in again.`)) return
  moderate(user, () => adminAPI.setBan(user.id, false))
}

onMounted(() => loadContent(1))
onUnmounted(() => {
  clearTimeout(contentTimer)
  clearTimeout(userTimer)
})
</script>

<style scoped>
.admin-tabs,
.kind-tabs {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  margin-bottom: 1rem;
}

.admin-tab,
.kind-tab {
  padding: 0.55rem 1.1rem;
  border-radius: 999px;
  border: 1px solid var(--border-color);
  background: var(--bg-card);
  color: var(--text-secondary);
  font: inherit;
  font-weight: 600;
  cursor: pointer;
}

.kind-tab {
  padding: 0.4rem 0.9rem;
  font-size: 0.9rem;
}

.admin-tab.active {
  background: var(--coral-primary);
  border-color: var(--coral-primary);
  color: var(--text-on-accent);
}

.kind-tab.active {
  background: var(--bg-hover);
  border-color: var(--border-hover);
  color: var(--coral-deep);
}

.kind-tabs.compact {
  margin-bottom: 0;
  flex-wrap: nowrap;
}

.admin-layout {
  display: grid;
  grid-template-columns: 360px minmax(0, 1fr);
  gap: 1.25rem;
  align-items: start;
}

.admin-list-panel {
  position: sticky;
  top: 110px;
  max-height: calc(100vh - 130px);
  overflow-y: auto;
}

.admin-search {
  margin-bottom: 0.75rem;
}

.admin-filters {
  display: flex;
  gap: 0.75rem;
  align-items: center;
  margin-bottom: 0.5rem;
}

.admin-select {
  width: auto;
  flex-shrink: 0;
}

.admin-rules {
  margin: 0 0 0.5rem;
}

.admin-pick {
  width: 100%;
  border: none;
  background: none;
  font: inherit;
  text-align: left;
  cursor: pointer;
  border-radius: 12px;
  padding-left: 0.4rem;
  padding-right: 0.4rem;
}

.admin-pick:hover,
.admin-pick.selected {
  background: var(--bg-hover);
}

.admin-pick .social-row-body,
.admin-pick .social-name,
.admin-pick .social-meta {
  display: block;
}

.admin-thumb {
  width: 40px;
  height: 60px;
  object-fit: cover;
  border-radius: 6px;
  flex-shrink: 0;
  background: var(--bg-secondary);
}

.admin-thumb.round {
  width: 44px;
  height: 44px;
  border-radius: 50%;
}

.admin-pill {
  display: inline-block;
  margin-left: 0.35rem;
  padding: 0.05rem 0.5rem;
  border-radius: 999px;
  font-size: 0.72rem;
  font-weight: 700;
  background: var(--bg-hover);
  color: var(--coral-deep);
}

.admin-pill.creator {
  background: rgba(245, 184, 46, 0.18);
  color: #b07d05;
}

.admin-pill.owner {
  background: rgba(43, 187, 173, 0.15);
  color: var(--teal-primary);
}

.admin-pill.warn {
  background: rgba(232, 163, 23, 0.16);
  color: #a86f00;
}

.admin-pill.danger {
  background: rgba(244, 67, 54, 0.14);
  color: var(--error-color);
}

.admin-pill.muted {
  background: var(--bg-secondary);
  color: var(--text-muted);
}

.admin-error {
  color: var(--error-color);
}

.admin-back {
  margin-bottom: 0.75rem;
}

.editor-head {
  display: flex;
  gap: 1rem;
  align-items: center;
  margin-bottom: 1.25rem;
}

.editor-head .social-kicker {
  margin-bottom: 0.15rem;
}

.editor-image {
  width: 64px;
  height: 96px;
  object-fit: cover;
  border-radius: 10px;
  background: var(--bg-secondary);
  flex-shrink: 0;
}

.editor-image.round {
  width: 80px;
  height: 80px;
  border-radius: 50%;
}

.admin-field {
  margin-bottom: 1rem;
}

.admin-field-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  margin-bottom: 0.35rem;
  font-weight: 600;
  color: var(--text-primary);
}

.admin-lock {
  font-size: 0.8rem;
  font-weight: 600;
  color: var(--coral-deep);
}

.admin-link {
  margin-left: 0.35rem;
  border: none;
  background: none;
  padding: 0;
  font: inherit;
  font-size: 0.9rem;
  color: var(--text-secondary);
  text-decoration: underline;
  cursor: pointer;
}

.editor-head .admin-link,
.admin-back {
  margin-left: 0;
}

.admin-preview {
  display: block;
  margin-top: 0.5rem;
  border-radius: 8px;
  max-height: 160px;
}

.admin-preview.posterPath,
.admin-preview.imagePath {
  width: 100px;
  object-fit: cover;
}

.admin-actions {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 0.5rem;
  position: sticky;
  bottom: 0;
  padding: 0.75rem 0;
  background: var(--bg-card);
}

.admin-actions .social-meta {
  margin-right: auto;
}

.admin-links {
  margin-top: 1.25rem;
  padding-top: 1.25rem;
  border-top: 1px solid var(--border-color);
}

.link-group + .link-group {
  margin-top: 1.1rem;
}

.link-title {
  font-size: 0.95rem;
  font-weight: 700;
  color: var(--text-primary);
  margin: 0 0 0.6rem;
}

.link-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
}

.link-chip {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  max-width: 240px;
  padding: 0.3rem 0.7rem 0.3rem 0.3rem;
  border: 1px solid var(--border-color);
  border-radius: 999px;
  background: var(--bg-parchment);
  font: inherit;
  text-align: left;
  cursor: pointer;
  transition: border-color 0.2s ease, background 0.2s ease;
}

.link-chip:hover {
  border-color: var(--border-hover);
  background: var(--bg-hover);
}

.chip-image {
  width: 28px;
  height: 38px;
  object-fit: cover;
  border-radius: 999px;
  flex-shrink: 0;
  background: var(--bg-secondary);
}

.chip-image.round {
  height: 28px;
}

.chip-text {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.chip-name,
.chip-note {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.chip-name {
  font-size: 0.85rem;
  font-weight: 600;
  color: var(--text-primary);
}

.chip-note {
  font-size: 0.72rem;
  color: var(--text-muted);
}

.user-item.banned .social-row {
  opacity: 0.7;
}

.user-actions {
  flex-wrap: wrap;
  justify-content: flex-end;
}

.btn-danger {
  background: var(--error-color);
  color: #fff;
}

.action-form {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.6rem;
  margin: 0 0 0.9rem 3.2rem;
  padding: 0.8rem;
  border-radius: 12px;
  background: var(--bg-secondary);
}

.action-form .input {
  flex: 1 1 220px;
}

.action-form .admin-select {
  flex: 0 0 auto;
}

.action-warning {
  flex-basis: 100%;
  margin: 0;
  color: var(--error-color);
}

.note-actions {
  display: flex;
  gap: 0.4rem;
  margin-left: auto;
}

.admin-pager {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: 0.75rem;
}

@media (max-width: 860px) {
  .admin-layout {
    grid-template-columns: 1fr;
  }

  .admin-list-panel {
    position: static;
    max-height: 420px;
  }

  .admin-filters {
    flex-direction: column;
    align-items: stretch;
  }

  .kind-tabs.compact {
    overflow-x: auto;
  }

  .action-form {
    margin-left: 0;
  }
}
</style>
