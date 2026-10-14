<!--
  WatchlistPanel.vue — watchlist controls on a title's page (component).

  Inline panel for movie and series pages: a one-tap add (with a starting
  status) for titles not yet on the list, and the full progress editor (status,
  season, episodes, rating, plus dates, rewatches, and notes under "More
  details") for titles already on it. Picking a starting status other than
  Planned or Dropped opens the editor before adding, so progress goes in with
  the title. Guests get a prompt to log in.
-->
<template>
  <section class="watchlist-panel" data-testid="watchlist-panel">
    <header class="panel-head">
      <h2>Your Watchlist</h2>
      <span
        v-if="existingItem"
        class="status-pill"
        :class="`status-${existingItem.status}`"
        data-testid="watchlist-panel-status"
        >{{ getWatchlistStatusLabel(existingItem.status) }}</span
      >
    </header>

    <!-- Title: Guest -->
    <p v-if="!authStore.isAuthenticated" class="panel-note">
      <router-link to="/login">Log in</router-link> to track this title.
    </p>

    <!-- Title: Not On The List -->
    <div v-else-if="!existingItem && !addingWithProgress" class="add-row">
      <select v-model="form.status" class="field-input" aria-label="Status">
        <option
          v-for="option in WATCHLIST_STATUS_OPTIONS"
          :key="option.value"
          :value="option.value"
        >
          {{ option.label }}
        </option>
      </select>
      <button
        type="button"
        class="btn btn-primary"
        :disabled="saving"
        data-testid="watchlist-add"
        @click="add"
      >
        Add to Watchlist
      </button>
    </div>

    <!-- Title: Editor -->
    <div v-else class="editor">
      <label class="field full">
        <span>Status</span>
        <select
          v-model="form.status"
          class="field-input"
          data-testid="watchlist-panel-status-select"
        >
          <option
            v-for="option in WATCHLIST_STATUS_OPTIONS"
            :key="option.value"
            :value="option.value"
          >
            {{ option.label }}
          </option>
        </select>
      </label>

      <label v-if="contentType === 'tv' && totalSeasons > 1" class="field full">
        <span>Current Season</span>
        <select v-model.number="form.currentSeason" class="field-input">
          <option v-for="season in totalSeasons" :key="season" :value="season">
            Season {{ season }}
          </option>
        </select>
      </label>

      <label v-if="contentType === 'tv'" class="field">
        <span>Episodes{{ totalEpisodes ? ` (of ${totalEpisodes})` : '' }}</span>
        <span class="episode-row">
          <input
            v-model.number="form.currentEpisode"
            type="number"
            min="0"
            :max="totalEpisodes || undefined"
            :disabled="episodesLocked"
            inputmode="numeric"
            class="field-input"
            data-testid="watchlist-panel-episodes"
          />
          <button
            type="button"
            class="btn btn-step"
            :disabled="
              episodesLocked || (Boolean(totalEpisodes) && form.currentEpisode >= totalEpisodes)
            "
            aria-label="Add one episode"
            data-testid="watchlist-panel-plus-one"
            @click="form.currentEpisode = (form.currentEpisode || 0) + 1"
          >
            +1
          </button>
        </span>
      </label>

      <label class="field" :class="{ full: contentType !== 'tv' }">
        <span>Your Rating (1-10)</span>
        <input
          v-model="form.rating"
          type="number"
          min="1"
          max="10"
          step="0.1"
          inputmode="decimal"
          class="field-input"
          placeholder="No rating"
        />
      </label>

      <details class="more-details full" :open="backlogMode || undefined">
        <summary>More details</summary>
        <p v-if="backlogMode" class="panel-note">
          Backlog Mode is on: this counts toward your total watch time, not today. Set the dates you
          watched it to place it on your calendar.
        </p>
        <p v-else class="panel-note">
          Start and finish dates fill in automatically when you save progress.
        </p>
        <div class="more-grid">
          <label class="field">
            <span>Started</span>
            <input v-model="form.startedOn" type="date" class="field-input" />
          </label>
          <label class="field">
            <span>Finished</span>
            <input v-model="form.completedOn" type="date" class="field-input" />
          </label>
          <label class="field">
            <span>Rewatches</span>
            <input
              v-model.number="form.rewatchCount"
              type="number"
              min="0"
              max="999"
              inputmode="numeric"
              class="field-input"
            />
          </label>
        </div>
        <label class="field">
          <span>Notes</span>
          <textarea
            v-model="form.notes"
            rows="3"
            class="field-input"
            placeholder="Add your thoughts..."
          ></textarea>
        </label>
      </details>

      <div v-if="!existingItem" class="editor-actions full">
        <button
          type="button"
          class="btn btn-primary"
          :disabled="saving"
          data-testid="watchlist-add"
          @click="add"
        >
          Add to Watchlist
        </button>
      </div>

      <div v-else class="editor-actions full">
        <button
          type="button"
          class="btn btn-primary"
          :disabled="saving"
          data-testid="watchlist-save"
          @click="save"
        >
          Save
        </button>
        <button
          type="button"
          class="btn btn-danger"
          :disabled="saving"
          data-testid="watchlist-remove"
          @click="remove"
        >
          Remove
        </button>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import { useToast } from 'vue-toastification'
import { useAuthStore } from '@/stores/auth'
import { useContentStore } from '@/stores/content'
import { useBacklogMode } from '@/composables/useBacklogMode'
import {
  WATCHLIST_STATUS_OPTIONS,
  getWatchlistStatusLabel,
  watchedEpisodes,
  type WatchlistStatus,
} from '@/utils/watchlist'
import { toUserRating } from '@/utils/ratings'

const props = withDefaults(
  defineProps<{
    contentId: string
    contentType: 'movie' | 'tv'
    totalEpisodes?: number
    totalSeasons?: number
  }>(),
  { totalEpisodes: 0, totalSeasons: 1 },
)

const authStore = useAuthStore()
const contentStore = useContentStore()
const toast = useToast()
const { active: backlogMode } = useBacklogMode()

const existingItem = computed(() =>
  props.contentId ? contentStore.getWatchlistItem(props.contentId) : undefined,
)

const form = reactive({
  status: 'plan_to_watch' as WatchlistStatus,
  currentSeason: 1,
  currentEpisode: 0,
  rating: '' as string | number,
  startedOn: '',
  completedOn: '',
  rewatchCount: 0,
  notes: '',
})
const saving = ref(false)

/** Starting statuses with no progress to record; the rest open the editor before adding. */
const QUICK_ADD_STATUSES: WatchlistStatus[] = ['plan_to_watch', 'dropped']
const addingWithProgress = computed(
  () => !existingItem.value && !QUICK_ADD_STATUSES.includes(form.status),
)

/** Copy the saved row into the form (or reset it for a title not on the list). */
const populate = () => {
  const item = existingItem.value
  form.status = item?.status ?? 'plan_to_watch'
  form.currentSeason = item?.currentSeason || 1
  form.currentEpisode = watchedEpisodes(item?.status, item?.currentEpisode, props.totalEpisodes)
  form.rating = item?.rating ?? ''
  form.startedOn = item?.startedOn || ''
  form.completedOn = item?.completedOn || ''
  form.rewatchCount = item?.rewatchCount || 0
  form.notes = item?.notes || ''
}

watch(existingItem, populate, { immediate: true })

/** Completed titles sit on their last episode (the server enforces the same rule). */
const episodesLocked = computed(() => form.status === 'completed' && props.totalEpisodes > 0)
watch(episodesLocked, (locked) => {
  if (locked) form.currentEpisode = props.totalEpisodes
})
// Back to watching: resume where the saved row was before it was completed.
watch(
  () => form.status,
  (status, previous) => {
    const item = existingItem.value
    if (previous !== 'completed' || status !== 'watching' || item?.status !== 'completed') return
    const resumeAt = item.previousEpisode || 0
    if (resumeAt > 0 && resumeAt < form.currentEpisode) form.currentEpisode = resumeAt
  },
)

/** Rating, progress, and details from the editor, as sent on save. */
const editorFields = () => ({
  rating: toUserRating(form.rating),
  notes: form.notes,
  startedOn: form.startedOn || null,
  completedOn: form.completedOn || null,
  rewatchCount: Math.max(0, Number(form.rewatchCount) || 0),
  ...(props.contentType === 'tv'
    ? {
        currentEpisode: Math.max(0, Number(form.currentEpisode) || 0),
        currentSeason: form.currentSeason || 1,
      }
    : {}),
})

const add = async () => {
  saving.value = true
  try {
    if (addingWithProgress.value) {
      const { rating, currentEpisode, currentSeason, notes, ...details } = editorFields()
      await contentStore.addToWatchlist(
        props.contentId,
        form.status,
        rating,
        currentEpisode,
        currentSeason,
        notes || undefined,
        details,
      )
    } else {
      await contentStore.addToWatchlist(props.contentId, form.status)
    }
    toast.success(backlogMode.value ? 'Added to watchlist (backlog)' : 'Added to watchlist!')
  } catch (error) {
    console.error('Error adding to watchlist:', error)
    toast.error('Failed to add to watchlist')
  } finally {
    saving.value = false
  }
}

const save = async () => {
  saving.value = true
  try {
    await contentStore.updateWatchlistItem(props.contentId, {
      status: form.status,
      ...editorFields(),
    })
    toast.success(backlogMode.value ? 'Watchlist updated (backlog)' : 'Watchlist updated!')
  } catch (error) {
    console.error('Error saving watchlist item:', error)
    toast.error('Failed to update watchlist')
  } finally {
    saving.value = false
  }
}

const remove = async () => {
  saving.value = true
  try {
    await contentStore.removeFromWatchlist(props.contentId)
    toast.success('Removed from watchlist')
  } catch (error) {
    console.error('Error removing from watchlist:', error)
    toast.error('Failed to remove from watchlist')
  } finally {
    saving.value = false
  }
}
</script>

<style scoped>
.watchlist-panel {
  margin-top: 1.5rem;
  margin-bottom: 2.5rem;
  padding: 1.25rem;
  border: 1px solid var(--border-color);
  border-radius: 14px;
  background: var(--bg-card);
  box-shadow: var(--shadow-sm);
}

.panel-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  margin-bottom: 1rem;
}

