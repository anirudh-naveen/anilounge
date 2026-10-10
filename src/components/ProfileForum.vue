<!--
  ProfileForum.vue — a user's forum activity on their profile (component).

  The profile's Forum tab: Posts (their posts, newest first, as forum cards) and
  Comments (their comments, newest first, each linking to its post), one page at
  a time. A section loads the first time it's opened.
-->
<template>
  <div class="profile-forum" data-testid="profile-forum">
    <div class="forum-sections" role="tablist" aria-label="Forum activity">
      <button
        v-for="option in SECTIONS"
        :key="option.value"
        type="button"
        role="tab"
        class="forum-section"
        :class="{ active: section === option.value }"
        :aria-selected="section === option.value"
        :data-testid="`profile-forum-${option.value}`"
        @click="section = option.value"
      >
        {{ option.label }}
        <span v-if="state[option.value].total !== null" class="section-count">{{
          state[option.value].total
        }}</span>
      </button>
    </div>

    <div v-if="current.loading" class="forum-empty">Loading…</div>
    <div v-else-if="current.error" class="forum-empty">{{ current.error }}</div>

    <!-- Title: Posts -->
    <template v-else-if="section === 'posts'">
      <div v-if="posts.length" class="forum-posts">
        <ForumPostCard
          v-for="(post, index) in posts"
          :key="post.id"
          :post="post"
          compact
          @update:post="(next) => (posts[index] = next)"
        />
      </div>
      <div v-else class="forum-empty">No posts yet.</div>
    </template>

    <!-- Title: Comments -->
    <template v-else>
      <ul v-if="comments.length" class="forum-comments">
        <li
          v-for="comment in comments"
          :key="comment.id"
          class="forum-comment"
          data-testid="profile-forum-comment"
        >
          <blockquote>{{ excerpt(comment.body) }}</blockquote>
          <p class="social-meta">
            On
            <router-link :to="postRoute(comment.postId)">{{ comment.postTitle }}</router-link>
            ·
            <span :title="new Date(comment.createdAt).toLocaleString()">{{
              timeAgo(comment.createdAt)
            }}</span>
            <template v-if="comment.likeCount">
              ·
              <span class="comment-likes"
                ><ForumIcon name="heart" filled />{{ comment.likeCount }}</span
              >
            </template>
          </p>
        </li>
      </ul>
      <div v-else class="forum-empty">No comments yet.</div>
    </template>

    <PaginationNav
      v-if="!current.loading && !current.error && totalPages > 1"
      :current-page="current.page"
      :total-pages="totalPages"
      @change="load(section, $event)"
    />
  </div>
</template>

<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import ForumIcon from '@/components/ForumIcon.vue'
import ForumPostCard from '@/components/ForumPostCard.vue'
import PaginationNav from '@/components/PaginationNav.vue'
import { forumAPI } from '@/services/api'
import type { ForumComment, ForumPost } from '@/types/forum'
import { postRoute } from '@/utils/forum'
import { timeAgo } from '@/utils/homeFeed'

type Section = 'posts' | 'comments'

const SECTIONS: { value: Section; label: string }[] = [
  { value: 'posts', label: 'Posts' },
  { value: 'comments', label: 'Comments' },
]
const COMMENT_PREVIEW = 280

const props = defineProps<{ username: string }>()

const section = ref<Section>('posts')
const posts = ref<ForumPost[]>([])
const comments = ref<ForumComment[]>([])

interface SectionState {
  loaded: boolean
  loading: boolean
  error: string
  page: number
  pageSize: number
  total: number | null
}
const fresh = (): SectionState => ({
  loaded: false,
  loading: false,
  error: '',
  page: 1,
  pageSize: 20,
  total: null,
})
const state = reactive<Record<Section, SectionState>>({ posts: fresh(), comments: fresh() })

const current = computed(() => state[section.value])
const totalPages = computed(() =>
  Math.ceil((current.value.total || 0) / Math.max(1, current.value.pageSize)),
)

const excerpt = (text: string) =>
  text.length > COMMENT_PREVIEW ? `${text.slice(0, COMMENT_PREVIEW).trimEnd()}…` : text

const load = async (which: Section, page = 1) => {
  const entry = state[which]
  const username = props.username
  entry.loading = true
  entry.error = ''
  try {
    const response =
      which === 'posts'
        ? await forumAPI.list({ author: username, sort: 'new', page })
        : await forumAPI.userComments(username, page)
    if (username !== props.username) return
    const data = response.data.data
    if (which === 'posts') posts.value = data.items
    else comments.value = data.items
    Object.assign(entry, {
      loaded: true,
      page: data.page,
      pageSize: data.pageSize,
      total: data.total,
    })
  } catch {
    entry.error = `Couldn't load ${which}.`
  } finally {
    entry.loading = false
  }
}

watch(
  () => props.username,
  () => {
    Object.assign(state.posts, fresh())
    Object.assign(state.comments, fresh())
    posts.value = []
    comments.value = []
    void load(section.value)
  },
  { immediate: true },
)

watch(section, (next) => {
  if (!state[next].loaded && !state[next].loading) void load(next)
})
</script>

<style scoped>
.profile-forum {
  display: grid;
  gap: 1.25rem;
}

.forum-sections {
  display: flex;
  flex-wrap: wrap;
  gap: 0.35rem;
}

.forum-section {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  padding: 0.4rem 0.9rem;
  border: 1px solid var(--border-color);
  border-radius: 999px;
  background: transparent;
  color: var(--text-secondary);
  font: inherit;
  font-size: 0.88rem;
  font-weight: 600;
  cursor: pointer;
}

.forum-section.active {
  border-color: var(--profile-accent, var(--coral-primary));
  background: var(--profile-accent, var(--coral-primary));
  color: var(--text-on-accent);
}

.section-count {
  font-size: 0.78rem;
  opacity: 0.8;
}

.forum-posts {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 0.75rem;
}

.forum-comments {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: 0.9rem;
}

.forum-comment blockquote {
  margin: 0 0 0.3rem;
  padding: 0.6rem 0.9rem;
  border-left: 3px solid var(--profile-accent, var(--coral-primary));
  background: var(--bg-secondary);
  border-radius: 0 10px 10px 0;
  color: var(--text-primary);
  line-height: 1.5;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}

.forum-comment .social-meta {
  margin: 0;
}

.forum-comment a {
  color: var(--text-secondary);
  font-weight: 600;
}

.comment-likes {
  display: inline-flex;
  align-items: center;
  gap: 0.2rem;
  color: var(--coral-primary);
  vertical-align: middle;
}

.forum-empty {
  padding: 3rem 1rem;
  color: var(--text-muted);
  text-align: center;
}
</style>
