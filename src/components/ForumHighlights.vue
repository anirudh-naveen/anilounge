<!--
  ForumHighlights.vue — forum posts about a title or character (component).

  For movie, series, and character pages, near the top: the hot posts tagged with
  this page (or its franchise) and a few highlighted comments from them, with links
  to see every post, start a discussion, or (for titles) write a review. With no
  posts yet it shrinks to a one-line prompt. Hidden while loading and on errors so
  it never blocks the page.
-->
<template>
  <section
    v-if="data"
    class="forum-highlights"
    :class="{ empty: !data.total }"
    data-testid="forum-highlights"
  >
    <header class="highlights-head">
      <div>
        <h2 v-if="data.total">Hot in the Forum</h2>
        <p class="social-meta">
          <template v-if="data.total">
            {{ data.total }} {{ data.total === 1 ? 'post' : 'posts' }} about {{ name }}
            <template v-if="data.franchise">or the {{ data.franchise.name }} franchise</template>
          </template>
          <template v-else>No forum posts about {{ name }} yet.</template>
        </p>
      </div>
      <div class="highlights-actions">
        <router-link
          :to="{ name: 'forum', query: { tag: contentId, compose: '1' } }"
          class="btn btn-secondary btn-small"
          data-testid="highlights-discuss"
        >
          Start a discussion
        </router-link>
        <router-link
          v-if="reviewable"
          :to="{ name: 'forum', query: { tag: contentId, compose: 'review' } }"
          class="btn btn-primary btn-small"
          data-testid="highlights-review"
        >
          Write a review
        </router-link>
      </div>
    </header>

    <div v-if="data.posts.length" class="highlights-posts">
      <ForumPostCard
        v-for="(post, index) in data.posts"
        :key="post.id"
        :post="post"
        compact
        @update:post="(next) => data && (data.posts[index] = next)"
      />
    </div>

    <!-- Title: Highlighted Comments -->
    <div v-if="data.comments.length" class="highlights-comments">
      <h3>Highlighted comments</h3>
      <ul>
        <li v-for="comment in data.comments" :key="comment.id" class="highlight-comment">
          <blockquote>{{ excerpt(comment.body) }}</blockquote>
          <p class="social-meta">
            <router-link v-if="comment.author" :to="profileRoute(comment.author.username)">
              {{ comment.author.username }}
            </router-link>
            on
            <router-link :to="postRoute(comment.postId)">{{ comment.postTitle }}</router-link>
            ·
            <span class="highlight-likes"
              ><ForumIcon name="heart" filled />{{ comment.likeCount }}</span
            >
          </p>
        </li>
      </ul>
    </div>

    <router-link
      v-if="data.total > data.posts.length"
      :to="{ name: 'forum', query: { tag: contentId } }"
      class="highlights-more"
      data-testid="highlights-more"
    >
      See all {{ data.total }} posts →
    </router-link>
  </section>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue'
import ForumIcon from '@/components/ForumIcon.vue'
import ForumPostCard from '@/components/ForumPostCard.vue'
import { forumAPI } from '@/services/api'
import type { ForumHighlights } from '@/types/forum'
import { postRoute } from '@/utils/forum'
import { profileRoute } from '@/utils/social'

const COMMENT_PREVIEW = 220

const props = defineProps<{
  contentId: string
  /** Shown in the summary line, e.g. the title. */
  name: string
  /** Titles can be reviewed; characters can't. */
  reviewable?: boolean
}>()

const data = ref<ForumHighlights | null>(null)

const excerpt = (text: string) =>
  text.length > COMMENT_PREVIEW ? `${text.slice(0, COMMENT_PREVIEW).trimEnd()}…` : text

watch(
  () => props.contentId,
  async (contentId) => {
    data.value = null
    if (!contentId) return
    try {
      const response = await forumAPI.highlights(contentId)
      if (contentId === props.contentId) data.value = response.data.data as ForumHighlights
    } catch {
      // Highlights are extra; the page works without them.
    }
  },
  { immediate: true },
)
</script>

<style scoped>
.forum-highlights {
  margin: 2rem 0;
  padding: 1.5rem;
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: 20px;
  box-shadow: var(--shadow-md);
}

.highlights-head {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-start;
  justify-content: space-between;
  gap: 1rem;
  margin-bottom: 1rem;
}

.forum-highlights.empty {
  padding: 0.85rem 1.25rem;
  box-shadow: none;
}

.forum-highlights.empty .highlights-head {
  align-items: center;
  margin-bottom: 0;
}

.forum-highlights.empty .social-meta {
  margin: 0;
  font-size: 0.92rem;
}

.highlights-head h2 {
  margin: 0 0 0.2rem;
  font-family: var(--font-display);
  font-size: 1.4rem;
  color: var(--text-primary);
}

.highlights-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
}

.highlights-posts {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
  gap: 0.75rem;
}

.highlights-comments {
  margin-top: 1.25rem;
}

.highlights-comments h3 {
  margin: 0 0 0.6rem;
  font-size: 0.8rem;
  font-weight: 700;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--text-muted);
}

.highlights-comments ul {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: 0.75rem;
}

.highlight-comment blockquote {
  margin: 0 0 0.25rem;
  padding: 0.5rem 0.85rem;
  border-left: 3px solid var(--coral-primary);
  background: var(--bg-secondary);
  border-radius: 0 10px 10px 0;
  color: var(--text-primary);
  line-height: 1.5;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}

.highlight-comment a {
  color: var(--text-secondary);
  font-weight: 600;
}

.highlight-likes {
  display: inline-flex;
  align-items: center;
  gap: 0.2rem;
  color: var(--coral-primary);
  vertical-align: middle;
}

.highlights-more {
  display: inline-block;
  margin-top: 1rem;
  font-weight: 600;
  color: var(--coral-deep);
  text-decoration: none;
}
</style>
