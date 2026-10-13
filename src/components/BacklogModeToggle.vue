<!--
  BacklogModeToggle.vue — backlog mode switch for the watchlist toolbar (component).

  Turns backlog mode on or off (composables/useBacklogMode.ts): while on, titles added
  or updated anywhere count toward total watch time but not toward today.
-->
<template>
  <span class="backlog-toggle-wrap">
    <button
      type="button"
      role="switch"
      class="backlog-toggle"
      :class="{ on: active }"
      :aria-checked="active"
      aria-describedby="backlog-mode-hint"
      data-testid="backlog-mode-toggle"
      @click="setActive(!active)"
    >
      <span class="track" aria-hidden="true"><span class="thumb"></span></span>
      <span class="label">Backlog Mode</span>
    </button>
    <!-- Title: Hover Note -->
    <span id="backlog-mode-hint" role="tooltip" class="backlog-hint">
      <strong>Logging shows you watched in the past?</strong>
      While this is on, anything you add or update counts toward your total watch time but not
      toward today. Set start and finish dates to put it on your calendar. Turns off after
      {{ BACKLOG_MODE_HOURS }} hours.
    </span>
  </span>
</template>

<script setup lang="ts">
import { BACKLOG_MODE_HOURS, useBacklogMode } from '@/composables/useBacklogMode'

const { active, setActive } = useBacklogMode()
</script>

<style scoped>
.backlog-toggle-wrap {
  position: relative;
  display: inline-flex;
}

.backlog-hint {
  position: absolute;
  top: calc(100% + 0.5rem);
  left: 0;
  z-index: 20;
  width: min(18rem, calc(100vw - 2rem));
  padding: 0.7rem 0.85rem;
  border: 1px solid var(--border-color);
  border-radius: 10px;
  background: var(--bg-card);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.18);
  color: var(--text-secondary);
  font-size: 0.82rem;
  line-height: 1.45;
  opacity: 0;
  visibility: hidden;
  transform: translateY(-4px);
  transition:
    opacity 0.15s ease,
    transform 0.15s ease,
    visibility 0.15s;
  pointer-events: none;
}

.backlog-hint strong {
  display: block;
  margin-bottom: 0.2rem;
  color: var(--text-primary);
}

.backlog-toggle-wrap:hover .backlog-hint,
.backlog-toggle:focus-visible + .backlog-hint {
  opacity: 1;
  visibility: visible;
  transform: none;
  transition-delay: 0.25s;
}

.backlog-toggle {
  display: inline-flex;
  align-items: center;
  gap: 0.55rem;
  height: 2.5rem;
  padding: 0 0.85rem;
  border: 1px solid var(--border-color);
  border-radius: 999px;
  background: var(--bg-card);
  color: var(--text-secondary);
  font: inherit;
  font-size: 0.9rem;
  font-weight: 600;
  cursor: pointer;
  transition:
    border-color 0.15s ease,
    color 0.15s ease;
}

.backlog-toggle:hover {
  border-color: var(--coral-primary);
}

.backlog-toggle:focus-visible {
  outline: 2px solid var(--coral-primary);
  outline-offset: 2px;
}

.backlog-toggle.on {
  border-color: var(--coral-primary);
  color: var(--text-primary);
}

.track {
  position: relative;
  width: 2rem;
  height: 1.1rem;
  border-radius: 999px;
  background: var(--bg-secondary);
  transition: background 0.15s ease;
}

.thumb {
  position: absolute;
  top: 0.15rem;
  left: 0.15rem;
  width: 0.8rem;
  height: 0.8rem;
  border-radius: 50%;
  background: var(--text-muted);
  transition:
    transform 0.15s ease,
    background 0.15s ease;
}

.on .track {
  background: var(--coral-primary);
}

.on .thumb {
  transform: translateX(0.9rem);
  background: #fff;
}
</style>
