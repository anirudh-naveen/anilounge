<template>
  <div class="sort-by-controls">
    <label class="sort-label">Sort by:</label>
    <div class="sort-row">
      <select class="sort-select" :value="sortBy" @change="onSortByChange">
        <option v-for="opt in options" :key="opt.value" :value="opt.value">
          {{ opt.label }}
        </option>
      </select>
      <button
        type="button"
        class="sort-dir-btn"
        :title="sortDirection === 'asc' ? 'Ascending' : 'Descending'"
        :aria-label="sortDirection === 'asc' ? 'Sort ascending' : 'Sort descending'"
        @click="toggleDirection"
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="1.75"
          aria-hidden="true"
        >
          <path
            class="dir-arrow"
            :class="{ active: sortDirection === 'asc' }"
            stroke-linecap="round"
            stroke-linejoin="round"
            d="M8 11 12 7l4 4"
          />
          <path
            class="dir-arrow"
            :class="{ active: sortDirection === 'desc' }"
            stroke-linecap="round"
            stroke-linejoin="round"
            d="M8 13 12 17l4-4"
          />
        </svg>
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
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
  gap: 0.25rem;
}

.sort-label {
  color: white;
  font-weight: 500;
  font-size: 0.85rem;
}

.sort-row {
  display: flex;
  align-items: stretch;
  gap: 0.4rem;
}

.sort-select {
  flex: 1;
  min-width: 0;
  padding: 0.5rem;
  border: none;
  border-radius: 6px;
  background: rgba(255, 255, 255, 0.9);
  color: #333;
  font-size: 0.9rem;
}

.sort-select:focus {
  outline: none;
  background: white;
  box-shadow: 0 0 0 2px var(--teal-primary);
}

.sort-dir-btn {
  flex: 0 0 38px;
  width: 38px;
  border: none;
  border-radius: 6px;
  background: rgba(255, 255, 255, 0.9);
  color: #8a8a8a;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0;
}

.sort-dir-btn:hover {
  background: white;
}

.sort-dir-btn svg {
  width: 18px;
  height: 18px;
  display: block;
}

.dir-arrow {
  color: #c0c0c0;
}

.dir-arrow.active {
  color: #555;
  stroke-width: 2.25;
}
</style>
