<!--
  Admin.vue — admin tools (view).

  Content: find a movie, series, or special and edit its title, synopsis, images,
  dates, and counts. Edited fields are locked so the hourly catalog sync keeps
  them; unlocking hands a field back to the sync.
  Users: search accounts and make them admins or regular users.
  Admin-only (role 'admin' or ADMIN_EMAILS); the server enforces access.
-->
<template>
  <div class="social-page">
    <div class="social-container">
      <!-- Header -->
      <header class="social-intro">
        <p class="social-kicker">Admin</p>
        <h1 class="social-title">Manage AniLounge</h1>
        <p class="social-subtitle">Edit catalog titles and choose who else can do this.</p>
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
      <div v-if="activeTab === 'content'" class="admin-layout">
        <section class="social-panel admin-list-panel" data-testid="admin-content-list">
          <div class="admin-filters">
            <input
              v-model="contentQuery"
              type="search"
              class="input"
              placeholder="Search titles"
              aria-label="Search titles"
            />
            <select v-model="contentType" class="input admin-select" aria-label="Type">
              <option value="">All types</option>
              <option value="movie">Movies</option>
              <option value="series">Series</option>
              <option value="special">Specials</option>
            </select>
          </div>
          <div v-if="contentLoading" class="social-loading"><div class="spinner"></div></div>
          <p v-else-if="!contentResults.items.length" class="social-empty">No titles found.</p>
          <ul v-else class="social-list">
            <li
              v-for="item in contentResults.items"
              :key="item.id"
              class="social-row admin-pick"
              :class="{ selected: editor?.id === item.id }"
              @click="openContent(item.id)"
            >
              <img
                :src="getPosterUrl(item.posterPath || '')"
                alt=""
                class="admin-thumb"
                loading="lazy"
              />
              <div class="social-row-body">
                <div class="social-name">{{ item.title }}</div>
                <div class="social-meta">
                  {{ KIND_LABELS[item.kind] }}
                  <template v-if="item.releaseDate"> · {{ yearOf(item.releaseDate) }}</template>
                  <span v-if="item.edited" class="admin-pill">Edited</span>
                </div>
              </div>
            </li>
          </ul>
          <PagerRow
            :page="contentResults.page"
            :pages="pageCount(contentResults)"
            @change="(page) => loadContent(page)"
          />
        </section>

        <!-- Title: Editor -->
        <section class="social-panel admin-editor" data-testid="admin-content-editor">
          <p v-if="!editor" class="social-empty">Pick a title to edit it.</p>
          <form v-else @submit.prevent="saveContent">
            <header class="social-panel-header">
              <div>
                <h2 class="social-panel-title">{{ editor.values.title }}</h2>
                <p class="social-panel-sub">
                  {{ KIND_LABELS[editor.kind] }} ·
                  <router-link :to="detailsRoute(editor)" target="_blank">View page</router-link>
                </p>
              </div>
            </header>

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
                v-if="field === 'overview'"
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
                v-if="(field === 'posterPath' || field === 'backdropPath') && draft[field]"
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
        </section>
      </div>

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
          <label class="admin-check">
            <input v-model="adminsOnly" type="checkbox" />
            Admins only
          </label>
        </div>
        <div v-if="usersLoading" class="social-loading"><div class="spinner"></div></div>
        <p v-else-if="!userResults.items.length" class="social-empty">No users found.</p>
        <ul v-else class="social-list">
          <li v-for="user in userResults.items" :key="user.id" class="social-row">
            <UserAvatar :src="user.profilePicture" :name="user.username" :size="40" />
            <div class="social-row-body">
              <router-link :to="profileRoute(user.username)" class="social-name">
                {{ user.username }}
              </router-link>
              <div class="social-meta">
                {{ user.email }}
                <span v-if="user.isOwner" class="admin-pill owner">Owner</span>
                <span v-else-if="user.role === 'admin'" class="admin-pill">Admin</span>
                <span v-if="!user.emailVerified" class="admin-pill muted">Unverified</span>
                <span v-if="user.isDemo" class="admin-pill muted">Demo</span>
              </div>
            </div>
            <span v-if="roleLockReason(user)" class="social-meta admin-role-note">
              {{ roleLockReason(user) }}
            </span>
            <button
              v-else-if="user.role === 'admin'"
              type="button"
              class="btn btn-ghost btn-small"
              :disabled="roleBusy === user.id"
              @click="changeRole(user, 'user')"
            >
              Remove admin
            </button>
            <button
              v-else
              type="button"
              class="btn btn-primary btn-small"
              :disabled="roleBusy === user.id"
              @click="changeRole(user, 'admin')"
            >
              Make admin
            </button>
          </li>
        </ul>
        <PagerRow
          :page="userResults.page"
          :pages="pageCount(userResults)"
          @change="(page) => loadUsers(page)"
        />
      </section>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, defineComponent, h, onMounted, onUnmounted, ref, watch } from 'vue'
