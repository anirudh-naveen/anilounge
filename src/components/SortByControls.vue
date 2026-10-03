<!--
  SortByControls.vue — catalog sort controls (component).

  One rounded control: the sort field on the left and an ascending/descending
  toggle on the right. Used by list views (Search, Watchlist).
-->
<template>
  <div class="sort-by-controls">
    <!-- Title: Label -->
    <label class="sort-label" :for="selectId">Sort by</label>
    <div class="sort-pill">
      <!-- Title: Field -->
      <div class="sort-field">
        <svg class="sort-icon" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path
            stroke="currentColor"
            stroke-width="1.75"
            stroke-linecap="round"
            d="M4 7h16M7 12h10M10 17h4"
          />
        </svg>
        <select :id="selectId" class="sort-select" :value="sortBy" @change="onSortByChange">
          <option v-for="opt in options" :key="opt.value" :value="opt.value">
            {{ opt.label }}
          </option>
        </select>
        <svg class="sort-chevron" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
            d="m7 10 5 5 5-5"
          />
        </svg>
      </div>
      <!-- Title: Direction Toggle -->
      <button
        type="button"
        class="sort-dir-btn"
        :title="sortDirection === 'asc' ? 'Ascending' : 'Descending'"
        :aria-label="sortDirection === 'asc' ? 'Sort ascending' : 'Sort descending'"
        @click="toggleDirection"
      >
        <svg
          class="dir-icon"
          :class="{ asc: sortDirection === 'asc' }"
          viewBox="0 0 24 24"
          fill="none"
          aria-hidden="true"
        >
          <path
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
            d="M12 5v14m-5-5 5 5 5-5"
          />
        </svg>
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useId } from 'vue'
import { DEFAULT_SORT_OPTIONS, type SortByOption, type SortDirection } from '@/utils/sorting'

const props = withDefaults(
  defineProps<{
    sortBy: SortByOption
    sortDirection: SortDirection
    options?: { value: SortByOption; label: string }[]
  }>(),
  {
    options: () => [...DEFAULT_SORT_OPTIONS],
  },
)

const emit = defineEmits<{
  'update:sortBy': [value: SortByOption]
  'update:sortDirection': [value: SortDirection]
}>()

const selectId = `sort-by-${useId()}`

const onSortByChange = (event: Event) => {
  emit('update:sortBy', (event.target as HTMLSelectElement).value as SortByOption)
}

const toggleDirection = () => {
  emit('update:sortDirection', props.sortDirection === 'asc' ? 'desc' : 'asc')
}
</script>

<style scoped>
.sort-by-controls {
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
}

.sort-label {
  color: var(--text-secondary);
  font-weight: 500;
  font-size: 0.85rem;
}

.sort-pill {
  display: flex;
  align-items: stretch;
  height: 40px;
  border: 1px solid var(--border-color);
  border-radius: 999px;
  background: var(--bg-card);
  box-shadow: 0 1px 2px rgba(21, 34, 56, 0.06);
  overflow: hidden;
  transition:
    border-color 0.15s ease,
    box-shadow 0.15s ease;
}

.sort-pill:hover {
  border-color: var(--border-hover);
}

.sort-pill:focus-within {
  border-color: var(--coral-primary);
  box-shadow: 0 0 0 3px rgba(224, 122, 95, 0.2);
}

.sort-field {
  position: relative;
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: center;
}

.sort-icon,
.sort-chevron {
  position: absolute;
  width: 16px;
  height: 16px;
  color: var(--text-muted);
  pointer-events: none;
}

.sort-icon {
  left: 0.85rem;
}

.sort-chevron {
  right: 0.7rem;
}

.sort-select {
  width: 100%;
  height: 100%;
  padding: 0 2rem 0 2.35rem;
  border: none;
  background: transparent;
  color: var(--text-primary);
  font: inherit;
  font-size: 0.9rem;
  font-weight: 500;
  cursor: pointer;
  appearance: none;
  -webkit-appearance: none;
}

.sort-select:focus {
  outline: none;
}

.sort-select option {
  background: var(--bg-card);
  color: var(--text-primary);
}

.sort-dir-btn {
  flex: 0 0 44px;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  border: none;
  border-left: 1px solid var(--border-color);
  background: transparent;
  color: var(--text-secondary);
  cursor: pointer;
  transition:
    background 0.15s ease,
    color 0.15s ease;
}

.sort-dir-btn:hover {
  background: var(--bg-hover);
  color: var(--coral-primary);
}

.sort-dir-btn:focus-visible {
  outline: none;
  background: var(--bg-hover);
  color: var(--coral-primary);
}

.dir-icon {
  width: 18px;
  height: 18px;
  transition: transform 0.2s ease;
}

.dir-icon.asc {
  transform: rotate(180deg);
}
</style>
