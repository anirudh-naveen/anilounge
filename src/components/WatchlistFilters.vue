<!--
  WatchlistFilters.vue — status and type filter chips for a watchlist (component).

  Two rows of pill chips: status (All, Planned, Watching, …) and type (Movies, Series,
  Seasons), split by a thin line. Several chips of a row can be picked together
  (Movies and Series, Planned and On hold); All clears the status row. Series and Seasons
  exclude each other, and at least one type chip stays picked. Each chip shows how many
  rows it alone would leave, given the other row's choice. Used on the Watchlist page and the profile Watchlist tab; the
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
        :class="{ active: isPicked(status, option.value) }"
        :aria-pressed="isPicked(status, option.value)"
        :data-testid="`watchlist-filter-status-${option.value}`"
        @click="status = toggleFilterChip(status, option.value, STATUS_VALUES)"
      >
        {{ option.label }} <span class="chip-count">{{ option.count }}</span>
      </button>
    </div>
    <hr class="filter-divider" />
    <div class="filter-row" role="group" aria-label="Filter by type">
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
  toggleFilterChip,
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

const STATUS_VALUES = WATCHLIST_STATUS_FILTER_OPTIONS.flatMap((option) =>
  option.value === 'all' ? [] : [option.value],
)

const isPicked = (picked: string[], value: string) =>
  value === 'all' ? !picked.length : picked.includes(value)

const statusChips = computed(() => {
  const rows = props.rows.filter((row) => matchesTypeChips(row.contentType, type.value))
  return WATCHLIST_STATUS_FILTER_OPTIONS.map((option) => ({
    ...option,
    count:
      option.value === 'all'
        ? rows.length
        : rows.filter((row) => row.status === option.value).length,
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
  gap: 0.5rem;
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