import { useToast } from 'vue-toastification'
import UserAvatar from '@/components/UserAvatar.vue'
import { adminAPI, getImageUrl, getPosterUrl } from '@/services/api'
import { useAuthStore } from '@/stores/auth'
import { apiErrorMessage, profileRoute } from '@/utils/social'

defineOptions({ name: 'AdminPage' })

type Kind = 'movie' | 'series' | 'special'
type Page<T> = { items: T[]; page: number; pageSize: number; total: number }
type ContentHit = {
  id: string
  kind: Kind
  title: string
  posterPath: string | null
  releaseDate: string | null
  edited: boolean
}
type EditableContent = {
  id: string
  kind: Kind
  fields: string[]
  values: Record<string, string | number | null>
  locked: string[]
}
type AdminUser = {
  id: string
  username: string
  email: string
  profilePicture: string | null
  role: 'user' | 'admin'
  isOwner: boolean
  emailVerified: boolean
  isDemo: boolean
}

const TABS = [
  { id: 'content', label: 'Content' },
  { id: 'users', label: 'Users & roles' },
] as const
const KIND_LABELS: Record<Kind, string> = { movie: 'Movie', series: 'Series', special: 'Special' }
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
}
const NUMBER_FIELDS = ['runtime', 'episodeCount', 'seasonCount']
const SEARCH_DELAY_MS = 300

/** Prev/next pager shared by both lists. */
const PagerRow = defineComponent({
  props: { page: { type: Number, required: true }, pages: { type: Number, required: true } },
  emits: ['change'],
  setup(props, { emit }) {
    return () =>
      props.pages > 1
        ? h('div', { class: 'admin-pager' }, [
            h(
              'button',
              {
                type: 'button',
                class: 'btn btn-ghost btn-small',
                disabled: props.page <= 1,
                onClick: () => emit('change', props.page - 1),
              },
              'Previous',
            ),
            h('span', { class: 'social-meta' }, `Page ${props.page} of ${props.pages}`),
            h(
              'button',
              {
                type: 'button',
                class: 'btn btn-ghost btn-small',
                disabled: props.page >= props.pages,
                onClick: () => emit('change', props.page + 1),
              },
              'Next',
            ),
          ])
        : null
  },
})

const toast = useToast()
const authStore = useAuthStore()
const activeTab = ref<'content' | 'users'>('content')

const emptyPage = <T,>(): Page<T> => ({ items: [], page: 1, pageSize: 25, total: 0 })
const pageCount = (page: Page<unknown>) => Math.max(1, Math.ceil(page.total / page.pageSize))
const yearOf = (value: string) => new Date(value).getFullYear()
const inputType = (field: string) =>
  NUMBER_FIELDS.includes(field) ? 'number' : field === 'releaseDate' ? 'date' : 'text'
const detailsRoute = (item: { id: string; kind: Kind }) => ({
  name: item.kind === 'series' ? 'TVShowDetails' : 'MovieDetails',
  params: { id: item.id },
})

// --- Content ---------------------------------------------------------------

const contentQuery = ref('')
const contentType = ref('')
const contentResults = ref<Page<ContentHit>>(emptyPage())
const contentLoading = ref(false)
const editor = ref<EditableContent | null>(null)
const draft = ref<Record<string, string | number | null>>({})
const saving = ref(false)
let contentTimer: ReturnType<typeof setTimeout> | undefined
let contentSeq = 0

const loadContent = async (page = 1) => {
  const seq = ++contentSeq
  contentLoading.value = true
  try {
    const response = await adminAPI.searchContent({
      q: contentQuery.value.trim() || undefined,
      type: contentType.value || undefined,
      page,
    })
    if (seq === contentSeq) contentResults.value = response.data.data
  } catch (error) {
    if (seq === contentSeq) toast.error(apiErrorMessage(error, 'Could not load titles.'))
  } finally {
    if (seq === contentSeq) contentLoading.value = false
  }
}

