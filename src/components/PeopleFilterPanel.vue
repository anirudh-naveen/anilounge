<!--
  PeopleFilterPanel.vue — the Search filter panel for the Characters and Voice Actors
  tabs (component).

  Characters: role (Main / Supporting / Cameo) and where they appear (movies or
  series). Voice actors: dub language. Both: sort, with a Clear All button. Same look
  as CatalogFilterPanel, which the Movies/Series tabs use.
-->
<template>
  <div class="filters-container" data-testid="people-filters">
    <div class="filters-header">
      <h3>Filters</h3>
      <button type="button" class="clear-filters-btn" @click="emit('clear')">
        <i class="fas fa-times"></i>
        Clear All
      </button>
    </div>
    <div class="filters-bar">
      <template v-if="kind === 'character'">
        <div class="filter-group">
          <label :for="`${uid}-role`">Role</label>
          <select
            :id="`${uid}-role`"
            :value="model.role"
            data-testid="filter-role"
            @change="set('role', valueOf($event) as PeopleFilters['role'])"
          >
            <option value="all">Any Role</option>
            <option value="main">Main</option>
            <option value="supporting">Supporting</option>
            <option value="cameo">Cameo</option>
          </select>
        </div>
        <div class="filter-group">
          <label :for="`${uid}-media`">Appears In</label>
          <select
            :id="`${uid}-media`"
            :value="model.media"
            data-testid="filter-media"
            @change="set('media', valueOf($event) as PeopleFilters['media'])"
          >
            <option value="all">Movies & Series</option>
            <option value="movie">Movies</option>
            <option value="series">Series</option>
          </select>
        </div>
      </template>
      <div v-else class="filter-group">
        <label :for="`${uid}-language`">Dub Language</label>
        <select
          :id="`${uid}-language`"
          :value="model.language"
          data-testid="filter-dub-language"
          @change="set('language', valueOf($event))"
        >
          <option value="all">All Languages</option>
          <option v-for="language in languageOptions" :key="language" :value="language">
            {{ language }}
          </option>
        </select>
      </div>
      <SortByControls
        :sort-by="model.sortBy"
        :sort-direction="model.sortDirection"
        :options="PEOPLE_SORT_OPTIONS[kind]"
        class="people-sort"
        @update:sort-by="set('sortBy', $event)"
        @update:sort-direction="set('sortDirection', $event)"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, useId } from 'vue'
import SortByControls from '@/components/SortByControls.vue'
import {
  PEOPLE_SORT_OPTIONS,
  type PeopleFilters,
  type PeopleKind,
} from '@/composables/usePeopleSearch'

const props = defineProps<{
  kind: PeopleKind
  /** Dub languages that have credits, most credited first. */
  languages?: string[]
}>()
const emit = defineEmits<{ clear: [] }>()
const model = defineModel<PeopleFilters>({ required: true })

const uid = `people-filter-${useId()}`
const valueOf = (event: Event) => (event.target as HTMLSelectElement).value

/** The stored languages, keeping a picked one listed even before they load. */
const languageOptions = computed(() => {
  const list = props.languages?.length ? [...props.languages] : ['Japanese', 'English']
  if (model.value.language !== 'all' && !list.includes(model.value.language)) {
    list.unshift(model.value.language)
  }
  return list
})

const set = <K extends keyof PeopleFilters>(key: K, value: PeopleFilters[K]) => {
  // Name reads A–Z by default; counts read highest first.
  const direction: Partial<PeopleFilters> =
    key === 'sortBy' ? { sortDirection: value === 'name' ? 'asc' : 'desc' } : {}
  model.value = { ...model.value, ...direction, [key]: value }
}
</script>

<style scoped>
.filters-container {
  margin-bottom: 2rem;
  position: relative;
}

.filters-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  margin-bottom: 1rem;
}

.filters-header h3 {
  color: var(--text-primary);
  font-size: 1.2rem;
  font-weight: 600;
  margin: 0;
}

.filters-bar {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 0.75rem 1rem;
  align-items: end;
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  padding: 1.5rem;
  border-radius: 12px;
}

.filter-group {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  min-width: 0;
}

.filter-group label {
  color: var(--text-secondary);
  font-weight: 500;
  font-size: 0.85rem;
}

/* Same rounded control as SortByControls and CatalogFilterPanel. */
.filter-group select {
  height: 40px;
  padding: 0 2.25rem 0 1rem;
  border: 1px solid var(--border-color);
  border-radius: 999px;
  background-color: var(--bg-card);
  background-image:
    linear-gradient(45deg, transparent 50%, var(--text-muted) 50%),
    linear-gradient(135deg, var(--text-muted) 50%, transparent 50%);
  background-position:
    calc(100% - 1.15rem) 50%,
    calc(100% - 0.85rem) 50%;
  background-size: 5px 5px;
  background-repeat: no-repeat;
  box-shadow: 0 1px 2px rgba(21, 34, 56, 0.06);
  color: var(--text-primary);
  font: inherit;
  font-size: 0.9rem;
  font-weight: 500;
  cursor: pointer;
  appearance: none;
  -webkit-appearance: none;
  transition:
    border-color 0.15s ease,
    box-shadow 0.15s ease;
}

.filter-group select:hover {
  border-color: var(--border-hover);
}

.filter-group select:focus {
  outline: none;
  border-color: var(--coral-primary);
  box-shadow: 0 0 0 3px rgba(224, 122, 95, 0.2);
}

.filter-group select option {
  background: var(--bg-card);
  color: var(--text-primary);
}

.clear-filters-btn {
  background: linear-gradient(135deg, var(--coral-primary), var(--teal-primary));
  color: white;
  border: none;
  padding: 0.5rem 1rem;
  border-radius: 8px;
  cursor: pointer;
  font-weight: 600;
  font-size: 0.8rem;
  line-height: 1.15;
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
}

.clear-filters-btn i {
  font-size: 0.7rem;
}

@media (max-width: 768px) {
  .filters-bar {
    grid-template-columns: 1fr;
    gap: 1rem;
    padding: 1rem;
  }
}
</style>
