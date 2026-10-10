<!--
  ForumPost.vue — one forum post with its comments (view).

  Shows the post (spoiler posts start covered), likes, and tags, with the top
  tag's picture (else the highest tag with one) on the right; the author can
  edit or delete it and admins can delete it. Comments nest one level: replying
  to a reply threads under the top-level comment. A deleted comment that has
  replies stays as "[deleted]" so the thread still reads.

  Posts are public and indexable: the page sets its title, description, and
  `DiscussionForumPosting` structured data (spoiler posts keep their text out of
  the description), and signed-out visitors get a "Join the Conversation" prompt.
-->
<template>
  <div class="social-page">
    <div class="social-container post-container">
      <router-link :to="{ name: 'forum' }" class="back-link">← Forum</router-link>

      <div v-if="loading" class="social-loading"><div class="spinner"></div></div>
      <p v-else-if="error" class="social-empty social-panel">{{ error }}</p>

      <template v-else-if="post">
        <!-- Title: Edit -->
        <section v-if="editing" class="social-panel">
          <h2 class="social-panel-title edit-title">Edit post</h2>
          <ForumComposer :post="post" @saved="onEdited" @cancel="editing = false" />
        </section>

        <!-- Title: Post -->
        <article v-else class="social-panel post-article" data-testid="forum-post">
          <div class="post-top" :class="{ 'has-poster': cover && !coverFailed }">
            <div class="post-intro">
              <header class="post-head">
                <span class="post-badge post-kind" :class="post.kind">
                  {{ POST_KIND_LABELS[post.kind] }}
                </span>
                <span
                  v-if="post.score !== null"
                  class="post-badge post-score"
                  :style="getRatingBadgeColors(post.score)"
                  title="The author's watchlist rating"
                  data-testid="post-score"
                >
                  {{ scoreLabel(post.score) }}
                </span>
                <span v-if="post.spoiler" class="post-badge post-spoiler-flag">Spoilers</span>
              </header>
              <h1 class="post-title">{{ post.title }}</h1>
              <div class="post-byline">
                <router-link :to="profileRoute(post.author.username)" class="post-author">
                  <UserAvatar
                    :src="post.author.profilePicture"
                    :name="post.author.username"
                    :size="28"
                  />
                  {{ post.author.username }}
                  <RoleBadge :username="post.author.username" />
                </router-link>
                <span class="social-meta" :title="new Date(post.createdAt).toLocaleString()">
                  {{ timeAgo(post.createdAt) }}
                  <template v-if="post.editedAt"> · edited</template>
                </span>
              </div>

              <ForumTags :tags="post.tags" show-kind class="post-tags" />
            </div>

            <!-- Title: Poster -->
            <router-link
              v-if="cover && !coverFailed"
              :to="tagRoute(cover)"
              class="post-poster"
              :title="cover.name"
              data-testid="post-poster"
            >
              <img
                :src="getPosterUrl(cover.imagePath || '')"
                :alt="cover.name"
                @error="coverFailed = true"
              />
              <span class="post-poster-name">{{ cover.name }}</span>
            </router-link>
          </div>

          <button
            v-if="post.spoiler && !revealed"
            type="button"
            class="spoiler-cover"
            data-testid="post-spoiler-cover"
            @click="revealed = true"
          >
            <ForumIcon name="eye-off" class="spoiler-icon" />
            This post contains spoilers. Show it
          </button>
          <ForumRichText v-else :text="post.body || ''" class="post-body" data-testid="post-body" />

          <footer class="post-actions">
            <button
              type="button"
              class="post-like"
              :class="{ on: post.liked }"
              :aria-pressed="post.liked"
              :disabled="busy || post.canEdit"
              :title="post.canEdit ? 'Your post' : post.liked ? 'Unlike' : 'Like'"
              data-testid="post-like"
              @click="togglePostLike"
            >
              <ForumIcon name="heart" :filled="post.liked" />
              {{ post.likeCount }}
            </button>
            <span class="post-comment-count">
              <ForumIcon name="comment" />
              {{ post.commentCount }} {{ post.commentCount === 1 ? 'comment' : 'comments' }}
            </span>
            <span class="post-owner-actions">
              <button
                v-if="post.canEdit"
                type="button"
                class="btn btn-ghost btn-small"
                data-testid="post-edit"
                @click="editing = true"
              >
                Edit
              </button>
              <button
                v-if="post.canDelete"
                type="button"
                class="btn btn-ghost btn-small danger"
                data-testid="post-delete"
                @click="deletePost"
              >
                Delete
              </button>
              <button
                v-if="authStore.isAuthenticated && !post.canEdit"
                type="button"
                class="btn btn-ghost btn-small"
                data-testid="post-report"
                @click="reportPost"
              >
                Report
              </button>
            </span>
          </footer>
        </article>

        <!-- Title: Comments -->
        <section class="social-panel comments-panel" data-testid="comments">
          <h2 class="social-panel-title">Comments</h2>

          <form
            v-if="authStore.isAuthenticated"
            class="comment-form"
            data-testid="comment-form"
            @submit.prevent="submitComment(null)"
          >
            <textarea
              v-model="newComment"
              class="input social-textarea"
              rows="3"
              :maxlength="COMMENT_MAX"
              placeholder="Add a comment"
              aria-label="Add a comment"
            ></textarea>
            <div class="comment-form-actions">
              <button
                type="submit"
                class="btn btn-primary btn-small"
                :disabled="sending || !newComment.trim()"
                data-testid="comment-submit"
              >
                Comment
              </button>
            </div>
          </form>
          <p v-else class="social-meta sign-in-note">
            <router-link to="/login">Sign in</router-link> to join the conversation.
          </p>

          <p v-if="!threads.length" class="social-empty">No comments yet.</p>
          <ul v-else class="comment-list">
            <li v-for="thread in threads" :key="thread.comment.id" class="comment-thread">
              <ForumCommentItem
                :comment="thread.comment"
                @reply="startReply(thread.comment.id)"
                @changed="replaceComment"
                @removed="removeComment"
              />
              <ul
                v-if="thread.replies.length || replyingTo === thread.comment.id"
                class="reply-list"
              >
                <li v-for="reply in thread.replies" :key="reply.id">
                  <ForumCommentItem
                    :comment="reply"
                    @reply="startReply(thread.comment.id, reply.author?.username)"
                    @changed="replaceComment"
                    @removed="removeComment"
                  />
                </li>
                <li v-if="replyingTo === thread.comment.id">
                  <form
                    class="comment-form reply-form"
                    data-testid="reply-form"
                    @submit.prevent="submitComment(thread.comment.id)"
                  >
                    <textarea
                      ref="replyInput"
                      v-model="replyText"
                      class="input social-textarea"
                      rows="2"
                      :maxlength="COMMENT_MAX"
                      placeholder="Write a reply"
                      aria-label="Write a reply"
                    ></textarea>
                    <div class="comment-form-actions">
                      <button type="button" class="btn btn-ghost btn-small" @click="cancelReply">
                        Cancel
                      </button>
                      <button
                        type="submit"
                        class="btn btn-primary btn-small"
                        :disabled="sending || !replyText.trim()"
                        data-testid="reply-submit"
                      >
                        Reply
                      </button>
                    </div>
                  </form>
                </li>
              </ul>
            </li>
          </ul>
        </section>
      </template>
    </div>

    <JoinPrompt
      v-if="post"
      title="Join the Conversation"
      message="Sign up to reply, like posts, and share your own takes on anime and animation."
    />
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useToast } from 'vue-toastification'
import ForumCommentItem from '@/components/ForumCommentItem.vue'
import ForumComposer from '@/components/ForumComposer.vue'
import ForumRichText from '@/components/ForumRichText.vue'
import ForumIcon from '@/components/ForumIcon.vue'
import ForumTags from '@/components/ForumTags.vue'
import JoinPrompt from '@/components/JoinPrompt.vue'
import RoleBadge from '@/components/RoleBadge.vue'
import UserAvatar from '@/components/UserAvatar.vue'
import { forumAPI, getPosterUrl } from '@/services/api'
import { usePageMeta } from '@/composables/usePageMeta'
import { HOME_CRUMB, breadcrumbList } from '@/utils/pageMeta'
import { useCanonicalSlug } from '@/composables/useCanonicalSlug'
import { detailPath } from '@/utils/slug'
import { useAuthStore } from '@/stores/auth'
import type { ForumComment, ForumPost } from '@/types/forum'
import type { LanguageWarning } from '@/types/social'
import {
  COMMENT_MAX,
  coverTag,
  POST_KIND_LABELS,
  reportForum,
  scoreLabel,
  showLanguageWarning,
  tagRoute,
} from '@/utils/forum'
import { getRatingBadgeColors } from '@/utils/ratingColors'
import { timeAgo } from '@/utils/homeFeed'
import { plainText } from '@/utils/richText'
import { apiErrorMessage, profileRoute } from '@/utils/social'

