<!--
  MessagesPanel.vue — direct messages between friends (component).

  The Messages tab of the Friends page. Conversation list on the left (incoming
  friend requests first, so a request's note reads like an opening message), the
  open thread on the right. Only friends can send; history stays readable after an
  unfriend. The open thread polls for new messages. `?user=<id>` on the Friends
  route picks the open thread (a query, so switching chats doesn't remount the page).
-->
<template>
  <div class="messages-layout" :class="{ 'thread-open': !!activeId }">
    <!-- Title: Conversation List -->
    <aside class="social-panel conversation-panel" data-testid="conversation-list">
      <header class="social-panel-header">
        <h2 class="social-panel-title">Chats</h2>
        <button
          type="button"
          class="btn btn-primary btn-small"
          data-testid="new-message"
          @click="togglePicker"
        >
          {{ pickerOpen ? 'Close' : 'New message' }}
        </button>
      </header>

      <!-- Title: Friend Picker -->
      <div v-if="pickerOpen" class="friend-picker" data-testid="friend-picker">
        <input
          v-model="pickerTerm"
          type="search"
          class="input"
          placeholder="Search your friends"
          aria-label="Search your friends"
        />
        <div v-if="friendsLoading" class="social-loading"><div class="spinner"></div></div>
        <p v-else-if="!pickerFriends.length" class="social-empty">
          <template v-if="friends.length">No friends match.</template>
          <template v-else>
            Add friends to message them.
            <router-link :to="{ name: 'friends', query: { tab: 'friends' } }"
              >Find people</router-link
            >
          </template>
        </p>
        <ul v-else class="social-list picker-list">
          <li v-for="friend in pickerFriends" :key="friend.user.id">
            <button type="button" class="picker-row" @click="openThread(friend.user.id)">
              <UserAvatar
                :src="friend.user.profilePicture"
                :name="friend.user.username"
                :size="32"
              />
              <span class="social-name">{{ friend.user.username }}</span>
            </button>
          </li>
        </ul>
      </div>

      <div v-if="listLoading" class="social-loading"><div class="spinner"></div></div>
      <template v-else>
        <!-- Title: Requests -->
        <template v-if="list.requests.length">
          <h3 class="conversation-heading">
            Friend requests <span class="social-count">{{ list.requests.length }}</span>
          </h3>
          <ul class="conversation-list" data-testid="message-requests">
            <li v-for="request in list.requests" :key="`r-${request.user.id}`">
              <button
                type="button"
                class="conversation-row"
                :class="{ active: activeId === request.user.id }"
                @click="openThread(request.user.id)"
              >
                <UserAvatar
                  :src="request.user.profilePicture"
                  :name="request.user.username"
                  :size="40"
                />
                <span class="conversation-body">
                  <span class="conversation-top">
                    <span class="social-name">{{ request.user.username }}</span>
                    <span class="social-meta">{{ timeAgo(request.at) }}</span>
                  </span>
                  <span class="conversation-preview unread">
                    {{ request.message || 'Wants to be friends' }}
                  </span>
                </span>
              </button>
            </li>
          </ul>
        </template>

        <!-- Title: Conversations -->
        <h3 v-if="list.requests.length" class="conversation-heading">Conversations</h3>
        <p v-if="!list.conversations.length" class="social-empty">
          No messages yet. Start one with a friend.
        </p>
        <ul v-else class="conversation-list">
          <li v-for="convo in list.conversations" :key="convo.user.id">
            <button
              type="button"
              class="conversation-row"
              :class="{ active: activeId === convo.user.id }"
              :data-testid="`conversation-${convo.user.username}`"
              @click="openThread(convo.user.id)"
            >
              <UserAvatar :src="convo.user.profilePicture" :name="convo.user.username" :size="40" />
              <span class="conversation-body">
                <span class="conversation-top">
                  <span class="social-name">{{ convo.user.username }}</span>
                  <span class="social-meta">{{ timeAgo(convo.lastMessage.at) }}</span>
                </span>
                <span class="conversation-preview" :class="{ unread: convo.unread > 0 }">
                  <template v-if="convo.lastMessage.fromMe">You: </template
                  >{{ convo.lastMessage.body }}
                </span>
              </span>
              <span v-if="convo.unread" class="social-count">{{ convo.unread }}</span>
            </button>
          </li>
        </ul>
      </template>
    </aside>

    <!-- Title: Thread -->
    <section class="social-panel thread-panel" data-testid="message-thread">
      <p v-if="!activeId" class="social-empty thread-placeholder">
        Pick a conversation, or start a new one.
      </p>
      <div v-else-if="threadLoading && !thread" class="social-loading">
        <div class="spinner"></div>
      </div>
      <template v-else-if="thread">
        <header class="thread-header">
          <button
            type="button"
            class="btn btn-ghost btn-small thread-back"
            aria-label="Back to chats"
            @click="closeThread"
          >
            ←
          </button>
          <UserAvatar :src="thread.user.profilePicture" :name="thread.user.username" :size="40" />
          <router-link :to="profileRoute(thread.user.username)" class="social-name">
            {{ thread.user.username }}
            <RoleBadge :username="thread.user.username" />
          </router-link>
        </header>

        <div ref="scroller" class="thread-scroll" data-testid="thread-messages">
          <div v-if="thread.hasMore" class="load-older">
            <button
              type="button"
              class="btn btn-ghost btn-small"
              :disabled="loadingOlder"
              @click="loadOlder"
            >
              Load older messages
            </button>
          </div>

          <ul class="bubble-list">
            <li
              v-for="(message, index) in thread.messages"
              :key="message.id"
              class="bubble-row"
              :class="{ mine: message.fromMe }"
            >
              <p
                v-if="showDayBreak(index)"
                class="day-break social-meta"
                :data-testid="`day-${index}`"
              >
                {{ formatDay(message.at) }}
              </p>
              <div class="bubble" :title="new Date(message.at).toLocaleString()">
                {{ message.body }}
              </div>
              <span
                v-if="message.fromMe && index === lastMineIndex"
                class="social-meta bubble-status"
              >
                {{ message.readAt ? 'Seen' : 'Sent' }} · {{ timeAgo(message.at) }}
              </span>
            </li>
          </ul>

          <!-- Title: Friend Request -->
          <div v-if="thread.request" class="request-card" data-testid="thread-request">
            <p class="social-meta">
              {{
                thread.request.fromMe
                  ? 'You sent a friend request'
                  : `${thread.user.username} sent you a friend request`
              }}
              · {{ timeAgo(thread.request.at) }} · Expires
              {{ timeUntil(new Date(thread.request.expiresAt)) }}
            </p>
            <p v-if="thread.request.message" class="social-note">
              {{ thread.request.message }}
            </p>
            <FriendButton
              :user-id="thread.user.id"
              :username="thread.user.username"
              :relationship="thread.relationship"
              @update:relationship="onRelationshipChange"
            />
          </div>

          <p
            v-if="!thread.messages.length && !thread.request && thread.canMessage"
            class="social-empty"
          >
            Say hi to {{ thread.user.username }}.
          </p>
        </div>

        <!-- Title: Composer -->
        <form
          v-if="thread.canMessage"
          class="composer"
          data-testid="message-composer"
          @submit.prevent="send"
        >
          <textarea
            ref="composerInput"
            v-model="draft"
            class="input social-textarea composer-input"
            rows="1"
            :maxlength="MESSAGE_MAX"
            :placeholder="`Message ${thread.user.username}`"
            aria-label="Message"
            @keydown.enter.exact.prevent="send"
          ></textarea>
          <div class="composer-actions">
            <span
              v-if="draft.length > MESSAGE_MAX * 0.8"
              class="social-char-count"
              :class="{ over: draft.length >= MESSAGE_MAX }"
              >{{ draft.length }}/{{ MESSAGE_MAX }}</span
            >
            <button
              type="submit"
              class="btn btn-primary btn-small"
              :disabled="sending || !draft.trim()"
              data-testid="message-send"
            >
              Send
            </button>
          </div>
        </form>
        <p v-else class="social-meta composer-locked" data-testid="composer-locked">
          {{
            thread.relationship === 'incoming'
              ? 'Accept the request to start chatting.'
              : thread.relationship === 'outgoing'
                ? 'You can chat once they accept your request.'
                : `You and ${thread.user.username} aren't friends, so you can't send messages.`
          }}
        </p>
      </template>
    </section>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useToast } from 'vue-toastification'
import FriendButton from '@/components/FriendButton.vue'
import RoleBadge from '@/components/RoleBadge.vue'
import UserAvatar from '@/components/UserAvatar.vue'
import { friendsAPI, messagesAPI } from '@/services/api'
import { useMessagesStore } from '@/stores/messages'
import type {
  ConversationsPayload,
  DirectMessage,
  FriendEntry,
  MessageThread,
  Relationship,
} from '@/types/social'
import { timeAgo, timeUntil } from '@/utils/homeFeed'
import { apiErrorMessage, profileRoute } from '@/utils/social'

defineOptions({ name: 'MessagesPanel' })

const MESSAGE_MAX = 2000
const THREAD_POLL_MS = 8000
const LIST_POLL_MS = 30000

const route = useRoute()
const router = useRouter()
const toast = useToast()
const messagesStore = useMessagesStore()

const list = ref<ConversationsPayload>({ conversations: [], requests: [] })
const listLoading = ref(true)

const thread = ref<MessageThread | null>(null)
const threadLoading = ref(false)
const loadingOlder = ref(false)
const scroller = ref<HTMLElement | null>(null)
const composerInput = ref<HTMLTextAreaElement | null>(null)
const draft = ref('')
const sending = ref(false)

const pickerOpen = ref(false)
const pickerTerm = ref('')
const friends = ref<FriendEntry[]>([])
const friendsLoading = ref(false)

let threadTimer: ReturnType<typeof setInterval> | undefined
let listTimer: ReturnType<typeof setInterval> | undefined
/** Bumped on every thread switch so stale responses are dropped. */
let threadSeq = 0

const activeId = computed(() => {
  const id = route.query.user
  return typeof id === 'string' && id ? id : null
})

const pickerFriends = computed(() => {
  const term = pickerTerm.value.trim().toLowerCase()
  return term
    ? friends.value.filter((friend) => friend.user.username.toLowerCase().includes(term))
    : friends.value
})

const lastMineIndex = computed(() => {
  const messages = thread.value?.messages || []
  for (let i = messages.length - 1; i >= 0; i -= 1) if (messages[i]?.fromMe) return i
  return -1
})

const dayKey = (at: string) => new Date(at).toDateString()

const showDayBreak = (index: number) => {
  const messages = thread.value?.messages || []
  const current = messages[index]
  if (!current) return false
  const previous = messages[index - 1]
  return !previous || dayKey(previous.at) !== dayKey(current.at)
}

const formatDay = (at: string) => {
  const date = new Date(at)
  const today = new Date()
  if (date.toDateString() === today.toDateString()) return 'Today'
  const yesterday = new Date(today)
  yesterday.setDate(today.getDate() - 1)
  if (date.toDateString() === yesterday.toDateString()) return 'Yesterday'
  return date.toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    ...(date.getFullYear() === today.getFullYear() ? {} : { year: 'numeric' }),
  })
}

