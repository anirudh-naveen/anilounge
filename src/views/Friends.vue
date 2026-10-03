<!--
  Friends.vue — friends and friend requests (view).

  Find people by username and send a request with an optional note, answer
  incoming requests, manage the friends list, and cancel sent requests.
  Opened from the profile menu; requires sign-in.
-->
<template>
  <div class="social-page">
    <div class="social-container">
      <!-- Header -->
      <header class="social-intro">
        <p class="social-kicker">Your circle</p>
        <h1 class="social-title">Friends</h1>
        <p class="social-subtitle">Friends see each other's watchlist updates on Home.</p>
      </header>

      <div class="friends-layout">
        <div class="friends-main">
          <!-- Requests -->
          <!-- Title: Incoming Requests -->
          <section v-if="data.incoming.length" class="social-panel" data-testid="incoming-requests">
            <header class="social-panel-header">
              <div>
                <h2 class="social-panel-title">
                  Friend requests <span class="social-count">{{ data.incoming.length }}</span>
                </h2>
                <p class="social-panel-sub">
                  People who'd like to add you. Requests expire after a week.
                </p>
              </div>
            </header>
            <ul class="social-list">
              <li v-for="request in data.incoming" :key="request.user.id" class="social-row">
                <UserAvatar
                  :src="request.user.profilePicture"
                  :name="request.user.username"
                  :size="44"
                />
                <div class="social-row-body">
                  <router-link :to="profileRoute(request.user.username)" class="social-name">
                    {{ request.user.username }}
                    <RoleBadge :username="request.user.username" />
                  </router-link>
                  <div class="social-meta">
                    {{ timeAgo(request.at) }} · Expires {{ timeUntil(new Date(request.expiresAt)) }}
                  </div>
                  <p v-if="request.message" class="social-note">{{ request.message }}</p>
                </div>
                <FriendButton
                  :user-id="request.user.id"
                  :username="request.user.username"
                  relationship="incoming"
                  @update:relationship="load"
                />
              </li>
            </ul>
          </section>

          <!-- Friends -->
          <!-- Title: Friends List -->
          <section class="social-panel" data-testid="friends-list">
            <header class="social-panel-header">
              <div>
                <h2 class="social-panel-title">
                  Your friends
                  <span v-if="data.friends.length" class="friend-total">{{
                    data.friends.length
                  }}</span>
                </h2>
              </div>
            </header>
            <div v-if="loading" class="social-loading"><div class="spinner"></div></div>
            <p v-else-if="!data.friends.length" class="social-empty">
              No friends yet. Search for someone by username to send a request.
            </p>
            <ul v-else class="social-list">
              <li v-for="friend in data.friends" :key="friend.user.id" class="social-row">
                <UserAvatar
                  :src="friend.user.profilePicture"
                  :name="friend.user.username"
                  :size="44"
                />
                <div class="social-row-body">
                  <router-link :to="profileRoute(friend.user.username)" class="social-name">
                    {{ friend.user.username }}
                    <RoleBadge :username="friend.user.username" />
                  </router-link>
                  <div class="social-meta">Friends since {{ formatDate(friend.since) }}</div>
                </div>
                <FriendButton
                  :user-id="friend.user.id"
                  :username="friend.user.username"
                  relationship="friends"
                  @update:relationship="load"
                />
              </li>
            </ul>
          </section>

          <!-- Title: Sent Requests -->
          <section v-if="data.outgoing.length" class="social-panel" data-testid="outgoing-requests">
            <header class="social-panel-header">
              <div>
                <h2 class="social-panel-title">Sent requests</h2>
                <p class="social-panel-sub">Waiting for a reply.</p>
              </div>
            </header>
            <ul class="social-list">
              <li v-for="request in data.outgoing" :key="request.user.id" class="social-row">
                <UserAvatar
                  :src="request.user.profilePicture"
                  :name="request.user.username"
                  :size="36"
                />
                <div class="social-row-body">
                  <router-link :to="profileRoute(request.user.username)" class="social-name">
                    {{ request.user.username }}
                    <RoleBadge :username="request.user.username" />
                  </router-link>
                  <div class="social-meta">
                    Sent {{ timeAgo(request.at) }} · Expires
                    {{ timeUntil(new Date(request.expiresAt)) }}
                  </div>
                </div>
                <FriendButton
                  :user-id="request.user.id"
                  :username="request.user.username"
                  relationship="outgoing"
                  @update:relationship="load"
                />
              </li>
            </ul>
          </section>
        </div>

        <!-- Search -->
        <!-- Title: Find People -->
        <aside class="social-panel friends-search" data-testid="friend-search">
          <h2 class="social-panel-title">Find people</h2>
          <p class="social-panel-sub">Search by username.</p>
          <input
            v-model="searchTerm"
            type="search"
            class="input search-input"
            placeholder="Username"
            maxlength="40"
            aria-label="Search users by username"
            data-testid="friend-search-input"
          />
          <p v-if="searchTerm.trim().length === 1" class="social-meta">Keep typing…</p>
          <div v-else-if="searching" class="social-loading"><div class="spinner"></div></div>
          <p v-else-if="searchTerm.trim().length >= 2 && !results.length" class="social-empty">
            No one found.
          </p>
          <ul v-else class="social-list">
            <li v-for="hit in results" :key="hit.id" class="social-row search-row">
              <UserAvatar :src="hit.profilePicture" :name="hit.username" :size="36" />
              <div class="social-row-body">
                <router-link :to="profileRoute(hit.username)" class="social-name">
                  {{ hit.username }}
                  <RoleBadge :username="hit.username" />
                </router-link>
                <!-- Title: Request Note -->
                <form
                  v-if="composingFor === hit.id"
                  class="note-form"
                  @submit.prevent="sendWithNote(hit)"
                >
                  <textarea
                    v-model="note"
                    class="input social-textarea"
                    rows="2"
                    :maxlength="NOTE_MAX"
                    placeholder="Add a note (optional)"
                    aria-label="Note with your friend request"
                  ></textarea>
                  <div class="note-actions">
                    <span class="social-char-count">{{ note.length }}/{{ NOTE_MAX }}</span>
                    <button type="button" class="btn btn-ghost btn-small" @click="closeNote">
                      Cancel
                    </button>
                    <button
                      type="submit"
                      class="btn btn-primary btn-small"
                      :disabled="sending"
                      data-testid="friend-send-note"
                    >
                      Send request
                    </button>
                  </div>
                </form>
              </div>
              <button
                v-if="hit.relationship === 'none' && composingFor !== hit.id"
                type="button"
                class="btn btn-primary btn-small"
                data-testid="friend-compose"
                @click="openNote(hit.id)"
              >
                Add friend
              </button>
              <FriendButton
                v-else-if="hit.relationship !== 'none'"
                :user-id="hit.id"
                :username="hit.username"
                :relationship="hit.relationship"
                @update:relationship="(value) => onSearchChange(hit, value)"
              />
            </li>
          </ul>
        </aside>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { onMounted, onUnmounted, ref, watch } from 'vue'
