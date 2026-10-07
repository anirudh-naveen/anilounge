<!--
  ForumComposer.vue — write or edit a forum post (component).

  Discussion or review (reviews need a 1–10 score and a tagged movie, series, or
  special), title, body, a spoiler flag, and tags. With `post` it edits that post
  (the kind is fixed); otherwise it creates one, optionally starting from
  `presetTags` and `presetKind`. Emits `saved` with the stored post, or `cancel`.
-->
<template>
  <form class="composer" data-testid="forum-composer" @submit.prevent="submit">
    <!-- Title: Kind -->
    <div v-if="!post" class="kind-toggle" role="radiogroup" aria-label="Post type">
      <button
        v-for="option in KIND_OPTIONS"
        :key="option.value"
        type="button"
        role="radio"
        class="kind-option"
        :class="{ selected: kind === option.value }"
        :aria-checked="kind === option.value"
        :data-testid="`kind-${option.value}`"
        @click="kind = option.value"
      >
        <strong>{{ option.label }}</strong>
        <span>{{ option.hint }}</span>
      </button>
    </div>

    <label class="field">
      <span class="field-label">Title</span>
      <input
        v-model="title"
        class="input"
        :maxlength="TITLE_MAX"
        :placeholder="kind === 'review' ? 'Sum up your take' : 'What do you want to talk about?'"
        data-testid="composer-title"
        required
      />
    </label>

    <!-- Title: Score -->
    <label v-if="kind === 'review'" class="field score-field">
      <span class="field-label">Score</span>
      <span class="score-row">
        <input
          v-model.number="score"
          type="range"
          min="1"
          max="10"
          step="0.5"
          aria-label="Score from 1 to 10"
          data-testid="composer-score"
        />
        <strong class="score-value">{{ scoreLabel(score) }}</strong>
      </span>
    </label>

    <label class="field">
      <span class="field-label">
        {{ kind === 'review' ? 'Review' : 'Post' }}
        <span class="social-char-count" :class="{ over: body.length >= BODY_MAX }"
          >{{ body.length }}/{{ BODY_MAX }}</span
        >
      </span>
      <textarea
        v-model="body"
        class="input social-textarea composer-body"
        rows="8"
        :maxlength="BODY_MAX"
        placeholder="Write it here. Mark spoilers below."
        data-testid="composer-body"
        required
      ></textarea>
    </label>

    <div class="field">
      <span class="field-label">
        Tags
        <span class="social-meta">
          {{ kind === 'review' ? 'Include what you are reviewing.' : 'Optional.' }}
        </span>
      </span>
      <ForumTagPicker v-model="tags" />
    </div>

    <label class="spoiler-toggle">
      <input v-model="spoiler" type="checkbox" data-testid="composer-spoiler" />
      Contains spoilers (the preview is hidden until someone opens it)
    </label>

    <div class="composer-actions">
      <button type="button" class="btn btn-ghost" @click="emit('cancel')">Cancel</button>
      <button
        type="submit"
        class="btn btn-primary"
        :disabled="saving || !canSubmit"
        data-testid="composer-submit"
      >
        {{ post ? 'Save changes' : kind === 'review' ? 'Post review' : 'Post' }}
      </button>
    </div>
  </form>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { useToast } from 'vue-toastification'
import ForumTagPicker from '@/components/ForumTagPicker.vue'
import { forumAPI } from '@/services/api'
import type { ForumPost, PostKind, PostTag } from '@/types/forum'
import type { LanguageWarning } from '@/types/social'
import { BODY_MAX, scoreLabel, showLanguageWarning, TITLE_MAX } from '@/utils/forum'
import { apiErrorMessage } from '@/utils/social'

const KIND_OPTIONS: { value: PostKind; label: string; hint: string }[] = [
  { value: 'discussion', label: 'Discussion', hint: 'Start a conversation' },
  { value: 'review', label: 'Review', hint: 'Score and review a title' },
]
const REVIEWABLE = ['movie', 'series', 'special']

const props = defineProps<{
  post?: ForumPost | null
  presetTags?: PostTag[]
  presetKind?: PostKind
}>()
const emit = defineEmits<{ saved: [post: ForumPost]; cancel: [] }>()

const toast = useToast()

const kind = ref<PostKind>(props.post?.kind || props.presetKind || 'discussion')
const title = ref(props.post?.title || '')
const body = ref(props.post?.body || '')
const score = ref<number>(props.post?.score ?? 7)
const spoiler = ref(props.post?.spoiler || false)
const tags = ref<PostTag[]>(props.post ? [...props.post.tags] : [...(props.presetTags || [])])
const saving = ref(false)

const canSubmit = computed(() => {
  if (!title.value.trim() || !body.value.trim()) return false
  if (kind.value === 'review') return tags.value.some((tag) => REVIEWABLE.includes(tag.kind))
  return true
})

const submit = async () => {
  if (!canSubmit.value || saving.value) return
  saving.value = true
  const input = {
    title: title.value.trim(),
    body: body.value.trim(),
    spoiler: spoiler.value,
    tags: tags.value.map((tag) => ({
      contentId: tag.contentId,
      season: tag.season,
      episode: tag.episode,
    })),
    ...(kind.value === 'review' ? { score: score.value } : {}),
  }
  try {
    const response = props.post
      ? await forumAPI.update(props.post.id, input)
      : await forumAPI.create({ ...input, kind: kind.value })
    showLanguageWarning(toast, response.data.warning as LanguageWarning | null)
    toast.success(props.post ? 'Post updated.' : 'Posted.')
    emit('saved', response.data.data as ForumPost)
  } catch (error) {
    toast.error(apiErrorMessage(error, 'Could not save your post.'))
  } finally {
    saving.value = false
  }
}
</script>

<style scoped>
.composer {
  display: flex;
  flex-direction: column;
  gap: 1.1rem;
}

.kind-toggle {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0.6rem;
}

.kind-option {
  display: flex;
  flex-direction: column;
  gap: 0.15rem;
  padding: 0.75rem 0.9rem;
  border: 1px solid var(--border-color);
  border-radius: 12px;
  background: none;
  font: inherit;
  color: var(--text-primary);
  text-align: left;
  cursor: pointer;
}

.kind-option span {
  font-size: 0.82rem;
  color: var(--text-secondary);
}

.kind-option.selected {
  border-color: var(--coral-primary);
  background: color-mix(in srgb, var(--coral-primary) 10%, transparent);
}

.field {
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
}

.field-label {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 0.75rem;
  font-weight: 600;
  color: var(--text-primary);
}

.composer-body {
  min-height: 10rem;
}

.score-row {
  display: flex;
  align-items: center;
  gap: 0.85rem;
}

.score-row input {
  flex: 1;
  accent-color: var(--coral-primary);
}

.score-value {
  min-width: 3.5rem;
  font-size: 1.1rem;
  color: var(--coral-deep);
}

.spoiler-toggle {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  color: var(--text-secondary);
  font-size: 0.9rem;
}

.composer-actions {
  display: flex;
  justify-content: flex-end;
  gap: 0.6rem;
}

@media (max-width: 520px) {
  .kind-toggle {
    grid-template-columns: 1fr;
  }
}
</style>