.panel-head h2 {
  margin: 0;
  font-size: 1.1rem;
  color: var(--text-primary);
}

.status-pill {
  padding: 0.2rem 0.7rem;
  border-radius: 999px;
  font-size: 0.8rem;
  font-weight: 600;
  color: var(--text-on-accent, #fff);
  background: var(--highlight-color);
}

.status-pill.status-watching {
  background: var(--teal-primary);
}

.status-pill.status-completed {
  background: var(--success-color);
}

.status-pill.status-on_hold {
  background: var(--tan-primary);
}

.status-pill.status-dropped {
  background: var(--error-color);
}

.panel-note {
  margin: 0;
  color: var(--text-muted);
  font-size: 0.85rem;
}

.panel-note a {
  color: var(--coral-primary);
  font-weight: 600;
}

.add-row {
  display: flex;
  gap: 0.75rem;
}

.add-row .field-input {
  flex: 1;
  min-width: 0;
}

/* Status and season take the full row; episodes and rating sit side by side. */
.editor {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 1rem;
}

.full {
  grid-column: 1 / -1;
}

.field {
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
  min-width: 0;
  color: var(--text-primary);
  font-size: 0.9rem;
  font-weight: 500;
}

.field-input {
  width: 100%;
  min-width: 0;
  padding: 0.7rem;
  border: 1px solid var(--border-color);
  border-radius: 8px;
  background: var(--bg-secondary);
  color: var(--text-primary);
  font: inherit;
  font-weight: 400;
}

/* One height for every single-line field: Safari sizes selects and date inputs its own way. */
.field-input:not(textarea) {
  box-sizing: border-box;
  height: 2.875rem;
  line-height: 1.25;
}

/* Draw the select arrow ourselves so the native control stops ignoring padding. */
select.field-input {
  appearance: none;
  padding-right: 2.25rem;
  background-image:
    linear-gradient(45deg, transparent 50%, var(--text-muted) 50%),
    linear-gradient(135deg, var(--text-muted) 50%, transparent 50%);
  background-position:
    right 1.1rem center,
    right 0.8rem center;
  background-size: 0.3rem 0.3rem;
  background-repeat: no-repeat;
  cursor: pointer;
}

input[type='date'].field-input::-webkit-datetime-edit {
  padding: 0;
}

input[type='date'].field-input::-webkit-date-and-time-value {
  text-align: left;
}

.field-input:focus {
  outline: none;
  border-color: var(--highlight-color);
}

textarea.field-input {
  resize: vertical;
  min-height: 80px;
}

.episode-row {
  display: flex;
  gap: 0.5rem;
}

.more-details {
  border-top: 1px solid var(--border-color);
  padding-top: 0.75rem;
}

/* Margins, not flex gap: browsers don't reliably lay out <details> as a flex box. */
.more-details > :not(summary) {
  margin-top: 1rem;
}

.more-details > .field {
  margin-top: 1.5rem;
}

.more-details summary {
  cursor: pointer;
  color: var(--text-primary);
  font-weight: 600;
}

.more-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
  gap: 0.75rem;
}

