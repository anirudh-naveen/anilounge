<!--
  BacklogModeBar.vue — site-wide reminder that backlog mode is on (component).

  Sits under the header on every page while backlog mode is on, so a user adding old
  titles from search or title pages knows their saves skip today, and can't forget the
  mode is on when they log something they really did watch today.
-->
<template>
  <div v-if="active && authStore.isAuthenticated" class="backlog-bar" role="status">
    <div class="backlog-content">
      <span class="backlog-badge">Backlog mode</span>
      <span class="backlog-text"
        >Watchlist saves will not count towards the date tracking for now .</span
      >
      <button
        type="button"
        class="backlog-off"
        data-testid="backlog-mode-off"
        @click="setActive(false)"
      >
        Turn off
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useAuthStore } from '@/stores/auth'
import { useBacklogMode } from '@/composables/useBacklogMode'

const authStore = useAuthStore()
const { active, setActive } = useBacklogMode()
</script>

<style scoped>
.backlog-bar {
  border-bottom: 1px solid var(--coral-primary);
  background: var(--bg-hover);
  color: var(--text-primary);
}

.backlog-content {
  max-width: 1200px;
  margin: 0 auto;
  padding: 0.55rem 20px;
  display: flex;
  align-items: center;
  gap: 0.75rem;
  font-size: 0.875rem;
}

.backlog-badge {
  flex-shrink: 0;
  padding: 0.15rem 0.55rem;
  border-radius: 999px;
  background: var(--coral-primary);
  color: #fff;
  font-size: 0.75rem;
  font-weight: 700;
}

.backlog-text {
  flex: 1;
  color: var(--text-secondary);
}

.backlog-off {
  flex-shrink: 0;
  padding: 0.3rem 0.75rem;
  border: 1px solid var(--coral-primary);
  border-radius: 999px;
  background: none;
  color: var(--coral-deep);
  font: inherit;
  font-weight: 600;
  cursor: pointer;
}

.backlog-off:hover {
  background: var(--coral-primary);
  color: #fff;
}

.backlog-off:focus-visible {
  outline: 2px solid var(--coral-primary);
  outline-offset: 2px;
}

@media (max-width: 600px) {
  .backlog-content {
    padding: 0.5rem 16px;
    flex-wrap: wrap;
    gap: 0.4rem 0.6rem;
  }

  .backlog-text {
    flex-basis: 100%;
    order: 3;
  }

  .backlog-off {
    margin-left: auto;
  }
}
</style>