defineOptions({ name: 'ForumPostPage' })

const route = useRoute()
const router = useRouter()
const toast = useToast()
const authStore = useAuthStore()

const post = ref<ForumPost | null>(null)
/** Picture beside the post: the top tag's, else the highest tag with one. */
const cover = computed(() => (post.value ? coverTag(post.value.tags) : null))
const coverFailed = ref(false)
const comments = ref<ForumComment[]>([])
const loading = ref(true)
const error = ref('')
const busy = ref(false)
const revealed = ref(false)
const editing = ref(false)

const newComment = ref('')
const replyText = ref('')
const replyingTo = ref<string | null>(null)
const replyInput = ref<HTMLTextAreaElement[] | null>(null)
const sending = ref(false)

const postId = computed(() => String(route.params.id))

/** Absolute URL of an in-site path, for structured data. */
const absolute = (path: string) => new URL(path, window.location.origin).href

usePageMeta(() => {
  const value = post.value
  if (!value) return null
  const path = detailPath('/forum/post', value.id, value.title)
  const text = plainText(value.body || '')
  const about = value.tags.map((tag) => tag.name).join(', ')
  const kind = POST_KIND_LABELS[value.kind]
  const description = value.spoiler
    ? `${kind} by ${value.author.username}${about ? ` about ${about}` : ''}. Contains spoilers.`
    : text
  const author = (username: string) => ({
    '@type': 'Person',
    name: username,
    url: absolute(`/u/${encodeURIComponent(username)}`),
  })
  const image = cover.value?.imagePath ? getPosterUrl(cover.value.imagePath) : null
  return {
    title: value.title,
    description,
    path,
    type: 'article',
    image,
    jsonLd: [
      {
        '@context': 'https://schema.org',
        '@type': 'DiscussionForumPosting',
        headline: value.title,
        text: value.spoiler ? description : text,
        url: absolute(path),
        datePublished: value.createdAt,
        ...(value.editedAt ? { dateModified: value.editedAt } : {}),
        author: author(value.author.username),
        ...(image ? { image } : {}),
        ...(about
          ? { about: value.tags.map((tag) => ({ '@type': 'Thing', name: tag.name })) }
          : {}),
        interactionStatistic: [
          {
            '@type': 'InteractionCounter',
            interactionType: 'https://schema.org/LikeAction',
            userInteractionCount: value.likeCount,
          },
          {
            '@type': 'InteractionCounter',
            interactionType: 'https://schema.org/CommentAction',
            userInteractionCount: value.commentCount,
          },
        ],
        comment: comments.value
          .filter((comment) => !comment.deleted && comment.author)
          .slice(0, 50)
          .map((comment) => ({
            '@type': 'Comment',
            text: comment.body,
            datePublished: comment.createdAt,
            author: author(comment.author!.username),
            url: absolute(`${path}#comment-${comment.id}`),
          })),
      },
      breadcrumbList([HOME_CRUMB, { name: 'Forum', path: '/forum' }, { name: value.title, path }]),
    ],
  }
})

