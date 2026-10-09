<!--
  ForumComposer.vue — write or edit a forum post (component).

  Discussion, review (reviews need a 1–10 score and a tagged movie, series, or
  special), guide, or article; title, body (with bold, italics, a heading preset,
  lists, quotes, and links; see `utils/richText.ts`), a spoiler flag, and tags
  (optional except for reviews). With `post` it edits that post
  (the kind is fixed); otherwise it creates one, optionally starting from
  `presetTags` and `presetKind`. Emits `saved` with the stored post, or `cancel`.

  A review's score follows the watchlist: it starts from your watchlist rating for
  the reviewed title (its first movie/series/special tag), and saving writes the
  score back there, adding the title as Completed when it isn't on your list.
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
        :placeholder="KIND_OPTIONS.find((option) => option.value === kind)?.title"
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
        <strong
          class="score-value"
          :style="{ color: getRatingColor(score) }"
          data-testid="composer-score-value"
          >{{ scoreLabel(score) }}</strong
        >
      </span>
      <span v-if="subject" class="social-meta" data-testid="composer-score-note">
        <template v-if="!watchlistItem">
          {{ subject.name }} isn't on your watchlist yet. Posting adds it as Completed with this
          score.
        </template>
        <template v-else>
          This is your watchlist rating for {{ subject.name }}; saving updates it there too.
        </template>
      </span>
    </label>

    <div class="field">
      <span class="field-label">
        {{ kind === 'discussion' ? 'Post' : POST_KIND_LABELS[kind] }}
        <span class="social-char-count" :class="{ over: body.length >= BODY_MAX }"
          >{{ body.length }}/{{ BODY_MAX }}</span
        >
      </span>
      <!-- Title: Formatting -->
      <span class="format-bar" role="toolbar" aria-label="Formatting">
        <span class="format-tools">
          <button
            v-for="tool in FORMAT_TOOLS"
            :key="tool.id"
            type="button"
            class="format-btn"
            :class="`format-${tool.id}`"
            :title="tool.title"
            :aria-label="tool.title"
            :disabled="previewing"
            :data-testid="`format-${tool.id}`"
            @mousedown.prevent
            @click="applyFormat(tool.id)"
          >
            {{ tool.glyph }}
          </button>
        </span>
        <span class="format-modes" role="tablist" aria-label="Editor view">
          <button
            type="button"
            role="tab"
            class="format-mode"
            :aria-selected="!previewing"
            @click="previewing = false"
          >
            Write
          </button>
          <button
            type="button"
            role="tab"
            class="format-mode"
            :aria-selected="previewing"
            data-testid="composer-preview-tab"
            @click="previewing = true"
          >
            Preview
          </button>
        </span>
      </span>
      <div
        v-if="previewing"
        class="input composer-body composer-preview"
        data-testid="composer-preview"
      >
        <ForumRichText v-if="body.trim()" :text="body" />
        <p v-else class="social-meta">Nothing to preview yet.</p>
      </div>
      <textarea
        v-show="!previewing"
        ref="bodyInput"
        v-model="body"
        class="input social-textarea composer-body"
        rows="8"
        :maxlength="BODY_MAX"
        placeholder="Write it here. Select text and use the buttons above to format it. Mark spoilers below."
        data-testid="composer-body"
        required
        aria-label="Post text"
        @keydown="onBodyKeydown"
      ></textarea>
    </div>

    <div class="field">
      <span class="field-label">
        Tags
        <span class="social-meta">
          {{
            kind === 'review'
              ? 'Include what you are reviewing.'
              : kind === 'discussion'
                ? 'Optional.'
                : 'Optional: tag the titles it covers.'
          }}
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
        {{
          post
            ? 'Save changes'
            : kind === 'discussion'
              ? 'Post'
              : `Post ${POST_KIND_LABELS[kind].toLowerCase()}`
        }}
      </button>
    </div>
  </form>
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import { useToast } from 'vue-toastification'
import ForumRichText from '@/components/ForumRichText.vue'
import ForumTagPicker from '@/components/ForumTagPicker.vue'
import { forumAPI } from '@/services/api'
import { useAuthStore } from '@/stores/auth'
import { useContentStore } from '@/stores/content'
import type { ForumPost, PostKind, PostTag } from '@/types/forum'
import type { LanguageWarning } from '@/types/social'
import {
  BODY_MAX,
  POST_KIND_LABELS,
  REVIEWABLE_KINDS,
  scoreLabel,
  showLanguageWarning,
  TITLE_MAX,
} from '@/utils/forum'
import { getRatingColor } from '@/utils/ratingColors'
import { applyFormatting, type FormatTool } from '@/utils/richTextEditing'
import { apiErrorMessage } from '@/utils/social'

