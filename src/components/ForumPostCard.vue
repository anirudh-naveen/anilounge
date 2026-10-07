<!--
  ForumPostCard.vue — one forum post as a card (component).

  Kind (review with its score, or discussion), title, author, tags, a preview
  (covered when marked as a spoiler), and like/comment counts. Liking needs
  sign-in; your own posts can't be liked. `compact` drops the preview for tight
  spots such as title-page highlights. `showImage` (Home) adds a cover picture from
  the highest tag in the hierarchy that has one: franchise, then title, then
  character.
-->
<template>
  <article class="post-card" :class="{ compact }" :data-testid="`post-card-${post.id}`">
    <router-link
      v-if="coverTag && !coverFailed"
      :to="postRoute(post.id)"
      class="post-card-cover"
      tabindex="-1"
      aria-hidden="true"
    >
      <img
        :src="getPosterUrl(coverTag.imagePath || '')"
        alt=""
        loading="lazy"
        data-testid="post-cover"
        @error="coverFailed = true"
      />
    </router-link>
    <header class="post-card-head">
      <span class="post-kind" :class="post.kind">
        {{ post.kind === 'review' ? 'Review' : 'Discussion' }}
      </span>
      <span
        v-if="post.score !== null"
        class="post-score"
        :style="getRatingTextStyle(post.score)"
        title="The author's watchlist rating"
        data-testid="post-score"
        >{{ scoreLabel(post.score) }}</span
      >
      <span v-if="post.forYou" class="post-for-you" title="From your watchlist">For you</span>
      <span v-if="post.spoiler" class="post-spoiler-flag">Spoilers</span>
    </header>

    <router-link :to="postRoute(post.id)" class="post-card-title">{{ post.title }}</router-link>

    <ForumTags :tags="post.tags" />

    <!-- Title: Preview -->
    <template v-if="!compact && post.excerpt">
      <button
        v-if="post.spoiler && !revealed"
        type="button"
        class="spoiler-cover"
        data-testid="spoiler-cover"
        @click="revealed = true"
      >
        Contains spoilers. Show preview
      </button>
      <p v-else class="post-card-excerpt">{{ post.excerpt }}</p>
    </template>

    <footer class="post-card-foot">
      <router-link :to="profileRoute(post.author.username)" class="post-author">
        <UserAvatar :src="post.author.profilePicture" :name="post.author.username" :size="22" />
        {{ post.author.username }}
      </router-link>
      <span class="social-meta" :title="new Date(post.createdAt).toLocaleString()">
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
          ♥ {{ post.likeCount }}
        </button>
        <router-link :to="postRoute(post.id)" class="post-comments" title="Comments">
          💬 {{ post.commentCount }}
        </router-link>
      </span>
    </footer>
  </article>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useToast } from 'vue-toastification'
import ForumTags from '@/components/ForumTags.vue'
import UserAvatar from '@/components/UserAvatar.vue'
import { forumAPI, getPosterUrl } from '@/services/api'
import { useAuthStore } from '@/stores/auth'
import type { ForumPost } from '@/types/forum'
import { postRoute, scoreLabel, sortTags } from '@/utils/forum'
import { getRatingTextStyle } from '@/utils/ratingColors'
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

/** Highest tag in the hierarchy (franchise, title, character) that has a picture. */
const coverTag = computed(() =>
  props.showImage ? sortTags(props.post.tags).find((tag) => tag.imagePath) || null : null,
)

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
  gap: 0.55rem;
  padding: 1.1rem 1.2rem;
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: 16px;
  min-width: 0;
}

.post-card-cover {
  display: block;
  margin: -1.1rem -1.2rem 0.2rem;
  height: 130px;
  overflow: hidden;
  border-radius: 16px 16px 0 0;
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

.post-card-head {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.4rem;
}

.post-kind,
.post-for-you,
.post-spoiler-flag {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  padding: 0.12rem 0.55rem;
  border-radius: 999px;
  font-size: 0.72rem;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  background: var(--bg-secondary);
  color: var(--text-secondary);
}

.post-kind.review {
  background: color-mix(in srgb, var(--coral-primary) 16%, transparent);
  color: var(--coral-deep);
}

.post-score {
  padding: 0.12rem 0.5rem;
  font-size: 0.78rem;
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
  font-size: 1.12rem;
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
  color: var(--text-secondary);
  line-height: 1.55;
  overflow-wrap: anywhere;
}

.spoiler-cover {
  padding: 0.6rem 0.8rem;
  border: 1px dashed var(--border-color);
  border-radius: 10px;
  background: var(--bg-secondary);
  color: var(--text-secondary);
  font: inherit;
  font-size: 0.88rem;
  cursor: pointer;
  text-align: left;
}

.post-card-foot {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.6rem;
  margin-top: auto;
}

.post-author {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  font-size: 0.85rem;
  font-weight: 600;
  color: var(--text-primary);
  text-decoration: none;
}

.post-stats {
  display: inline-flex;
  gap: 0.4rem;
  margin-left: auto;
}

.post-like,
.post-comments {
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
  padding: 0.2rem 0.6rem;
  border: 1px solid var(--border-color);
  border-radius: 999px;
  background: none;
  font: inherit;
  font-size: 0.8rem;
  color: var(--text-secondary);
  text-decoration: none;
  cursor: pointer;
}

.post-like.on {
  color: var(--coral-primary);
  border-color: color-mix(in srgb, var(--coral-primary) 45%, transparent);
}

.post-like:disabled {
  cursor: default;
  opacity: 0.7;
}
</style>
