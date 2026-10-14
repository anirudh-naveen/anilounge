<!--
  AppSheetSection.vue — one labelled group inside an AppSheet (component).

  A small uppercase heading over an inset card, like an iOS grouped list. `note` adds a
  coral word after the heading (e.g. "· All" while every chip is on). With `noteToggle` the
  note is a button: coral while `noteOn`, gray otherwise, emitting `toggle-note` on click.
-->
<template>
  <section class="sheet-section">
    <h3 class="sheet-section-title">
      {{ title
      }}<button
        v-if="note && noteToggle"
        type="button"
        class="sheet-section-note note-toggle"
        :class="{ off: !noteOn }"
        :aria-pressed="noteOn"
        @click="emit('toggle-note')"
      >
        · {{ note }}</button
      ><span v-else-if="note" class="sheet-section-note"> · {{ note }}</span>
    </h3>
    <div class="sheet-section-card" :class="{ plain }">
      <slot />
    </div>
  </section>
</template>

<script setup lang="ts">
defineProps<{
  title: string
  /** Coral note after the title. */
  note?: string
  /** No card behind the content. */
  plain?: boolean
  /** Make the note a toggle button. */
  noteToggle?: boolean
  /** Whether the toggle note is on (coral) or off (gray). */
  noteOn?: boolean
}>()

const emit = defineEmits<{ 'toggle-note': [] }>()
</script>

<style scoped>
.sheet-section + .sheet-section {
  margin-top: 1.25rem;
}

.sheet-section-title {
  margin: 0 0 0.45rem 0.85rem;
  font-size: 0.72rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--text-muted);
}

.sheet-section-note {
  color: var(--coral-primary);
}

.note-toggle {
  padding: 0 0 0 0.25rem;
  border: none;
  background: none;
  font: inherit;
  letter-spacing: inherit;
  text-transform: inherit;
  cursor: pointer;
}

.note-toggle.off {
  color: var(--text-muted);
}

.sheet-section-card {
  padding: 0.85rem;
  border-radius: 14px;
  background: var(--bg-card);
  border: 1px solid var(--border-color);
}

.sheet-section-card.plain {
  padding: 0;
  border: none;
  background: none;
}
</style>
