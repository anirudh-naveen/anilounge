<!--
  CatalogFilterPanel.vue — the Search filter panel (component).

  Genre, language, country, year, season, airing status, and a 1–10 rating range, with
  a Clear All button. Anything in the default slot (Search's sort) sits above the rating.
  Used by the Search and Watchlist pages.
-->
<template>
  <div class="filters-container">
    <div class="filters-header">
      <h3>Filters</h3>
      <button type="button" class="clear-filters-btn" @click="emit('clear')">
        <i class="fas fa-times"></i>
        Clear All
      </button>
    </div>
    <div class="filters-bar">
      <div class="filter-group">
        <label :for="`${uid}-genre`">Genre</label>
        <select
          :id="`${uid}-genre`"
          :value="model.genre"
          data-testid="filter-genre"
          @change="set('genre', valueOf($event))"
        >
          <option value="all">All Genres</option>
          <option v-for="genre in GENRE_FILTER_OPTIONS" :key="genre" :value="genre">
            {{ genre }}
          </option>
        </select>
      </div>
      <div class="filter-group">
        <label :for="`${uid}-language`">Language</label>
        <select
          :id="`${uid}-language`"
          :value="model.language"
          data-testid="filter-language"
          @change="set('language', valueOf($event))"
        >
          <option value="all">All Languages</option>
          <option v-for="language in LANGUAGE_FILTER_OPTIONS" :key="language" :value="language">
            {{ language }}
          </option>
        </select>
      </div>
      <div class="filter-group">
        <label :for="`${uid}-country`">Country</label>
        <select
          :id="`${uid}-country`"
          :value="model.country"
          data-testid="filter-country"
          @change="set('country', valueOf($event))"
        >
          <option value="all">All Countries</option>
          <option
            v-for="country in ORIGIN_COUNTRY_OPTIONS"
            :key="country.value"
            :value="country.value"
          >
            {{ country.label }}
          </option>
        </select>
      </div>
      <div class="filter-row-time">
        <div class="filter-group">
          <label :for="`${uid}-year`">Year</label>
          <select
            :id="`${uid}-year`"
            :value="model.year"
            data-testid="filter-year"
            @change="set('year', valueOf($event))"
          >
            <option v-for="option in yearOptions" :key="option.value" :value="option.value">
              {{ option.label }}
            </option>
          </select>
        </div>
        <div class="filter-group">
          <label :for="`${uid}-season`">Season</label>
          <select
            :id="`${uid}-season`"
            :value="model.season"
            data-testid="filter-season"
            @change="set('season', valueOf($event))"
          >
            <option
              v-for="option in SEASON_FILTER_OPTIONS"
              :key="option.value"
              :value="option.value"
            >
              {{ option.label }}
            </option>
          </select>
        </div>
        <div class="filter-group">
          <label :for="`${uid}-status`">Status</label>
          <select
            :id="`${uid}-status`"
            :value="model.status"
            data-testid="filter-status"
            @change="set('status', valueOf($event))"
          >
            <option
              v-for="option in STATUS_FILTER_OPTIONS"
              :key="option.value"
              :value="option.value"
            >
              {{ option.label }}
            </option>
          </select>
        </div>
      </div>
      <slot />
      <div class="filter-group rating-filter">
        <label>{{ ratingLabel }}: {{ model.ratingMin }} – {{ model.ratingMax }}</label>
        <div class="rating-slider">
          <div class="rating-slider-track">
            <div class="rating-slider-range" :style="ratingFillStyle"></div>
          </div>
          <input
            :value="model.ratingMin"
            type="range"
            min="1"
            max="10"
            step="1"
            aria-label="Minimum rating"
            data-testid="filter-rating-min"
            @input="setRatingMin($event)"
          />
          <input
            :value="model.ratingMax"
            type="range"
            min="1"
            max="10"
            step="1"
            aria-label="Maximum rating"
            data-testid="filter-rating-max"
            @input="setRatingMax($event)"
          />
        </div>
        <div class="rating-slider-scale">
          <span v-for="n in 10" :key="n">{{ n }}</span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts" generic="T extends CatalogFilters">
import { computed, useId } from 'vue'
import {
  GENRE_FILTER_OPTIONS,
  LANGUAGE_FILTER_OPTIONS,
  type CatalogFilters,
} from '@/utils/catalogFilters'
import {
  ORIGIN_COUNTRY_OPTIONS,
  SEASON_FILTER_OPTIONS,
  STATUS_FILTER_OPTIONS,
  type YearSeasonOption,
} from '@/utils/searchFilters'

withDefaults(
  defineProps<{
    /** Year dropdown choices (Any year first). */
    yearOptions: YearSeasonOption[]
    /** Label over the rating range. */
    ratingLabel?: string
  }>(),
  { ratingLabel: 'Rating' },
)

const emit = defineEmits<{ clear: [] }>()

/** The filters; other fields on the object (sort, type) pass through untouched. */
const model = defineModel<T>({ required: true })

const uid = `catalog-filter-${useId()}`

const valueOf = (event: Event) => (event.target as HTMLSelectElement | HTMLInputElement).value

const set = <K extends keyof CatalogFilters>(key: K, value: CatalogFilters[K]) => {
  model.value = { ...model.value, [key]: value }
}

/** The two thumbs can meet but not cross. */
const setRatingMin = (event: Event) => {
  const value = Number(valueOf(event))
  set('ratingMin', Math.min(value, model.value.ratingMax))
}

const setRatingMax = (event: Event) => {
  const value = Number(valueOf(event))
  set('ratingMax', Math.max(value, model.value.ratingMin))
}

const ratingFillStyle = computed(() => {
  const left = ((model.value.ratingMin - 1) / 9) * 100
  const right = ((model.value.ratingMax - 1) / 9) * 100
  return {
    clipPath: `inset(0 ${Math.max(0, 100 - right)}% 0 ${Math.max(0, left)}% round 999px)`,
  }
})
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
  align-items: start;
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  padding: 1.5rem;
  border-radius: 12px;
  backdrop-filter: blur(10px);
}

