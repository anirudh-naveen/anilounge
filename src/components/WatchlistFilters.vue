<!--
  WatchlistFilters.vue — status and type filter chips for a watchlist (component).

  Two rows of pill chips: status (All, Planned, Watching, …) and type (All Types,
  Movies, Series). Each chip shows how many rows it would leave, given the other
  row's choice. Used on the Watchlist page and the profile Watchlist tab; the
  active chip color comes from `--filter-accent` (coral by default).
-->
<template>
  <div class="watchlist-filters">
    <div class="filter-row" role="group" aria-label="Filter by status">
      <button
        v-for="option in statusChips"
        :key="option.value"
        type="button"
        class="filter-chip"
        :class="{ active: status === option.value }"
        :aria-pressed="status === option.value"
        :data-testid="`watchlist-filter-status-${option.value}`"
        @click="status = option.value"
      >
        {{ option.label }} <span class="chip-count">{{ option.count }}</span>
      </button>
    </div>
    <div class="filter-row" role="group" aria-label="Filter by type">
      <button
        v-for="option in typeChips"
        :key="option.value"
        type="button"
        class="filter-chip"
        :class="{ active: type === option.value }"
        :aria-pressed="type === option.value"
        :data-testid="`watchlist-filter-type-${option.value}`"
        @click="type = option.value"
      >
        {{ option.label }} <span class="chip-count">{{ option.count }}</span>
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { matchesContentTypeFilter } from '@/services/api'
import {
  WATCHLIST_STATUS_FILTER_OPTIONS,
  WATCHLIST_TYPE_FILTER_OPTIONS,
  type WatchlistStatus,
  type WatchlistTypeFilter,
} from '@/utils/watchlist'

const props = defineProps<{
  /** Every row on the list, before filtering: its status and content type. */
  rows: { status: string; contentType?: string }[]
}>()

const status = defineModel<'all' | WatchlistStatus>('status', { required: true })
const type = defineModel<WatchlistTypeFilter>('type', { required: true })

const statusChips = computed(() => {
  const rows = props.rows.filter((row) => matchesContentTypeFilter(row.contentType, type.value))
  return WATCHLIST_STATUS_FILTER_OPTIONS.map((option) => ({
    ...option,
    count:
      option.value === 'all'
        ? rows.length
        : rows.filter((row) => row.status === option.value).length,
  }))
})

const typeChips = computed(() => {
  const rows = props.rows.filter((row) => status.value === 'all' || row.status === status.value)
  return WATCHLIST_TYPE_FILTER_OPTIONS.map((option) => ({
    ...option,
    count: rows.filter((row) => matchesContentTypeFilter(row.contentType, option.value)).length,
  }))
})
</script>

<style scoped>
.watchlist-filters {
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
}

.filter-row {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
}

.filter-chip {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  padding: 0.4rem 0.85rem;
  border: 1px solid var(--border-color);
  border-radius: 999px;
  background: var(--bg-card);
  color: var(--text-secondary);
  font-weight: 600;
  font-size: 0.85rem;
  cursor: pointer;
}

.filter-chip:hover:not(.active) {
  background: var(--bg-hover);
}

.filter-chip:focus-visible {
  outline: 2px solid var(--filter-accent, var(--coral-primary));
  outline-offset: 2px;
}

.filter-chip.active {
  background: var(--filter-accent, var(--coral-primary));
  border-color: var(--filter-accent, var(--coral-primary));
  color: var(--filter-on-accent, var(--text-on-accent, #fff));
}

.chip-count {
  opacity: 0.75;
  font-weight: 500;
}
</style>
