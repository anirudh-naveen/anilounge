<!--
  Inbox.vue — notifications, site news, and import clashes (view).

  Friend requests (answer them here) and acceptances, comments on your posts and
  replies to your comments, language warnings, and site news, newest first, with
  filters by type. Unresolved watchlist import clashes sit at the top with the clash
  picker until they're settled. Opening the inbox marks everything read; items that
  were new keep their highlight for this visit. Opened from the profile menu;
  requires sign-in.
-->
<template>
  <div class="social-page">
    <div class="social-container inbox-container">
      <!-- Header -->
      <header class="social-intro inbox-intro">
        <div>
          <p class="social-kicker">Your lounge</p>
          <h1 class="social-title">Inbox</h1>
          <p class="social-subtitle">Friend requests, replies, warnings, and site news.</p>
        </div>
      </header>

      <!-- Title: Import Clashes -->
      <section
        v-if="importClashes > 0"
        class="social-panel clashes-panel"
        data-testid="inbox-import-clashes"
      >
        <h2 class="social-panel-title">Finish your import</h2>
        <ImportConflicts @resolved="onClashesResolved" @loaded="onClashesLoaded" />
      </section>

      <!-- Title: Filters -->
      <nav class="inbox-filters" role="tablist" aria-label="Inbox filter">
        <button
          v-for="option in FILTERS"
          :key="option.value"
          type="button"
          role="tab"
          class="inbox-filter"
          :class="{ active: filter === option.value }"
          :aria-selected="filter === option.value"
          :data-testid="`inbox-filter-${option.value}`"
          @click="filter = option.value"
        >
          {{ option.label }}
        </button>
      </nav>

      <!-- Title: Items -->
      <section class="social-panel">
        <div v-if="loading" class="social-loading"><div class="spinner"></div></div>
        <p v-else-if="error" class="social-empty">{{ error }}</p>
        <p v-else-if="!visibleItems.length" class="social-empty" data-testid="inbox-empty">
          {{ filter === 'all' ? "You're all caught up." : 'Nothing here.' }}
        </p>
        <ul v-else class="social-list inbox-list" data-testid="inbox-list">
          <li
            v-for="item in visibleItems"
            :key="item.id"
            class="social-row inbox-row"
            :class="{ unread: !item.read }"
            :data-testid="`inbox-item-${item.kind}`"
          >
            <!-- Icon or avatar -->
            <UserAvatar
              v-if="item.actor"
              :src="item.actor.profilePicture"
              :name="item.actor.username"
              :size="40"
            />
            <span v-else class="inbox-icon" :class="item.kind" aria-hidden="true">
              {{ item.kind === 'announcement' ? '📣' : '⚠' }}
            </span>

            <div class="social-row-body">
              <!-- Title: Friend Request -->
              <template v-if="item.kind === 'friend_request' && item.actor">
                <p class="inbox-line">
                  <router-link :to="profileRoute(item.actor.username)" class="social-name">{{
                    item.actor.username
                  }}</router-link>
                  sent you a friend request.
                </p>
                <p v-if="item.requestStatus === 'accepted'" class="social-meta">
                  You're now friends.
                  <router-link :to="messageRoute(item.actor.id)">Send a message</router-link>
                </p>
                <p v-else-if="item.requestStatus === 'closed'" class="social-meta">
                  This request is closed.
                </p>
              </template>

              <!-- Title: Friend Accepted -->
              <template v-else-if="item.kind === 'friend_accepted' && item.actor">
                <p class="inbox-line">
                  <router-link :to="profileRoute(item.actor.username)" class="social-name">{{
                    item.actor.username
                  }}</router-link>
                  accepted your friend request.
                  <router-link :to="messageRoute(item.actor.id)">Say hi</router-link>
                </p>
              </template>

              <!-- Title: Comments -->
              <template
                v-else-if="
                  (item.kind === 'post_comment' || item.kind === 'comment_reply') && item.post
                "
              >
                <p class="inbox-line">
                  <router-link
                    v-if="item.actor"
                    :to="profileRoute(item.actor.username)"
                    class="social-name"
                    >{{ item.actor.username }}</router-link
                  >
                  <template v-else>Someone</template>
                  {{
                    item.kind === 'post_comment'
                      ? 'commented on your post'
                      : 'replied to your comment on'
                  }}
                  <router-link :to="commentRoute(item)" class="inbox-post">{{
                    item.post.title
                  }}</router-link>
                </p>
                <router-link
                  v-if="item.comment"
                  :to="commentRoute(item)"
                  class="inbox-quote"
                  data-testid="inbox-comment"
                >
                  {{ item.comment.excerpt }}
                </router-link>
              </template>

              <!-- Title: Language Warning -->
              <template v-else-if="item.kind === 'language_warning'">
                <p class="inbox-line">
                  <strong>
                    {{ item.detail?.category === 'slur' ? 'Slur' : 'Language' }} warning
                    <template v-if="item.detail?.count && item.detail?.limit">
                      {{ Math.min(item.detail.count, item.detail.limit) }} of
                      {{ item.detail.limit }}
                    </template>
                  </strong>
                </p>
                <p v-if="item.detail?.message" class="social-meta warning-message">
                  {{ item.detail.message }}
                </p>
                <p v-if="item.detail?.excerpt" class="inbox-quote static">
                  You sent: {{ item.detail.excerpt }}
                </p>
              </template>

              <!-- Title: Site News -->
              <template v-else-if="item.kind === 'announcement' && item.news">
                <p class="inbox-line">
                  <strong>{{ item.news.title }}</strong>
                </p>
                <p class="news-body" :class="{ clamped: !expanded.has(item.id) }">
                  {{ item.news.body }}
                </p>
                <button
                  v-if="item.news.body.length > NEWS_PREVIEW"
                  type="button"
                  class="news-toggle"
                  @click="toggleNews(item.id)"
                >
                  {{ expanded.has(item.id) ? 'Show less' : 'Read more' }}
                </button>
              </template>

              <span class="social-meta" :title="new Date(item.createdAt).toLocaleString()">
                {{ timeAgo(item.createdAt) }}
              </span>
            </div>

            <FriendButton
              v-if="
                item.kind === 'friend_request' && item.actor && item.requestStatus === 'pending'
              "
              :user-id="item.actor.id"
              :username="item.actor.username"
              relationship="incoming"
              @update:relationship="(value) => onRequestAnswered(item, value)"
            />
            <span v-if="!item.read" class="new-dot" aria-label="New"></span>
          </li>
        </ul>
        <div v-if="hasMore && !loading" class="load-more">
          <button
            type="button"
            class="btn btn-ghost btn-small"
            :disabled="loadingMore"
            data-testid="inbox-more"
            @click="loadMore"
          >
            Load older
          </button>
        </div>
      </section>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import FriendButton from '@/components/FriendButton.vue'