.filter-group {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  min-width: 0;
}

.rating-filter {
  grid-column: 1 / -1;
}

.filter-row-time {
  grid-column: 1 / -1;
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 0.75rem 1rem;
}

.filter-group label {
  color: var(--text-secondary);
  font-weight: 500;
  font-size: 0.85rem;
}

/* Same rounded control as SortByControls, so every filter reads as one set. */
.filter-group select {
  height: 40px;
  padding: 0 2.25rem 0 1rem;
  border: 1px solid var(--border-color);
  border-radius: 999px;
  background-color: var(--bg-card);
  /* Chevron drawn from two gradients so it follows the theme's muted text color. */
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

.filter-group select:disabled {
  opacity: 0.55;
  cursor: not-allowed;
  background-color: var(--bg-muted);
}

.rating-slider {
  position: relative;
  height: 34px;
  display: flex;
  align-items: center;
}

/* Inset by half a thumb, so the colored range ends under each thumb's center. */
.rating-slider-track {
  position: absolute;
  left: 12px;
  right: 12px;
  height: 8px;
  border-radius: 999px;
  /* Neutral outside the picked range, so the colored range stands out. */
  background: var(--bg-muted-hover);
  box-shadow: inset 0 0 0 1px var(--border-color);
}

.rating-slider-range {
  position: absolute;
  inset: 0;
  border-radius: 999px;
  background: linear-gradient(90deg, #ef4444 0%, #facc15 50%, #22c55e 100%);
}

.rating-slider input[type='range'] {
  position: absolute;
  left: 0;
  width: 100%;
  margin: 0;
  background: none;
  appearance: none;
  -webkit-appearance: none;
  pointer-events: none;
  height: 8px;
}

.rating-slider input[type='range']::-webkit-slider-thumb {
  appearance: none;
  -webkit-appearance: none;
  pointer-events: auto;
  width: 24px;
  height: 24px;
  border-radius: 50%;
  border: 3px solid var(--coral-primary);
  background: #fff;
  box-shadow: 0 2px 6px rgba(21, 34, 56, 0.35);
  cursor: pointer;
}

.rating-slider input[type='range']::-moz-range-thumb {
  pointer-events: auto;
  width: 24px;
  height: 24px;
  border-radius: 50%;
  border: 3px solid var(--coral-primary);
  background: #fff;
  box-shadow: 0 2px 6px rgba(21, 34, 56, 0.35);
  cursor: pointer;
}

.rating-slider input[type='range']:nth-of-type(1) {
  z-index: 2;
}

.rating-slider input[type='range']:nth-of-type(2) {
  z-index: 3;
}

.rating-slider-scale {
  display: flex;
  justify-content: space-between;
  color: var(--text-secondary);
  font-size: 0.72rem;
  font-weight: 600;
  padding: 0 8px;
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
  transition: all 0.3s ease;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  text-align: center;
  gap: 0.4rem;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
  flex-shrink: 0;
  white-space: nowrap;
}

.clear-filters-btn:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
}

.clear-filters-btn i {
  font-size: 0.7rem;
}

@media (max-width: 900px) {
  .filters-bar {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .rating-filter,
  .filter-row-time {
    grid-column: 1 / -1;
  }
}

@media (max-width: 768px) {
  .filters-bar {
    grid-template-columns: 1fr;
    gap: 1rem;
    padding: 1rem;
  }

  .rating-filter,
  .filter-row-time {
    grid-column: 1;
  }

  .filter-row-time {
    grid-template-columns: 1fr;
  }

  .clear-filters-btn {
    padding: 0.4rem 0.8rem;
    font-size: 0.75rem;
  }
}
</style>
