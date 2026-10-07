<!--
  ForumCommentItem.vue — one forum comment (component).

  Author, time, body, and actions: like (not your own), reply, and edit/delete
  for the author (admins can delete). Edits happen inline. A deleted comment kept
  for its replies shows as "[deleted]" with no actions. Emits `reply`,
  `changed` (the updated comment), and `removed` (id, and whether it was removed
  outright rather than blanked).
-->
<template>
  <div :id="`comment-${comment.id}`" class="comment" :data-testid="`comment-${comment.id}`">
    <p v-if="comment.deleted" class="comment-deleted">[deleted]</p>
    <template v-else>
      <div class="comment-head">
        <router-link
          v-if="comment.author"
          :to="profileRoute(comment.author.username)"
          class="comment-author"
        >
          <UserAvatar
            :src="comment.author.profilePicture"
            :name="comment.author.username"
            :size="24"
          />
          {{ comment.author.username }}
          <RoleBadge :username="comment.author.username" />
        </router-link>
        <span class="social-meta" :title="new Date(comment.createdAt).toLocaleString()">
          {{ timeAgo(comment.createdAt) }}<template v-if="comment.editedAt"> · edited</template>
        </span>
      </div>

      <form v-if="editing" class="comment-edit" @submit.prevent="save">
        <textarea
          v-model="draft"
          class="input social-textarea"
          rows="3"
          :maxlength="COMMENT_MAX"
          aria-label="Edit comment"
          data-testid="comment-edit-input"
        ></textarea>
        <div class="comment-edit-actions">
          <button type="button" class="btn btn-ghost btn-small" @click="editing = false">
            Cancel
          </button>
          <button
            type="submit"
            class="btn btn-primary btn-small"
            :disabled="busy || !draft.trim()"
            data-testid="comment-edit-save"
          >
            Save
          </button>
        </div>
      </form>
      <p v-else class="comment-body">{{ comment.body }}</p>

      <div v-if="!editing" class="comment-actions">
        <button
          type="button"
          class="comment-action"
          :class="{ on: comment.liked }"
          :aria-pressed="comment.liked"
          :disabled="busy || comment.canEdit"
          :title="comment.canEdit ? 'Your comment' : comment.liked ? 'Unlike' : 'Like'"
          data-testid="comment-like"
          @click="toggleLike"
        >
          ♥ {{ comment.likeCount }}
        </button>
        <button
          type="button"
          class="comment-action"
          data-testid="comment-reply"
          @click="emit('reply')"
        >
          Reply
        </button>
        <button
          v-if="comment.canEdit"
          type="button"
          class="comment-action"
          data-testid="comment-edit"
          @click="startEdit"
        >
          Edit
        </button>
        <button
          v-if="comment.canDelete"
          type="button"
          class="comment-action danger"
          data-testid="comment-delete"
          @click="remove"
        >
          Delete
        </button>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { useToast } from 'vue-toastification'
import RoleBadge from '@/components/RoleBadge.vue'
import UserAvatar from '@/components/UserAvatar.vue'
import { forumAPI } from '@/services/api'
import { useAuthStore } from '@/stores/auth'
import type { ForumComment } from '@/types/forum'
import type { LanguageWarning } from '@/types/social'
import { COMMENT_MAX, showLanguageWarning } from '@/utils/forum'
import { timeAgo } from '@/utils/homeFeed'
import { apiErrorMessage, profileRoute } from '@/utils/social'

const props = defineProps<{ comment: ForumComment }>()
const emit = defineEmits<{
  reply: []
  changed: [comment: ForumComment]
  removed: [commentId: string, removed: boolean]
}>()

const authStore = useAuthStore()
const router = useRouter()
const toast = useToast()
const busy = ref(false)
const editing = ref(false)
const draft = ref('')

const toggleLike = async () => {
  if (!authStore.isAuthenticated) {
    toast.info('Sign in to like comments.')
    router.push('/login')
    return
  }
  busy.value = true
  try {
    const response = await forumAPI.likeComment(props.comment.id, !props.comment.liked)
    emit('changed', { ...props.comment, ...response.data.data })
  } catch (error) {
    toast.error(apiErrorMessage(error, 'Could not update the like.'))
  } finally {
    busy.value = false
  }
}

const startEdit = () => {
  draft.value = props.comment.body
  editing.value = true
}

const save = async () => {
  busy.value = true
  try {
    const response = await forumAPI.updateComment(props.comment.id, draft.value.trim())
    showLanguageWarning(toast, response.data.warning as LanguageWarning | null)
    emit('changed', response.data.data as ForumComment)
    editing.value = false
  } catch (error) {
    toast.error(apiErrorMessage(error, 'Could not save your comment.'))
  } finally {
    busy.value = false
  }
}

const remove = async () => {
  if (!confirm('Delete this comment?')) return
  busy.value = true
  try {
    const response = await forumAPI.removeComment(props.comment.id)
    emit('removed', props.comment.id, Boolean(response.data.data?.removed))
  } catch (error) {
    toast.error(apiErrorMessage(error, 'Could not delete the comment.'))
  } finally {
    busy.value = false
  }
}
</script>

<style scoped>
.comment {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
  scroll-margin-top: 120px;
  border-radius: 10px;
  transition: background-color 1.2s ease;
}

/* Opened from an inbox link (#comment-<id>). */
.comment.linked {
  background: color-mix(in srgb, var(--coral-primary) 12%, transparent);
  box-shadow: 0 0 0 0.5rem color-mix(in srgb, var(--coral-primary) 12%, transparent);
}

.comment-head {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.6rem;
}

.comment-author {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  font-size: 0.9rem;
  font-weight: 700;
  color: var(--text-primary);
  text-decoration: none;
}

.comment-body {
  margin: 0;
  color: var(--text-primary);
  line-height: 1.55;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}

.comment-deleted {
  margin: 0;
  color: var(--text-muted);
  font-style: italic;
}

.comment-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.3rem;
}

.comment-action {
  padding: 0.15rem 0.5rem;
  border: 0;
  border-radius: 999px;
  background: none;
  font: inherit;
  font-size: 0.8rem;
  font-weight: 600;
  color: var(--text-secondary);
  cursor: pointer;
}

.comment-action:hover:not(:disabled) {
  background: var(--bg-hover);
  color: var(--text-primary);
}

.comment-action.on {
  color: var(--coral-primary);
}

.comment-action:disabled {
  cursor: default;
  opacity: 0.7;
}

.comment-action.danger {
  color: var(--error-color);
}

.comment-edit {
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
}

.comment-edit-actions {
  display: flex;
  justify-content: flex-end;
  gap: 0.4rem;
}
</style>
