<!--
  ListSearch.vue — rounded search box for filtering a list in place (component).

  Same height and pill shape as SortByControls, so the two sit side by side in list
  toolbars (Watchlist, profile Watchlist tab). Focus ring color comes from
  `--list-search-accent` (coral by default).
-->
<template>
  <label class="list-search">
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="11" cy="11" r="6.5" stroke="currentColor" stroke-width="1.75" />
      <path stroke="currentColor" stroke-width="1.75" stroke-linecap="round" d="m16 16 4 4" />
    </svg>
    <input
      v-model="model"
      type="search"
      :placeholder="placeholder"
      :aria-label="placeholder"
      v-bind="$attrs"
    />
  </label>
</template>

<script setup lang="ts">
defineOptions({ inheritAttrs: false })

defineProps<{ placeholder: string }>()

const model = defineModel<string>({ required: true })
</script>

<style scoped>
.list-search {
  position: relative;
  flex: 1 1 240px;
  display: flex;
  align-items: center;
}

.list-search svg {
  position: absolute;
  left: 0.85rem;
  width: 16px;
  height: 16px;
  color: var(--text-muted);
  pointer-events: none;
}

.list-search input {
  width: 100%;
  height: 40px;
  padding: 0 1rem 0 2.35rem;
  border: 1px solid var(--border-color);
  border-radius: 999px;
  background: var(--bg-card);
  color: var(--text-primary);
  font: inherit;
  font-size: 0.9rem;
  box-shadow: 0 1px 2px rgba(21, 34, 56, 0.06);
  transition:
    border-color 0.15s ease,
    box-shadow 0.15s ease;
}

.list-search input::placeholder {
  color: var(--text-muted);
}

.list-search input:hover {
  border-color: var(--border-hover);
}

.list-search input:focus {
  outline: none;
  border-color: var(--list-search-accent, var(--coral-primary));
  box-shadow: 0 0 0 3px
    color-mix(in srgb, var(--list-search-accent, var(--coral-primary)) 22%, transparent);
}
</style>
