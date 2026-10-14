<!--
  WatchlistFilters.vue — type and status filter chips for a watchlist (component).

  Two labelled rows of pill chips: type (Movies, Series, Seasons) over status (Watching,
  Completed, …), split by a thin line. Every chip toggles on its own and several can be
  picked together; at least one chip per row stays picked. All statuses start picked,
  which the Status label shows as All. Series and Seasons exclude each other. Each chip
  shows how many rows it alone would leave, given the other row's choice. Used on the
  Watchlist page and the profile Watchlist tab; the active chip color comes from
  `--filter-accent` (coral by default).
-->
<template>
  <div class="watchlist-filters">
    <div class="filter-row" role="group" aria-label="Filter by type">
      <span class="row-label">Type</span>
      <button
        v-for="option in typeChips"
        :key="option.value"
        type="button"
        class="filter-chip"
        :class="{ active: type.includes(option.value) }"
        :aria-pressed="type.includes(option.value)"
        :data-testid="`watchlist-filter-type-${option.value}`"
        @click="type = toggleTypeChip(type, option.value)"
      >
        {{ option.label }} <span class="chip-count">{{ option.count }}</span>
      </button>
    </div>
    <hr class="filter-divider" />
    <div class="filter-row" role="group" aria-label="Filter by status">
      <span class="row-label">
        Status<span v-if="!status.length" class="row-all" data-testid="watchlist-status-all">
          · All</span
        >
      </span>
      <button
        v-for="option in statusChips"
        :key="option.value"
        type="button"
        class="filter-chip"
        :class="{ active: isPicked(option.value) }"
        :aria-pressed="isPicked(option.value)"
        :data-testid="`watchlist-filter-status-${option.value}`"
        @click="status = toggleStatusChip(status, option.value)"
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
  matchesStatusChips,
  matchesTypeChips,
  toggleStatusChip,
  toggleTypeChip,
  type WatchlistStatus,
  type WatchlistTypeChoice,
} from '@/utils/watchlist'

const props = defineProps<{
  /** Every row on the list, before filtering: its status and content type. */
  rows: { status: string; contentType?: string }[]
}>()

/** Picked chips per row; an empty status row means All. */
const status = defineModel<WatchlistStatus[]>('status', { required: true })
const type = defineModel<WatchlistTypeChoice[]>('type', { required: true })

/** Empty means every status is picked (All). */
const isPicked = (value: WatchlistStatus) => !status.value.length || status.value.includes(value)

const statusChips = computed(() => {
  const rows = props.rows.filter((row) => matchesTypeChips(row.contentType, type.value))
  return WATCHLIST_STATUS_FILTER_OPTIONS.map((option) => ({
    ...option,
    count: rows.filter((row) => row.status === option.value).length,
  }))
})

const typeChips = computed(() => {
  const rows = props.rows.filter((row) => matchesStatusChips(row.status, status.value))
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
  align-items: center;
  gap: 0.5rem;
}

.row-label {
  display: inline-flex;
  align-items: center;
  flex-shrink: 0;
  min-width: 3.4rem;
  font-size: 0.72rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--text-muted);
}

.row-all {
  margin-left: 0.25rem;
  color: var(--filter-accent, var(--coral-primary));
}

.filter-divider {
  margin: 0;
  border: none;
  border-top: 1px solid var(--border-color);
}

.filter-chip {
  display: inline-flex;
  flex-shrink: 0;
  white-space: nowrap;
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

/* Phones: each row is one line that scrolls sideways instead of wrapping. */
@media (max-width: 600px) {
  .filter-row {
    flex-wrap: nowrap;
    overflow-x: auto;
    margin: -2px;
    padding: 2px;
    scrollbar-width: none;
  }

  .filter-row::-webkit-scrollbar {
    display: none;
  }
}
</style>
