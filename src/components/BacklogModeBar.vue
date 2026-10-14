<!--
  BacklogModeBar.vue — site-wide reminder that backlog mode is on (component).

  Sits under the header on every page while backlog mode is on, so a user adding old
  titles from search or title pages knows their saves skip today, and can't forget the
  mode is on when they log something they really did watch today. In the app layout it
  is a coral glow around the screen edge instead, with a note (closable) each time the
  mode turns on.
-->
<template>
  <template v-if="isAppLayout">
    <Transition name="glow">
      <div
        v-if="active && authStore.isAuthenticated"
        class="backlog-glow"
        aria-hidden="true"
        data-testid="backlog-glow"
      ></div>
    </Transition>
    <Transition name="note">
      <div
        v-if="active && authStore.isAuthenticated && !noteClosed"
        class="backlog-note"
        role="status"
        data-testid="backlog-note"
      >
        <div class="note-head">
          <span class="backlog-badge">Backlog Mode</span>
          <button type="button" class="note-close" aria-label="Close" @click="noteClosed = true">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2">
              <path stroke-linecap="round" d="m7 7 10 10M17 7 7 17" />
            </svg>
          </button>
        </div>
        <p class="note-text">
          Titles you add or update count toward your total watch time but not toward today. Set
          start and finish dates to put them on your calendar. Turns off after
          {{ BACKLOG_MODE_HOURS }} hours.
        </p>
        <button
          type="button"
          class="backlog-off"
          data-testid="backlog-mode-off"
          @click="setActive(false)"
        >
          Turn off
        </button>
      </div>
    </Transition>
  </template>
  <div v-else-if="active && authStore.isAuthenticated" class="backlog-bar" role="status">
    <div class="backlog-content">
      <span class="backlog-badge">Backlog Mode</span>
      <span class="backlog-text">Watchlist saves will not count towards the date tracking.</span>
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
import { ref, watch } from 'vue'
import { BACKLOG_MODE_HOURS, useBacklogMode } from '@/composables/useBacklogMode'
import { isAppLayout } from '@/utils/nativeApp'

const authStore = useAuthStore()
const { active, setActive } = useBacklogMode()

/** App layout: the note was closed; it shows again the next time the mode turns on. */
const noteClosed = ref(false)
watch(active, (on) => {
  if (on) noteClosed.value = false
})
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

/* App layout */
.backlog-glow {
  position: fixed;
  inset: 0;
  z-index: 1050;
  pointer-events: none;
  border-radius: 0;
  box-shadow:
    inset 0 0 0 2px color-mix(in srgb, var(--coral-primary) 85%, transparent),
    inset 0 0 22px 4px color-mix(in srgb, var(--coral-primary) 55%, transparent);
  animation: glow-pulse 3.2s ease-in-out infinite;
}

@keyframes glow-pulse {
  50% {
    box-shadow:
      inset 0 0 0 2px color-mix(in srgb, var(--coral-light) 90%, transparent),
      inset 0 0 34px 8px color-mix(in srgb, var(--coral-primary) 45%, transparent);
  }
}

.backlog-note {
  position: fixed;
  left: calc(14px + var(--safe-left));
  right: calc(14px + var(--safe-right));
  top: calc(64px + var(--safe-top));
  z-index: 1060;
  max-width: 460px;
  margin: 0 auto;
  padding: 0.85rem 1rem 1rem;
  border-radius: 18px;
  border: 1px solid color-mix(in srgb, var(--coral-primary) 45%, transparent);
  background: color-mix(in srgb, var(--bg-card) 92%, transparent);
  box-shadow: 0 16px 40px rgba(8, 14, 26, 0.35);
  backdrop-filter: blur(18px);
  -webkit-backdrop-filter: blur(18px);
}

.note-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.note-close {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border: none;
  border-radius: 50%;
  background: var(--bg-secondary);
  color: var(--text-secondary);
  cursor: pointer;
}

.note-close svg {
  width: 15px;
  height: 15px;
}

.note-text {
  margin: 0.55rem 0 0.75rem;
  font-size: 0.875rem;
  line-height: 1.45;
  color: var(--text-secondary);
}

.glow-enter-active,
.glow-leave-active,
.note-enter-active,
.note-leave-active {
  transition:
    opacity 0.3s ease,
    transform 0.3s ease;
}

.glow-enter-from,
.glow-leave-to {
  opacity: 0;
}

.note-enter-from,
.note-leave-to {
  opacity: 0;
  transform: translateY(-12px) scale(0.97);
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
