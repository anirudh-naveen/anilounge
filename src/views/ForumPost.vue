<!--
  ForumPost.vue — one forum post with its comments (view).

  Shows the post (spoiler posts start covered), likes, and tags; the author can
  edit or delete it and admins can delete it. Comments nest one level: replying
  to a reply threads under the top-level comment. A deleted comment that has
  replies stays as "[deleted]" so the thread still reads.
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
          <header class="post-head">
            <span class="post-kind" :class="post.kind">
              {{ post.kind === 'review' ? 'Review' : 'Discussion' }}
            </span>
            <span v-if="post.score !== null" class="post-score" data-testid="post-score">
              {{ scoreLabel(post.score) }}
            </span>
            <span v-if="post.spoiler" class="post-spoiler-flag">Spoilers</span>
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

          <ul v-if="post.tags.length" class="post-tags">
            <li v-for="tag in post.tags" :key="`${tag.contentId}-${tag.season}-${tag.episode}`">
              <router-link :to="forumTagRoute(tag)" class="post-tag">
                <span class="post-tag-kind">{{ KIND_LABELS[tag.kind] }}</span>
                {{ tagLabel(tag) }}
              </router-link>
            </li>
          </ul>

          <button
            v-if="post.spoiler && !revealed"
            type="button"
            class="spoiler-cover"
            data-testid="post-spoiler-cover"
            @click="revealed = true"
          >
            This post contains spoilers. Show it
          </button>
          <div v-else class="post-body" data-testid="post-body">{{ post.body }}</div>

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
              ♥ {{ post.likeCount }}
            </button>
            <span class="social-meta">
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
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useToast } from 'vue-toastification'
import ForumCommentItem from '@/components/ForumCommentItem.vue'
import ForumComposer from '@/components/ForumComposer.vue'
import RoleBadge from '@/components/RoleBadge.vue'
import UserAvatar from '@/components/UserAvatar.vue'
import { forumAPI } from '@/services/api'
import { useAuthStore } from '@/stores/auth'
import type { ForumComment, ForumPost } from '@/types/forum'
import type { LanguageWarning } from '@/types/social'
import {
  COMMENT_MAX,
  forumTagRoute,
  KIND_LABELS,
  scoreLabel,
  showLanguageWarning,
  tagLabel,
} from '@/utils/forum'
import { timeAgo } from '@/utils/homeFeed'
import { apiErrorMessage, profileRoute } from '@/utils/social'

defineOptions({ name: 'ForumPostPage' })

const route = useRoute()
const router = useRouter()
const toast = useToast()
const authStore = useAuthStore()

const post = ref<ForumPost | null>(null)
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

const onEdited = (next: ForumPost) => {
  post.value = next
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

.post-kind,
.post-spoiler-flag {
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

.post-spoiler-flag {
  background: color-mix(in srgb, var(--error-color) 14%, transparent);
  color: var(--error-color);
}

.post-score {
  font-family: var(--font-display);
  font-size: 1.2rem;
  font-weight: 700;
  color: var(--coral-deep);
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
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem;
  list-style: none;
  margin: 1rem 0 0;
  padding: 0;
}

.post-tag {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  padding: 0.2rem 0.65rem;
  border: 1px solid var(--border-color);
  border-radius: 999px;
  font-size: 0.84rem;
  color: var(--text-primary);
  text-decoration: none;
}

.post-tag:hover {
  border-color: var(--border-hover);
}

.post-tag-kind {
  font-size: 0.66rem;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--text-muted);
}

.post-body {
  margin-top: 1.25rem;
  color: var(--text-primary);
  line-height: 1.7;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
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
  gap: 0.3rem;
  padding: 0.3rem 0.8rem;
  border: 1px solid var(--border-color);
  border-radius: 999px;
  background: none;
  font: inherit;
  font-size: 0.88rem;
  color: var(--text-secondary);
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

  .reply-list {
    margin-left: 0.4rem;
    padding-left: 0.75rem;
  }
}
</style>
