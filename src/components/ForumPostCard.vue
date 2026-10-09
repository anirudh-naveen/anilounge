<!--
  ForumPostCard.vue — one forum post as a card (component).

  Kind (review with its score, or discussion), title, author, tags, a preview
  (covered when marked as a spoiler), and like/comment counts. Liking needs
  sign-in; your own posts can't be liked. `compact` drops the preview for tight
  spots such as title-page highlights. `showImage` (Home) adds a cover picture: the
  author's top tag's, else the highest tag in the hierarchy that has one
  (title, then character; franchises never supply it).
-->
<template>
  <article class="post-card" :class="{ compact }" :data-testid="`post-card-${post.id}`">
    <router-link
      v-if="cover && !coverFailed"
      :to="postRoute(post.id)"
      class="post-card-cover"
      tabindex="-1"
      aria-hidden="true"
    >
      <img
        :src="getPosterUrl(cover.imagePath || '')"
        :alt="cover.name"
        loading="lazy"
        data-testid="post-cover"
        @error="coverFailed = true"
      />
    </router-link>
    <header class="post-card-head">
      <span class="post-badge post-kind" :class="post.kind">
        {{ POST_KIND_LABELS[post.kind] }}
      </span>
      <span
        v-if="post.score !== null"
        class="post-badge post-score"
        :style="getRatingBadgeColors(post.score)"
        title="The author's watchlist rating"
        data-testid="post-score"
        >{{ scoreLabel(post.score) }}</span
      >
      <span v-if="post.forYou" class="post-badge post-for-you" title="From your watchlist"
        >For you</span
      >
      <span v-if="post.spoiler" class="post-badge post-spoiler-flag">Spoilers</span>
    </header>

    <router-link :to="postRoute(post.id)" class="post-card-title">{{ post.title }}</router-link>

    <ForumTags :tags="post.tags" compact />

    <!-- Title: Preview -->
    <template v-if="!compact && post.excerpt">
      <button
        v-if="post.spoiler && !revealed"
        type="button"
        class="spoiler-cover"
        data-testid="spoiler-cover"
        @click="revealed = true"
      >
        <ForumIcon name="eye-off" />
        <span>Preview hidden for spoilers</span>
        <span class="spoiler-show">Show</span>
      </button>
      <p v-else class="post-card-excerpt">{{ post.excerpt }}</p>
    </template>

    <footer class="post-card-foot">
      <router-link :to="profileRoute(post.author.username)" class="post-author">
        <UserAvatar :src="post.author.profilePicture" :name="post.author.username" :size="22" />
        <span class="post-author-name">{{ post.author.username }}</span>
      </router-link>
      <span class="post-time" :title="new Date(post.createdAt).toLocaleString()">
        {{ timeAgo(post.createdAt) }}
      </span>
      <span class="post-stats">
        <button
          type="button"
          class="post-like"
          :class="{ on: post.liked }"
          :aria-pressed="post.liked"
          :disabled="busy || post.canEdit"
          :title="post.canEdit ? 'Your post' : post.liked ? 'Unlike' : 'Like'"
          data-testid="post-like"
          @click="toggleLike"
        >
          <ForumIcon name="heart" :filled="post.liked" />
          {{ post.likeCount }}
        </button>
        <router-link
          :to="postRoute(post.id)"
          class="post-comments"
          :title="`${post.commentCount} ${post.commentCount === 1 ? 'comment' : 'comments'}`"
        >
          <ForumIcon name="comment" />
          {{ post.commentCount }}
        </router-link>
      </span>
    </footer>
  </article>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useToast } from 'vue-toastification'
import ForumIcon from '@/components/ForumIcon.vue'
import ForumTags from '@/components/ForumTags.vue'
import UserAvatar from '@/components/UserAvatar.vue'
import { forumAPI, getPosterUrl } from '@/services/api'
import { useAuthStore } from '@/stores/auth'
import type { ForumPost } from '@/types/forum'
import { coverTag, POST_KIND_LABELS, postRoute, scoreLabel } from '@/utils/forum'
import { getRatingBadgeColors } from '@/utils/ratingColors'
import { timeAgo } from '@/utils/homeFeed'
import { apiErrorMessage, profileRoute } from '@/utils/social'

const props = defineProps<{ post: ForumPost; compact?: boolean; showImage?: boolean }>()
const emit = defineEmits<{ 'update:post': [post: ForumPost] }>()

const authStore = useAuthStore()
const router = useRouter()
const toast = useToast()
const busy = ref(false)
const revealed = ref(false)
const coverFailed = ref(false)

/** The top tag's picture, else the highest tag with one (see `coverTag`). */
const cover = computed(() => (props.showImage ? coverTag(props.post.tags) : null))