/** Top-level comments, each with its replies, oldest first. */
const threads = computed(() => {
  const replies = new Map<string, ForumComment[]>()
  for (const comment of comments.value) {
    if (!comment.parentId) continue
    replies.set(comment.parentId, [...(replies.get(comment.parentId) || []), comment])
  }
  return comments.value
    .filter((comment) => !comment.parentId)
    .map((comment) => ({ comment, replies: replies.get(comment.id) || [] }))
})

const load = async () => {
  loading.value = true
  error.value = ''
  try {
    const response = await forumAPI.get(postId.value)
    post.value = response.data.data.post as ForumPost
    comments.value = response.data.data.comments as ForumComment[]
  } catch (err) {
    error.value = apiErrorMessage(err, 'Could not load this post.')
  } finally {
    loading.value = false
  }
  if (post.value) revealLinkedComment()
}

/** Scroll to and briefly highlight `#comment-<id>` (inbox links). */
const revealLinkedComment = async () => {
  if (!route.hash.startsWith('#comment-')) return
  await nextTick()
  const el = document.getElementById(route.hash.slice(1))
  if (!el) return
  el.scrollIntoView({ behavior: 'smooth', block: 'center' })
  el.classList.add('linked')
  setTimeout(() => el.classList.remove('linked'), 2500)
}