import ImportConflicts from '@/components/ImportConflicts.vue'
import UserAvatar from '@/components/UserAvatar.vue'
import { inboxAPI } from '@/services/api'
import { useInboxStore } from '@/stores/inbox'
import { useMessagesStore } from '@/stores/messages'
import type { InboxCounts, InboxItem, InboxKind, InboxPage } from '@/types/inbox'
import type { Relationship } from '@/types/social'
import { timeAgo } from '@/utils/homeFeed'
import { apiErrorMessage, profileRoute } from '@/utils/social'

defineOptions({ name: 'InboxPage' })

type Filter = 'all' | 'friends' | 'forum' | 'news' | 'account'

const FILTERS: { value: Filter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'friends', label: 'Friends' },
  { value: 'forum', label: 'Forum' },
  { value: 'news', label: 'News' },
  { value: 'account', label: 'Warnings' },
]
const FILTER_KINDS: Record<Exclude<Filter, 'all'>, InboxKind[]> = {
  friends: ['friend_request', 'friend_accepted'],
  forum: ['post_comment', 'comment_reply'],
  news: ['announcement'],
  account: ['language_warning'],
}
/** News longer than this starts collapsed. */
const NEWS_PREVIEW = 280

const inboxStore = useInboxStore()
const messagesStore = useMessagesStore()

const items = ref<InboxItem[]>([])
const hasMore = ref(false)
const importClashes = ref(0)
const loading = ref(true)
const loadingMore = ref(false)
const error = ref('')
const filter = ref<Filter>('all')
const expanded = reactive(new Set<string>())

const visibleItems = computed(() =>
  filter.value === 'all'
    ? items.value
    : items.value.filter((item) =>
        FILTER_KINDS[filter.value as Exclude<Filter, 'all'>].includes(item.kind),
      ),
)

const messageRoute = (userId: string) => ({ name: 'friends', query: { user: userId } })

const commentRoute = (item: InboxItem) => ({
  name: 'forumPost',
  params: { id: item.post?.id || '' },
  hash: item.comment ? `#comment-${item.comment.id}` : '',
})

const toggleNews = (id: string) => {
  if (expanded.has(id)) expanded.delete(id)
  else expanded.add(id)
}