const KIND_OPTIONS: { value: PostKind; label: string; hint: string; title: string }[] = [
  {
    value: 'discussion',
    label: 'Discussion',
    hint: 'Start a conversation',
    title: 'What do you want to talk about?',
  },
  { value: 'review', label: 'Review', hint: 'Score and review a title', title: 'Sum up your take' },
  {
    value: 'guide',
    label: 'Guide',
    hint: 'Watch orders, tips, and how-tos',
    title: 'What does your guide cover?',
  },
  {
    value: 'article',
    label: 'Article',
    hint: 'Longer writing and analysis',
    title: 'Give your article a headline',
  },
]

const props = defineProps<{
  post?: ForumPost | null
  presetTags?: PostTag[]
  presetKind?: PostKind
}>()
const emit = defineEmits<{ saved: [post: ForumPost]; cancel: [] }>()

const toast = useToast()
const authStore = useAuthStore()
const contentStore = useContentStore()

const kind = ref<PostKind>(props.post?.kind || props.presetKind || 'discussion')
const title = ref(props.post?.title || '')
const body = ref(props.post?.body || '')
const score = ref<number>(props.post?.score ?? 7)
const spoiler = ref(props.post?.spoiler || false)
const tags = ref<PostTag[]>(props.post ? [...props.post.tags] : [...(props.presetTags || [])])
const saving = ref(false)
const previewing = ref(false)
const bodyInput = ref<HTMLTextAreaElement | null>(null)

const FORMAT_TOOLS: { id: FormatTool; glyph: string; title: string }[] = [
  { id: 'bold', glyph: 'B', title: 'Bold (Ctrl/⌘+B)' },
  { id: 'italic', glyph: 'I', title: 'Italic (Ctrl/⌘+I)' },
  { id: 'strike', glyph: 'S', title: 'Strikethrough' },
  { id: 'heading', glyph: 'H', title: 'Heading' },
  { id: 'bullets', glyph: '•', title: 'Bulleted list' },
  { id: 'numbers', glyph: '1.', title: 'Numbered list' },
  { id: 'quote', glyph: '❝', title: 'Quote' },
  { id: 'link', glyph: '🔗', title: 'Link' },
]

/** Format the selected text (or insert a placeholder), keeping the result selected. */
const applyFormat = async (tool: FormatTool) => {
  const input = bodyInput.value
  if (!input) return
  const result = applyFormatting(body.value, input.selectionStart, input.selectionEnd, tool)
  if (result.text.length > BODY_MAX) {
    toast.info(`Posts can be up to ${BODY_MAX} characters.`)
    return
  }
  body.value = result.text
  await nextTick()
  input.focus()
  input.setSelectionRange(result.selectionStart, result.selectionEnd)
}

const onBodyKeydown = (event: KeyboardEvent) => {
  if (!(event.metaKey || event.ctrlKey) || event.altKey || event.shiftKey) return
  const key = event.key.toLowerCase()
  if (key !== 'b' && key !== 'i') return
  event.preventDefault()
  applyFormat(key === 'b' ? 'bold' : 'italic')
}