const togglePostLike = async () => {
  if (!post.value) return
  if (!authStore.isAuthenticated) {
    toast.info('Sign in to like posts.')
    router.push('/login')
    return
  }
  busy.value = true
  try {
    const response = await forumAPI.like(post.value.id, !post.value.liked)
    Object.assign(post.value, response.data.data)
  } catch (err) {
    toast.error(apiErrorMessage(err, 'Could not update the like.'))
  } finally {
    busy.value = false
  }
}

const deletePost = async () => {
  if (!post.value || !confirm('Delete this post and its comments?')) return
  try {
    await forumAPI.remove(post.value.id)
    toast.success('Post deleted.')
    router.push({ name: 'forum' })
  } catch (err) {
    toast.error(apiErrorMessage(err, 'Could not delete the post.'))
  }
}

const reportPost = async () => {
  if (!post.value) return
  try {
    if (await reportForum('post', post.value.id))
      toast.success('Thanks. An admin will take a look.')
  } catch (err) {
    toast.error(apiErrorMessage(err, 'Could not send the report.'))
  }
}

const onEdited = (next: ForumPost) => {
  post.value = next
  coverFailed.value = false
  editing.value = false
}

const startReply = async (parentId: string, mention?: string) => {
  if (!authStore.isAuthenticated) {
    toast.info('Sign in to reply.')
    router.push('/login')
    return
  }
  replyingTo.value = parentId
  replyText.value = mention ? `@${mention} ` : ''
  await nextTick()
  replyInput.value?.[0]?.focus()
}

const cancelReply = () => {
  replyingTo.value = null
  replyText.value = ''
}

const submitComment = async (parentId: string | null) => {
  const body = (parentId ? replyText.value : newComment.value).trim()
  if (!post.value || !body || sending.value) return
  sending.value = true
  try {
    const response = await forumAPI.comment(post.value.id, body, parentId)
    comments.value.push(response.data.data as ForumComment)
    post.value.commentCount += 1
    showLanguageWarning(toast, response.data.warning as LanguageWarning | null)
    if (parentId) cancelReply()
    else newComment.value = ''
  } catch (err) {
    toast.error(apiErrorMessage(err, 'Could not post your comment.'))
  } finally {
    sending.value = false
  }
}

const replaceComment = (next: ForumComment) => {
  const index = comments.value.findIndex((comment) => comment.id === next.id)
  if (index >= 0) comments.value[index] = next
}

const removeComment = (commentId: string, removed: boolean) => {
  if (post.value) post.value.commentCount = Math.max(0, post.value.commentCount - 1)
  if (removed) {
    comments.value = comments.value.filter((comment) => comment.id !== commentId)
    return
  }
  const comment = comments.value.find((entry) => entry.id === commentId)
  if (comment)
    Object.assign(comment, {
      deleted: true,
      body: '',
      author: null,
      canEdit: false,
      canDelete: false,
    })
}

onMounted(load)

useCanonicalSlug(
  () => post.value?.title,
  () => post.value?.id,
)
</script>

<style scoped>
.post-container {
  max-width: 820px;
}

.back-link {
  display: inline-block;
  margin-bottom: 1rem;
  color: var(--text-secondary);
  text-decoration: none;
  font-weight: 600;
}

.back-link:hover {
  color: var(--coral-deep);
}

.edit-title {
  margin-bottom: 1rem;
}

.post-head {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.45rem;
}