import { useToast } from 'vue-toastification'
import FriendButton from '@/components/FriendButton.vue'
import UserAvatar from '@/components/UserAvatar.vue'
import RoleBadge from '@/components/RoleBadge.vue'
import { friendsAPI } from '@/services/api'
import type { FriendsPayload, Relationship, UserSearchHit } from '@/types/social'
import { timeAgo, timeUntil } from '@/utils/homeFeed'
import { apiErrorMessage, profileRoute } from '@/utils/social'

defineOptions({ name: 'FriendsPage' })

const NOTE_MAX = 300
const SEARCH_DELAY_MS = 300

const toast = useToast()

const data = ref<FriendsPayload>({ friends: [], incoming: [], outgoing: [] })
const loading = ref(true)

const searchTerm = ref('')
const results = ref<UserSearchHit[]>([])
const searching = ref(false)
let searchTimer: ReturnType<typeof setTimeout> | undefined
let searchSeq = 0

const composingFor = ref<string | null>(null)
const note = ref('')
const sending = ref(false)

const formatDate = (value: string) =>
  new Date(value).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })

const load = async () => {
  try {
    const response = await friendsAPI.list()
    data.value = response.data.data as FriendsPayload
  } catch (error) {
    toast.error(apiErrorMessage(error, 'Could not load friends.'))
  } finally {
    loading.value = false
  }
}

const runSearch = async (term: string) => {
  const seq = ++searchSeq
  searching.value = true
  try {
    const response = await friendsAPI.search(term)
    if (seq === searchSeq) results.value = response.data.data as UserSearchHit[]
  } catch (error) {
    if (seq === searchSeq) toast.error(apiErrorMessage(error, 'Search failed.'))
  } finally {
    if (seq === searchSeq) searching.value = false
  }
}

watch(searchTerm, (value) => {
  clearTimeout(searchTimer)
  const term = value.trim()
  if (term.length < 2) {
    searchSeq += 1
    results.value = []
    searching.value = false
    return
  }
  searchTimer = setTimeout(() => runSearch(term), SEARCH_DELAY_MS)
})

const openNote = (userId: string) => {
  composingFor.value = userId
  note.value = ''
}

const closeNote = () => {
  composingFor.value = null
  note.value = ''
}

const sendWithNote = async (hit: UserSearchHit) => {
  sending.value = true
  try {
    const response = await friendsAPI.sendRequest(hit.id, note.value.trim() || undefined)
    hit.relationship = response.data.data.relationship as Relationship
    toast.success(response.data.message)
    closeNote()
    await load()
  } catch (error) {
    toast.error(apiErrorMessage(error, 'Could not send the friend request.'))
  } finally {
    sending.value = false
  }
}

const onSearchChange = (hit: UserSearchHit, value: Relationship) => {
  hit.relationship = value
  load()
}

onMounted(load)
onUnmounted(() => clearTimeout(searchTimer))
</script>

<style scoped>
.friends-layout {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 340px;
  gap: 1.25rem;
  align-items: start;
}

.friends-main {
  min-width: 0;
}

.friends-search {
  position: sticky;
  top: 110px;
}

.search-input {
  margin: 0.85rem 0 0.75rem;
}

.search-row {
  align-items: flex-start;
}

.friend-total {
  font-family: var(--font-body);
  font-size: 0.95rem;
  font-weight: 600;
  color: var(--text-muted);
  margin-left: 0.25rem;
}

.note-form {
  margin-top: 0.5rem;
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
}

.note-actions {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 0.4rem;
}

.note-actions .social-char-count {
  margin-right: auto;
}

@media (max-width: 860px) {
  .friends-layout {
    grid-template-columns: 1fr;
  }

  .friends-search {
    position: static;
    order: -1;
  }
}
</style>