.editor-actions {
  display: flex;
  gap: 0.75rem;
}

.editor-actions .btn {
  flex: 1;
}

.btn {
  padding: 0.7rem 1.25rem;
  border: none;
  border-radius: 8px;
  font: inherit;
  font-weight: 600;
  cursor: pointer;
  white-space: nowrap;
  transition:
    transform 0.2s ease,
    opacity 0.2s ease;
}

.btn:disabled {
  opacity: 0.6;
  cursor: default;
}

.btn-primary {
  background: linear-gradient(135deg, var(--coral-light), var(--coral-primary));
  color: var(--text-on-accent, #fff);
}

.btn-danger {
  background: transparent;
  color: var(--error-color);
  border: 1px solid var(--error-color);
}

.btn-step {
  flex-shrink: 0;
  background: var(--bg-hover);
  color: var(--text-primary);
  border: 1px solid var(--border-color);
  padding: 0.7rem 0.9rem;
}

/* Phones: a slimmer panel with smaller fields. */
@media (max-width: 600px) {
  .watchlist-panel {
    margin: 1rem 0 1.75rem;
    padding: 0.9rem;
    border-radius: 12px;
  }

  .panel-head {
    margin-bottom: 0.7rem;
  }

  .panel-head h2 {
    font-size: 1rem;
  }

  .status-pill {
    font-size: 0.72rem;
  }

  .editor {
    gap: 0.7rem;
  }

  .field {
    gap: 0.3rem;
    font-size: 0.82rem;
  }

  .field-input {
    padding: 0.5rem 0.6rem;
    /* 16px keeps iOS from zooming into the field. */
    font-size: 16px;
  }

  .field-input:not(textarea) {
    height: 2.5rem;
  }

  select.field-input {
    padding-right: 2rem;
  }

  .btn {
    padding: 0.55rem 1rem;
    font-size: 0.9rem;
  }
}
</style>