.post-badge {
  display: inline-flex;
  align-items: center;
  height: 1.5rem;
  padding: 0 0.55rem;
  border-radius: 6px;
  font-size: 0.72rem;
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

.post-kind.megathread {
  background: color-mix(in srgb, var(--warning-color) 18%, transparent);
  color: color-mix(in srgb, var(--warning-color) 65%, var(--text-primary));
}

.post-spoiler-flag {
  background: color-mix(in srgb, var(--error-color) 14%, transparent);
  color: var(--error-color);
}

.post-score {
  font-size: 0.8rem;
  letter-spacing: 0.01em;
}

.post-top.has-poster {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 150px;
  gap: 1.5rem;
  align-items: start;
}

.post-intro {
  min-width: 0;
}

.post-poster {
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
  text-decoration: none;
}

.post-poster img {
  width: 100%;
  aspect-ratio: 2 / 3;
  object-fit: cover;
  border-radius: 12px;
  border: 1px solid var(--border-color);
  box-shadow: var(--shadow-md);
  background: var(--bg-secondary);
  transition: transform 0.2s ease;
}

.post-poster:hover img {
  transform: translateY(-2px);
}

.post-poster-name {
  font-size: 0.78rem;
  font-weight: 600;
  line-height: 1.3;
  color: var(--text-secondary);
  text-align: center;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.post-title {
  font-family: var(--font-display);
  font-size: 2rem;
  font-weight: 650;
  line-height: 1.2;
  letter-spacing: -0.02em;
  color: var(--text-primary);
  margin: 0.6rem 0 0.75rem;
  overflow-wrap: anywhere;
}

.post-byline {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.75rem;
}

.post-author {
  display: inline-flex;
  align-items: center;
  gap: 0.45rem;
  font-weight: 700;
  color: var(--text-primary);
  text-decoration: none;
}

.post-tags {
  margin-top: 1rem;
}

.post-body {
  margin-top: 1.25rem;
}

.spoiler-cover {
  display: block;
  width: 100%;
  margin-top: 1.25rem;
  padding: 1.25rem;
  border: 1px dashed var(--border-color);
  border-radius: 12px;
  background: var(--bg-secondary);
  color: var(--text-secondary);
  font: inherit;
  cursor: pointer;
}

.post-actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.75rem;
  margin-top: 1.5rem;
  padding-top: 1rem;
  border-top: 1px solid var(--border-color);
}

.post-like {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  padding: 0.3rem 0.75rem;
  border: 1px solid var(--border-color);
  border-radius: 8px;
  background: none;
  font: inherit;
  font-size: 0.88rem;
  font-weight: 600;
  color: var(--text-secondary);
  cursor: pointer;
}

.post-comment-count {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  font-size: 0.88rem;
  color: var(--text-muted);
}

.spoiler-icon {
  display: inline-block;
  vertical-align: -0.15em;
  margin-right: 0.3rem;
}

.post-like.on {
  color: var(--coral-primary);
  border-color: color-mix(in srgb, var(--coral-primary) 45%, transparent);
}

.post-like:disabled {
  cursor: default;
  opacity: 0.7;
}

.post-owner-actions {
  display: flex;
  gap: 0.4rem;
  margin-left: auto;
}

.danger {
  color: var(--error-color);
}

.comments-panel .social-panel-title {
  margin-bottom: 1rem;
}

.comment-form {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  margin-bottom: 1.25rem;
}

.sign-in-note {
  margin: 0 0 1.25rem;
}

.comment-form-actions {
  display: flex;
  justify-content: flex-end;
  gap: 0.4rem;
}

.comment-list,
.reply-list {
  list-style: none;
  margin: 0;
  padding: 0;
}

.comment-thread {
  padding: 0.9rem 0;
  border-top: 1px solid var(--border-color);
}

.comment-thread:first-child {
  border-top: 0;
  padding-top: 0;
}

.reply-list {
  margin: 0.6rem 0 0 1.4rem;
  padding-left: 1rem;
  border-left: 2px solid var(--border-color);
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.reply-form {
  margin-bottom: 0;
}

@media (max-width: 640px) {
  .post-title {
    font-size: 1.6rem;
  }

  .post-top.has-poster {
    grid-template-columns: minmax(0, 1fr) 88px;
    gap: 1rem;
  }

  .post-poster-name {
    display: none;
  }

  .reply-list {
    margin-left: 0.4rem;
    padding-left: 0.75rem;
  }
}
</style>
