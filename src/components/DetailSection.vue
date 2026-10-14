<!--
  DetailSection.vue — a titled, collapsible section on a details page (component).

  Every section on movie and series pages (Seasons, Episodes, Characters, Tags,
  Where to watch, Trailer, Forum, Staff, ...) uses this header so they share one
  heading size. Clicking the heading folds the section away; the choice is
  remembered per section name in this browser. `collapsible: false` gives just the
  heading. The `aside` slot sits at the heading's right (counts, small actions).
-->
<template>
  <section class="detail-section" :class="{ collapsed }" :data-section="name">
    <header class="detail-section-head">
      <h2 class="detail-section-title">
        <button
          v-if="collapsible"
          type="button"
          class="detail-section-toggle"
          :aria-expanded="!collapsed"
          :aria-controls="bodyId"
          :data-testid="`section-toggle-${name}`"
          @click="toggle"
        >
          <span>{{ title }}</span>
          <svg
            class="detail-section-chevron"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
            aria-hidden="true"
          >
            <path d="m6 9 6 6 6-6" />
          </svg>
        </button>
        <template v-else>{{ title }}</template>
      </h2>
      <div v-if="$slots.aside" class="detail-section-aside"><slot name="aside" /></div>
    </header>
    <div v-show="!collapsed" :id="bodyId" class="detail-section-body">
      <slot />
    </div>
  </section>
</template>

<script setup lang="ts">
import { ref, useId } from 'vue'

const STORAGE_KEY = 'anilounge:collapsed-sections'

const props = withDefaults(
  defineProps<{
    title: string
    /** Stable section name; keys the remembered open/closed state. */
    name: string
    collapsible?: boolean
  }>(),
  { collapsible: true },
)

const bodyId = useId()

const readCollapsed = (): string[] => {
  try {
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]')
    return Array.isArray(stored) ? stored : []
  } catch {
    return []
  }
}

const collapsed = ref(props.collapsible && readCollapsed().includes(props.name))

const toggle = () => {
  collapsed.value = !collapsed.value
  try {
    const others = readCollapsed().filter((item) => item !== props.name)
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify(collapsed.value ? [...others, props.name] : others),
    )
  } catch {
    // Remembering is a convenience; the toggle still works without storage.
  }
}
</script>

<style scoped>
.detail-section {
  margin-bottom: 2.25rem;
}

.detail-section-head {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  padding-bottom: 0.6rem;
  margin-bottom: 1rem;
  border-bottom: 1px solid var(--border-color);
}

.detail-section.collapsed .detail-section-head {
  margin-bottom: 0;
}

.detail-section-title {
  margin: 0;
  font-size: 1.5rem;
  font-weight: 700;
  line-height: 1.2;
  color: var(--text-primary);
}

.detail-section-toggle {
  display: inline-flex;
  align-items: center;
  /* Buttons center their text; a title that wraps stays left like the others. */
  justify-content: flex-start;
  gap: 0.5rem;
  padding: 0;
  text-align: left;
  border: 0;
  background: none;
  color: inherit;
  font: inherit;
  cursor: pointer;
}

.detail-section-toggle:hover .detail-section-chevron,
.detail-section-toggle:focus-visible .detail-section-chevron {
  color: var(--coral-primary);
}

.detail-section-chevron {
  width: 1.1rem;
  height: 1.1rem;
  color: var(--text-muted);
  transition:
    transform 0.2s ease,
    color 0.2s ease;
}

.detail-section.collapsed .detail-section-chevron {
  transform: rotate(-90deg);
}

.detail-section-aside {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.5rem;
  color: var(--text-muted);
  font-size: 0.9rem;
}

/* Phones: smaller section titles and spacing. */
@media (max-width: 600px) {
  .detail-section {
    margin-bottom: 1.6rem;
  }

  .detail-section-title {
    font-size: 1.15rem;
  }
}
</style>