const toggleLike = async () => {
  if (!authStore.isAuthenticated) {
    toast.info('Sign in to like posts.')
    router.push('/login')
    return
  }
  const liked = !props.post.liked
  busy.value = true
  try {
    const response = await forumAPI.like(props.post.id, liked)
    emit('update:post', { ...props.post, ...response.data.data })
  } catch (error) {
    toast.error(apiErrorMessage(error, 'Could not update the like.'))
  } finally {
    busy.value = false
  }
}
</script>

<style scoped>
.post-card {
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
  padding: 1rem 1.1rem;
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: 16px;
  min-width: 0;
  overflow: hidden;
}

.post-card-cover {
  display: block;
  margin: -1rem -1.1rem 0.15rem;
  height: 130px;
  overflow: hidden;
  background: var(--bg-secondary);
}

.post-card-cover img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  object-position: center 25%;
  display: block;
}

.post-card.compact {
  padding: 0.9rem 1rem;
}

/* Badges: one size, so kind, score, and flags read as a set. */
.post-card-head {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.35rem;
}

.post-badge {
  display: inline-flex;
  align-items: center;
  height: 1.3rem;
  padding: 0 0.45rem;
  border-radius: 6px;
  font-size: 0.68rem;
  font-weight: 700;
  letter-spacing: 0.05em;
  line-height: 1;
  text-transform: uppercase;
  white-space: nowrap;
  background: var(--bg-secondary);
  color: var(--text-secondary);
}

.post-kind.review {
  background: color-mix(in srgb, var(--coral-primary) 16%, transparent);
  color: var(--coral-deep);
}

.post-kind.guide {
  background: color-mix(in srgb, var(--teal-primary) 16%, transparent);
  color: color-mix(in srgb, var(--teal-primary) 60%, var(--text-primary));
}

.post-kind.article {
  background: color-mix(in srgb, var(--purple-accent) 16%, transparent);
  color: color-mix(in srgb, var(--purple-accent) 70%, var(--text-primary));
}

.post-score {
  letter-spacing: 0.01em;
}

.post-for-you {
  background: color-mix(in srgb, var(--teal-light) 18%, transparent);
  color: var(--text-primary);
}

.post-spoiler-flag {
  background: color-mix(in srgb, var(--error-color) 14%, transparent);
  color: var(--error-color);
}

.post-card-title {
  font-family: var(--font-display);
  font-size: 1.1rem;
  font-weight: 650;
  line-height: 1.3;
  letter-spacing: -0.01em;
  color: var(--text-primary);
  text-decoration: none;
  overflow-wrap: anywhere;
}

.post-card-title:hover {
  color: var(--coral-deep);
}

.post-card-excerpt {
  margin: 0;
  font-size: 0.92rem;
  color: var(--text-secondary);
  line-height: 1.55;
  overflow-wrap: anywhere;
  display: -webkit-box;
  -webkit-line-clamp: 3;
  line-clamp: 3;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.spoiler-cover {
  display: flex;
  align-items: center;
  gap: 0.45rem;
  width: 100%;
  padding: 0.45rem 0.65rem;
  border: 1px dashed var(--border-color);
  border-radius: 8px;
  background: none;
  color: var(--text-muted);
  font: inherit;
  font-size: 0.82rem;
  cursor: pointer;
  text-align: left;
}

.spoiler-show {
  margin-left: auto;
  font-weight: 700;
  color: var(--coral-deep);
}

.spoiler-cover:hover {
  border-color: var(--border-hover);
  color: var(--text-secondary);
}

.post-card-foot {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin-top: auto;
  padding-top: 0.6rem;
  border-top: 1px solid var(--border-color);
  min-width: 0;
}

.post-author {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  min-width: 0;
  font-size: 0.82rem;
  font-weight: 600;
  color: var(--text-primary);
  text-decoration: none;
}

.post-author-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.post-time {
  flex-shrink: 0;
  font-size: 0.78rem;
  color: var(--text-muted);
}

.post-stats {
  display: inline-flex;
  flex-shrink: 0;
  gap: 0.15rem;
  margin-left: auto;
}

.post-like,
.post-comments {
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;
  padding: 0.2rem 0.4rem;
  border: 0;
  border-radius: 6px;
  background: none;
  font: inherit;
  font-size: 0.8rem;
  font-weight: 600;
  color: var(--text-muted);
  text-decoration: none;
  cursor: pointer;
}

.post-like:hover:not(:disabled),
.post-comments:hover {
  background: var(--bg-hover);
  color: var(--text-primary);
}

.post-like.on {
  color: var(--coral-primary);
}

.post-like:disabled {
  cursor: default;
}

.post-like .forum-icon,
.post-comments .forum-icon {
  font-size: 1rem;
}
</style>