/** The title a review scores: its first movie/series/special tag (as the server picks it). */
const subject = computed(() =>
  kind.value === 'review'
    ? tags.value.find((tag) => REVIEWABLE_KINDS.includes(tag.kind)) || null
    : null,
)

const watchlistItem = computed(() =>
  subject.value ? contentStore.getWatchlistItem(subject.value.contentId) || null : null,
)

/** The user's watchlist rating for the subject, when they have one. */
const watchlistRating = computed(() => {
  const rating = watchlistItem.value?.rating
  return typeof rating === 'number' && rating >= 1 ? rating : null
})

// Start from the watchlist rating whenever the reviewed title changes (or the list loads).
watch(
  () => [subject.value?.contentId, watchlistRating.value] as const,
  ([, rating], previous) => {
    const firstRun = previous === undefined
    if (rating !== null && !(firstRun && props.post)) score.value = rating
  },
  { immediate: true },
)

const canSubmit = computed(() => {
  if (!title.value.trim() || !body.value.trim()) return false
  if (kind.value === 'review') return subject.value !== null
  return true
})

/** Write the review score to the watchlist (adding the title as Completed if needed). */
const syncWatchlistRating = async () => {
  const target = subject.value
  if (!target || !authStore.isAuthenticated) return
  try {
    if (!watchlistItem.value) {
      await contentStore.addToWatchlist(target.contentId, 'completed', score.value)
    } else if (watchlistRating.value !== score.value) {
      await contentStore.updateWatchlistItem(target.contentId, { rating: score.value })
    }
  } catch {
    toast.error(`Saved, but your watchlist rating for ${target.name} couldn't be updated.`)
  }
}

onMounted(() => {
  if (authStore.isAuthenticated) contentStore.loadWatchlist()
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
      top: tag.top === true,
    })),
    ...(kind.value === 'review' ? { score: score.value } : {}),
  }
  try {
    const response = props.post
      ? await forumAPI.update(props.post.id, input)
      : await forumAPI.create({ ...input, kind: kind.value })
    showLanguageWarning(toast, response.data.warning as LanguageWarning | null)
    const saved = response.data.data as ForumPost
    if (kind.value === 'review') {
      await syncWatchlistRating()
      saved.score = score.value
    }
    toast.success(props.post ? 'Post updated.' : 'Posted.')
    emit('saved', saved)
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
  grid-template-columns: repeat(4, minmax(0, 1fr));
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

.format-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 0.5rem;
}

.format-tools {
  display: flex;
  flex-wrap: wrap;
  gap: 0.25rem;
}

.format-btn {
  min-width: 2rem;
  height: 2rem;
  padding: 0 0.45rem;
  border: 1px solid var(--border-color);
  border-radius: 8px;
  background: var(--bg-card);
  font: inherit;
  font-size: 0.9rem;
  font-weight: 600;
  line-height: 1;
  color: var(--text-secondary);
  cursor: pointer;
}

.format-btn:hover:not(:disabled) {
  border-color: var(--border-hover);
  color: var(--text-primary);
}

.format-btn:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.format-bold {
  font-weight: 800;
}

.format-italic {
  font-style: italic;
  font-family: var(--font-display);
}

.format-strike {
  text-decoration: line-through;
}

.format-heading {
  font-family: var(--font-display);
  font-weight: 700;
}

.format-modes {
  display: flex;
  gap: 0.2rem;
}

.format-mode {
  padding: 0.3rem 0.75rem;
  border: 0;
  border-radius: 999px;
  background: none;
  font: inherit;
  font-size: 0.85rem;
  font-weight: 600;
  color: var(--text-secondary);
  cursor: pointer;
}

.format-mode[aria-selected='true'] {
  background: color-mix(in srgb, var(--coral-primary) 14%, transparent);
  color: var(--coral-deep);
}

.composer-preview {
  overflow-y: auto;
  max-height: 32rem;
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

@media (max-width: 760px) {
  .kind-toggle {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
</style>
