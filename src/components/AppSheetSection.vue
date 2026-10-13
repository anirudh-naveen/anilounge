<!--
  AppSheetSection.vue — one labelled group inside an AppSheet (component).

  A small uppercase heading over an inset card, like an iOS grouped list.
-->
<template>
  <section class="sheet-section">
    <h3 class="sheet-section-title">{{ title }}</h3>
    <div class="sheet-section-card" :class="{ plain }">
      <slot />
    </div>
  </section>
</template>

<script setup lang="ts">
defineProps<{ title: string; /** No card behind the content. */ plain?: boolean }>()
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