const isNearBottom = () => {
  const el = scroller.value
  return !el || el.scrollHeight - el.scrollTop - el.clientHeight < 80
}

const scrollToBottom = async () => {
  await nextTick()
  if (scroller.value) scroller.value.scrollTop = scroller.value.scrollHeight
}

/** Append messages the thread doesn't have yet. */
const mergeNewer = (incoming: DirectMessage[]) => {
  if (!thread.value || !incoming.length) return false
  const seen = new Set(thread.value.messages.map((message) => message.id))
  const fresh = incoming.filter((message) => !seen.has(message.id))
  thread.value.messages.push(...fresh)
  return fresh.length > 0
}

const loadList = async () => {
  try {
    const response = await messagesAPI.list()
    list.value = response.data.data as ConversationsPayload
  } catch (error) {
    if (listLoading.value) toast.error(apiErrorMessage(error, 'Could not load messages.'))
  } finally {
    listLoading.value = false
  }
}

const loadThread = async (userId: string) => {
  const seq = ++threadSeq
  thread.value = null
  threadLoading.value = true
  draft.value = ''
  try {
    const response = await messagesAPI.thread(userId)
    if (seq !== threadSeq) return
    thread.value = response.data.data as MessageThread
    await scrollToBottom()
    clearUnread(userId)
    messagesStore.refresh()
  } catch (error) {
    if (seq !== threadSeq) return
    toast.error(apiErrorMessage(error, 'Could not load this conversation.'))
    router.replace({ name: 'friends' })
  } finally {
    if (seq === threadSeq) threadLoading.value = false
  }
}

