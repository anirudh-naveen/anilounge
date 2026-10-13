<!--
  AppBar.vue — a page's controls in the app layout's top bar (component).

  Renders its slot into the top bar App.vue draws in the app layout (`#app-bar`), so
  each page decides what sits there (filters, search, compose). Renders nothing outside
  the app layout.
-->
<template>
  <Teleport v-if="isAppLayout" to="#app-bar" defer>
    <div class="app-bar-content">
      <slot />
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { isAppLayout } from '@/utils/nativeApp'
</script>

<style scoped>
.app-bar-content {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  width: 100%;
  min-width: 0;
}
</style>

<!-- Shared by the pages' bar controls (the bar's content is teleported, so not scoped). -->
<style>
.app-bar-button {
  position: relative;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  width: 38px;
  height: 38px;
  padding: 0;
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.08);
  color: #e8edf5;
  text-decoration: none;
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
  transition:
    background 0.15s ease,
    transform 0.15s ease;
}

.app-bar-button:active {
  transform: scale(0.92);
  background: rgba(255, 255, 255, 0.16);
}

.app-bar-button.active {
  color: var(--coral-light);
  border-color: color-mix(in srgb, var(--coral-light) 55%, transparent);
  background: rgba(224, 122, 95, 0.2);
}

.app-bar-button svg {
  width: 20px;
  height: 20px;
}

.app-bar-badge {
  position: absolute;
  top: -3px;
  right: -3px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 17px;
  height: 17px;
  padding: 0 4px;
  border-radius: 999px;
  background: var(--coral-primary);
  color: #fff;
  font-size: 0.62rem;
  font-weight: 700;
  line-height: 1;
  box-shadow: 0 0 0 2px var(--navbar-primary);
}

.app-bar-spacer {
  flex: 1;
}

/* Segmented control (Movies / Series), iOS style on the dark bar. */
.app-bar-segments {
  display: inline-flex;
  padding: 3px;
  gap: 2px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.08);
  border: 1px solid rgba(255, 255, 255, 0.08);
}

.app-bar-segments button {
  padding: 0.38rem 0.9rem;
  border: none;
  border-radius: 999px;
  background: transparent;
  color: rgba(232, 237, 245, 0.72);
  font: inherit;
  font-size: 0.85rem;
  font-weight: 650;
  cursor: pointer;
}

.app-bar-segments button.active {
  background: linear-gradient(135deg, var(--coral-light), var(--coral-primary));
  color: #fff;
  box-shadow: 0 4px 10px rgba(224, 122, 95, 0.3);
}

.app-bar-greeting {
  min-width: 0;
  display: flex;
  flex-direction: column;
  line-height: 1.15;
  color: #f7f8fa;
}

.app-bar-greeting small {
  font-size: 0.68rem;
  font-weight: 700;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--coral-light);
}

.app-bar-greeting strong {
  font-family: var(--font-display);
  font-size: 1.15rem;
  font-weight: 650;
  letter-spacing: -0.02em;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
</style>