/** Mark everything read now that the user has seen it (highlights stay for this visit). */
const markAllRead = async () => {
  try {
    const response = await inboxAPI.markRead()
    inboxStore.set(response.data.data as InboxCounts)
  } catch {
    // Unread state just lingers until the next visit.
  }
}

const load = async () => {
  loading.value = true
  error.value = ''
  try {
    const response = await inboxAPI.list()
    const page = response.data.data as InboxPage
    items.value = page.items
    hasMore.value = page.hasMore
    importClashes.value = page.importClashes
    if (page.items.some((item) => !item.read)) markAllRead()
  } catch (err) {
    error.value = apiErrorMessage(err, 'Could not load your inbox.')
  } finally {
    loading.value = false
  }
}

const loadMore = async () => {
  const last = items.value[items.value.length - 1]
  if (!last) return
  loadingMore.value = true
  try {
    const response = await inboxAPI.list(last.createdAt)
    const page = response.data.data as InboxPage
    const seen = new Set(items.value.map((item) => item.id))
    items.value.push(...page.items.filter((item) => !seen.has(item.id)))
    hasMore.value = page.hasMore
  } catch (err) {
    error.value = apiErrorMessage(err, 'Could not load older items.')
  } finally {
    loadingMore.value = false
  }
}

const onRequestAnswered = (item: InboxItem, value: Relationship) => {
  item.requestStatus = value === 'friends' ? 'accepted' : 'closed'
  messagesStore.refresh()
}

const onClashesLoaded = (count: number) => {
  importClashes.value = count
}

const onClashesResolved = () => {
  inboxStore.refresh()
}

onMounted(load)
</script>

<style scoped>
.inbox-container {
  max-width: 820px;
}

.clashes-panel {
  margin-bottom: 1.25rem;
  border-color: color-mix(in srgb, var(--coral-primary) 45%, var(--border-color));
}

.inbox-filters {
  display: flex;
  flex-wrap: wrap;
  gap: 0.35rem;
  margin-bottom: 1rem;
}

.inbox-filter {
  padding: 0.4rem 0.9rem;
  border: 1px solid var(--border-color);
  border-radius: 999px;
  background: none;
  font: inherit;
  font-size: 0.88rem;
  font-weight: 600;
  color: var(--text-secondary);
  cursor: pointer;
}

.inbox-filter.active {
  border-color: var(--coral-primary);
  background: var(--coral-primary);
  color: var(--text-on-accent);
}

.inbox-row {
  align-items: flex-start;
  position: relative;
}

.inbox-row.unread {
  background: color-mix(in srgb, var(--coral-primary) 6%, transparent);
  margin: 0 -0.75rem;
  padding-left: 0.75rem;
  padding-right: 0.75rem;
  border-radius: 12px;
}

.inbox-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 40px;
  flex-shrink: 0;
  border-radius: 50%;
  background: var(--bg-secondary);
  font-size: 1.1rem;
}

.inbox-icon.language_warning {
  background: color-mix(in srgb, var(--error-color) 14%, transparent);
  color: var(--error-color);
}

.inbox-line {
  margin: 0 0 0.2rem;
  color: var(--text-primary);
  line-height: 1.45;
}

.inbox-post {
  font-weight: 600;
  color: var(--text-primary);
}

.inbox-quote {
  display: block;
  margin: 0.3rem 0;
  padding: 0.45rem 0.75rem;
  border-left: 3px solid var(--coral-primary);
  border-radius: 0 10px 10px 0;
  background: var(--bg-secondary);
  color: var(--text-secondary);
  text-decoration: none;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}

.inbox-quote.static {
  border-left-color: var(--error-color);
}

.warning-message {
  margin: 0 0 0.2rem;
  line-height: 1.45;
}

.news-body {
  margin: 0.2rem 0;
  color: var(--text-secondary);
  line-height: 1.55;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}

.news-body.clamped {
  display: -webkit-box;
  -webkit-line-clamp: 4;
  line-clamp: 4;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.news-toggle {
  padding: 0;
  border: 0;
  background: none;
  font: inherit;
  font-size: 0.85rem;
  font-weight: 600;
  color: var(--coral-deep);
  cursor: pointer;
}

.new-dot {
  width: 9px;
  height: 9px;
  margin-top: 0.4rem;
  flex-shrink: 0;
  border-radius: 50%;
  background: var(--coral-primary);
}

.load-more {
  display: flex;
  justify-content: center;
  margin-top: 1rem;
}
</style>