/** Fetch anything newer than the last message in the open thread. */
const pollThread = async () => {
  const userId = activeId.value
  if (!thread.value || !userId || document.hidden) return
  const seq = threadSeq
  const last = thread.value.messages[thread.value.messages.length - 1]
  try {
    const response = await messagesAPI.thread(userId, last ? { after: last.id } : {})
    if (seq !== threadSeq || !thread.value) return
    const data = response.data.data as MessageThread
    const stick = isNearBottom()
    // Without a cursor the server returns the newest page; merging dedupes either way.
    const changed = mergeNewer(data.messages)
    // Read receipts and relationship can change without new messages.
    const readIds = new Map(data.messages.map((message) => [message.id, message.readAt]))
    for (const message of thread.value.messages) {
      if (message.fromMe && !message.readAt && readIds.get(message.id)) {
        message.readAt = readIds.get(message.id) || null
      }
    }
    thread.value.relationship = data.relationship
    thread.value.canMessage = data.canMessage
    thread.value.request = data.request
    if (changed) {
      if (stick) await scrollToBottom()
      clearUnread(userId)
      loadList()
    }
  } catch {
    // Polling is best-effort; the next tick retries.
  }
}

const loadOlder = async () => {
  const userId = activeId.value
  const first = thread.value?.messages[0]
  if (!thread.value || !userId || !first) return
  const seq = threadSeq
  loadingOlder.value = true
  const el = scroller.value
  const fromBottom = el ? el.scrollHeight - el.scrollTop : 0
  try {
    const response = await messagesAPI.thread(userId, { before: first.id })
    if (seq !== threadSeq || !thread.value) return
    const data = response.data.data as MessageThread
    const seen = new Set(thread.value.messages.map((message) => message.id))
    thread.value.messages.unshift(...data.messages.filter((message) => !seen.has(message.id)))
    thread.value.hasMore = data.hasMore
    await nextTick()
    if (el) el.scrollTop = el.scrollHeight - fromBottom
  } catch (error) {
    toast.error(apiErrorMessage(error, 'Could not load older messages.'))
  } finally {
    loadingOlder.value = false
  }
}