watch([contentQuery, contentType], () => {
  clearTimeout(contentTimer)
  contentTimer = setTimeout(() => loadContent(1), SEARCH_DELAY_MS)
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

const openContent = async (id: string) => {
  if (dirtyFields.value.length && !window.confirm('Discard unsaved changes?')) return
  try {
    const response = await adminAPI.getContent(id)
    setEditor(response.data.data)
  } catch (error) {
    toast.error(apiErrorMessage(error, 'Could not load that title.'))
  }
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

const submit = async (body: { changes?: Record<string, unknown>; unlock?: string[] }) => {
  if (!editor.value) return
  saving.value = true
  try {
    const response = await adminAPI.updateContent(editor.value.id, body)
    setEditor(response.data.data)
    const hit = contentResults.value.items.find((item) => item.id === editor.value?.id)
    if (hit) {
      hit.title = String(editor.value!.values.title)
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
const adminsOnly = ref(false)
const userResults = ref<Page<AdminUser>>(emptyPage())
const usersLoading = ref(false)
const roleBusy = ref<string | null>(null)
let userTimer: ReturnType<typeof setTimeout> | undefined
let userSeq = 0

const loadUsers = async (page = 1) => {
  const seq = ++userSeq
  usersLoading.value = true
  try {
    const response = await adminAPI.listUsers({
      q: userQuery.value.trim() || undefined,
      admins: adminsOnly.value || undefined,
      page,
    })
    if (seq === userSeq) userResults.value = response.data.data
  } catch (error) {
    if (seq === userSeq) toast.error(apiErrorMessage(error, 'Could not load users.'))
  } finally {
    if (seq === userSeq) usersLoading.value = false
  }
}

watch([userQuery, adminsOnly], () => {
  clearTimeout(userTimer)
  userTimer = setTimeout(() => loadUsers(1), SEARCH_DELAY_MS)
})

watch(activeTab, (tab) => {
  if (tab === 'users' && !userResults.value.total && !usersLoading.value) loadUsers(1)
})

/** Why a user's role can't be changed here, mirroring the server's rules. */
const roleLockReason = (user: AdminUser) => {
  if (user.id === authStore.user?.id) return "That's you"
  if (user.isOwner) return 'Set by ADMIN_EMAILS'
  if (user.isDemo) return ''
  if (user.role !== 'admin' && !user.emailVerified) return 'Needs a verified email'
  return ''
}

const changeRole = async (user: AdminUser, role: 'user' | 'admin') => {
  const prompt =
    role === 'admin'
      ? `Make ${user.username} an admin? They'll be able to edit content and change roles.`
      : `Remove admin from ${user.username}?`
  if (!window.confirm(prompt)) return
  roleBusy.value = user.id
  try {
    const response = await adminAPI.setUserRole(user.id, role)
    Object.assign(user, response.data.data)
    toast.success(response.data.message)
  } catch (error) {
    toast.error(apiErrorMessage(error, 'Could not change the role.'))
  } finally {
    roleBusy.value = null
  }
}

onMounted(() => loadContent(1))
onUnmounted(() => {
  clearTimeout(contentTimer)
  clearTimeout(userTimer)
})
</script>

<style scoped>
.admin-tabs {
  display: flex;
  gap: 0.5rem;
  margin-bottom: 1.25rem;
}

.admin-tab {
  padding: 0.55rem 1.1rem;
  border-radius: 999px;
  border: 1px solid var(--border-color);
  background: var(--bg-card);
  color: var(--text-secondary);
  font: inherit;
  font-weight: 600;
  cursor: pointer;
}

.admin-tab.active {
  background: var(--coral-primary);
  border-color: var(--coral-primary);
  color: var(--text-on-accent);
}

.admin-layout {
  display: grid;
  grid-template-columns: 380px minmax(0, 1fr);
  gap: 1.25rem;
  align-items: start;
}

.admin-list-panel {
  position: sticky;
  top: 110px;
  max-height: calc(100vh - 130px);
  overflow-y: auto;
}

.admin-filters {
  display: flex;
  gap: 0.6rem;
  align-items: center;
  margin-bottom: 0.75rem;
}

.admin-select {
  width: auto;
  flex-shrink: 0;
}

.admin-check {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  white-space: nowrap;
  color: var(--text-secondary);
  font-weight: 600;
}

.admin-pick {
  cursor: pointer;
  border-radius: 12px;
  padding-left: 0.4rem;
  padding-right: 0.4rem;
}

.admin-pick:hover,
.admin-pick.selected {
  background: var(--bg-hover);
}

.admin-thumb {
  width: 40px;
  height: 60px;
  object-fit: cover;
  border-radius: 6px;
  flex-shrink: 0;
  background: var(--bg-secondary);
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

.admin-pill.owner {
  background: rgba(43, 187, 173, 0.15);
  color: var(--teal-primary);
}

.admin-pill.muted {
  background: var(--bg-secondary);
  color: var(--text-muted);
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
  color: var(--text-secondary);
  text-decoration: underline;
  cursor: pointer;
}

.admin-preview {
  display: block;
  margin-top: 0.5rem;
  border-radius: 8px;
  max-height: 160px;
}

.admin-preview.posterPath {
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
  padding-top: 0.75rem;
  background: var(--bg-card);
}

.admin-actions .social-meta {
  margin-right: auto;
}

.admin-role-note {
  white-space: nowrap;
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
    max-height: none;
  }

  .admin-filters {
    flex-wrap: wrap;
  }
}
</style>