const send = async () => {
  const userId = activeId.value
  const body = draft.value.trim()
  if (!thread.value || !userId || !body || sending.value) return
  sending.value = true
  try {
    const response = await messagesAPI.send(userId, body)
    mergeNewer([response.data.data as DirectMessage])
    draft.value = ''
    await scrollToBottom()
    loadList()
  } catch (error) {
    toast.error(apiErrorMessage(error, 'Could not send the message.'))
  } finally {
    sending.value = false
    composerInput.value?.focus()
  }
}

const clearUnread = (userId: string) => {
  const convo = list.value.conversations.find((entry) => entry.user.id === userId)
  if (convo) convo.unread = 0
}

const openThread = (userId: string) => {
  pickerOpen.value = false
  pickerTerm.value = ''
  if (userId !== activeId.value) router.push({ name: 'friends', query: { user: userId } })
}

const closeThread = () => router.push({ name: 'friends' })

const togglePicker = async () => {
  pickerOpen.value = !pickerOpen.value
  if (!pickerOpen.value || friends.value.length) return
  friendsLoading.value = true
  try {
    const response = await friendsAPI.list()
    friends.value = response.data.data.friends as FriendEntry[]
  } catch (error) {
    toast.error(apiErrorMessage(error, 'Could not load friends.'))
  } finally {
    friendsLoading.value = false
  }
}

const onRelationshipChange = (value: Relationship) => {
  const userId = activeId.value
  if (thread.value) thread.value.relationship = value
  friends.value = []
  loadList()
  messagesStore.refresh()
  // Accepting turns the request note into the first message.
  if (userId) loadThread(userId)
}

watch(
  activeId,
  (userId) => {
    if (userId) loadThread(userId)
    else {
      threadSeq += 1
      thread.value = null
    }
  },
  { immediate: true },
)

onMounted(() => {
  loadList()
  threadTimer = setInterval(pollThread, THREAD_POLL_MS)
  listTimer = setInterval(() => {
    if (!document.hidden) loadList()
  }, LIST_POLL_MS)
})

onUnmounted(() => {
  clearInterval(threadTimer)
  clearInterval(listTimer)
})
</script>

<style scoped>
.messages-layout {
  display: grid;
  grid-template-columns: 340px minmax(0, 1fr);
  gap: 1.25rem;
  align-items: start;
}

.conversation-panel {
  max-height: calc(100vh - 140px);
  overflow-y: auto;
  position: sticky;
  top: 110px;
}

.social-panel + .social-panel {
  margin-top: 0;
}

.conversation-panel .social-panel-header {
  align-items: center;
}

.friend-picker {
  margin-bottom: 1rem;
  padding-bottom: 1rem;
  border-bottom: 1px solid var(--border-color);
}

.picker-list {
  margin-top: 0.5rem;
  max-height: 220px;
  overflow-y: auto;
}

.picker-row {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  width: 100%;
  padding: 0.45rem 0.5rem;
  border: 0;
  border-radius: 10px;
  background: none;
  cursor: pointer;
  text-align: left;
  font: inherit;
}

.picker-row:hover {
  background: var(--bg-hover);
}

.conversation-heading {
  font-size: 0.75rem;
  font-weight: 700;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--text-muted);
  margin: 0.75rem 0 0.4rem;
}

.conversation-list {
  list-style: none;
  margin: 0;
  padding: 0;
}

.conversation-row {
  display: flex;
  align-items: center;
  gap: 0.7rem;
  width: 100%;
  padding: 0.6rem;
  border: 0;
  border-radius: 12px;
  background: none;
  cursor: pointer;
  text-align: left;
  font: inherit;
  color: inherit;
}

.conversation-row:hover {
  background: var(--bg-hover);
}

.conversation-row.active {
  background: var(--bg-secondary);
}

.conversation-body {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 0.15rem;
}

.conversation-top {
  display: flex;
  justify-content: space-between;
  gap: 0.5rem;
}

.conversation-preview {
  font-size: 0.85rem;
  color: var(--text-secondary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.conversation-preview.unread {
  color: var(--text-primary);
  font-weight: 600;
}

.thread-panel {
  display: flex;
  flex-direction: column;
  height: calc(100vh - 140px);
  min-height: 420px;
  padding: 0;
  overflow: hidden;
}

.thread-placeholder {
  margin: auto;
}

.thread-header {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 1rem 1.25rem;
  border-bottom: 1px solid var(--border-color);
}

.thread-back {
  display: none;
}

.thread-scroll {
  flex: 1;
  overflow-y: auto;
  padding: 1rem 1.25rem;
}

.load-older {
  display: flex;
  justify-content: center;
  margin-bottom: 0.75rem;
}

.bubble-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
}

.bubble-row {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
}

.bubble-row.mine {
  align-items: flex-end;
}

.day-break {
  align-self: center;
  margin: 0.75rem 0 0.35rem;
}

.bubble {
  max-width: min(75%, 520px);
  padding: 0.55rem 0.85rem;
  border-radius: 16px 16px 16px 4px;
  background: var(--bg-secondary);
  color: var(--text-primary);
  line-height: 1.45;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}

.mine .bubble {
  border-radius: 16px 16px 4px 16px;
  background: var(--coral-primary);
  color: var(--text-on-accent);
}

.bubble-status {
  margin-top: 0.15rem;
}

.request-card {
  margin-top: 1rem;
  padding: 0.9rem 1rem;
  border: 1px dashed var(--border-color);
  border-radius: 14px;
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
  align-items: flex-start;
}

.request-card .social-note {
  margin: 0;
}

.composer {
  display: flex;
  align-items: flex-end;
  gap: 0.6rem;
  padding: 0.85rem 1.25rem;
  border-top: 1px solid var(--border-color);
}

.composer-input {
  flex: 1;
  min-height: 2.6rem;
  max-height: 10rem;
}

.composer-actions {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 0.25rem;
}

.composer-locked {
  padding: 1rem 1.25rem;
  border-top: 1px solid var(--border-color);
  text-align: center;
}

@media (max-width: 860px) {
  .messages-layout {
    grid-template-columns: 1fr;
  }

  .conversation-panel {
    position: static;
    max-height: none;
  }

  .messages-layout.thread-open .conversation-panel,
  .messages-layout:not(.thread-open) .thread-panel {
    display: none;
  }

  .thread-panel {
    height: calc(100dvh - 120px);
  }

  .thread-back {
    display: inline-flex;
  }

  .bubble {
    max-width: 85%;
  }
}
</style>
