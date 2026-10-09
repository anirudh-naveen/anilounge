<!--
  JoinPrompt.vue — sign-up nudge for signed-out visitors (component).

  A small card that slides up in the corner (a bottom sheet on phones) a few
  seconds after a signed-out visitor lands, e.g. from a search engine. It never
  covers the page, so the content stays readable (and indexable). Sign up / Sign
  in return to the current page afterwards (`?redirect=`). Closing it hides every
  prompt for the rest of the browser session.
-->
<template>
  <Transition name="join-prompt">
    <aside
      v-if="visible"
      class="join-prompt"
      role="complementary"
      :aria-label="title"
      data-testid="join-prompt"
    >
      <button type="button" class="join-close" aria-label="Close" @click="dismiss">×</button>
      <p class="join-kicker">AniLounge</p>
      <h2 class="join-title">{{ title }}</h2>
      <p class="join-message">{{ message }}</p>
      <div class="join-actions">
        <router-link
          :to="{ path: '/register', query: { redirect: route.fullPath } }"
          class="btn btn-primary btn-small"
          data-testid="join-signup"
          >Sign up free</router-link
        >
        <router-link
          :to="{ path: '/login', query: { redirect: route.fullPath } }"
          class="btn btn-ghost btn-small"
          data-testid="join-signin"
          >Sign in</router-link
        >
      </div>
    </aside>
  </Transition>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import { useAuthStore } from '@/stores/auth'

const props = withDefaults(defineProps<{ title: string; message: string; delayMs?: number }>(), {
  delayMs: 4000,
})

/** sessionStorage key: set once the visitor closes a prompt. */
const DISMISSED_KEY = 'anilounge-join-prompt-dismissed'

const route = useRoute()
const authStore = useAuthStore()
const due = ref(false)
const dismissed = ref(false)
let timer: ReturnType<typeof setTimeout> | undefined

const visible = computed(() => due.value && !dismissed.value && !authStore.isAuthenticated)

const dismiss = () => {
  dismissed.value = true
  try {
    sessionStorage.setItem(DISMISSED_KEY, '1')
  } catch {
    // Storage blocked: the prompt just comes back on the next page.
  }
}

onMounted(() => {
  try {
    dismissed.value = sessionStorage.getItem(DISMISSED_KEY) === '1'
  } catch {
    dismissed.value = false
  }
  if (!dismissed.value) timer = setTimeout(() => (due.value = true), props.delayMs)
})

onUnmounted(() => clearTimeout(timer))
</script>

<style scoped>
.join-prompt {
  position: fixed;
  right: 1.5rem;
  bottom: 1.5rem;
  z-index: 900;
  width: min(340px, calc(100vw - 2rem));
  padding: 1.15rem 1.25rem 1.2rem;
  border: 1px solid var(--border-color);
  border-radius: 16px;
  background: var(--bg-card);
  box-shadow: var(--shadow-md, 0 12px 32px rgba(0, 0, 0, 0.2));
}

.join-close {
  position: absolute;
  top: 0.5rem;
  right: 0.5rem;
  width: 1.9rem;
  height: 1.9rem;
  border: 0;
  border-radius: 50%;
  background: none;
  font-size: 1.25rem;
  line-height: 1;
  color: var(--text-secondary);
  cursor: pointer;
}

.join-close:hover {
  background: var(--bg-hover);
  color: var(--text-primary);
}

.join-kicker {
  font-size: 0.72rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--coral-deep);
}

.join-title {
  margin-top: 0.2rem;
  padding-right: 1.5rem;
  font-family: var(--font-display);
  font-size: 1.3rem;
  font-weight: 650;
  line-height: 1.25;
  color: var(--text-primary);
}

.join-message {
  margin-top: 0.4rem;
  font-size: 0.92rem;
  line-height: 1.5;
  color: var(--text-secondary);
}

.join-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  margin-top: 0.9rem;
}

.join-prompt-enter-active,
.join-prompt-leave-active {
  transition:
    opacity 0.25s ease,
    transform 0.25s ease;
}

.join-prompt-enter-from,
.join-prompt-leave-to {
  opacity: 0;
  transform: translateY(12px);
}

@media (max-width: 520px) {
  .join-prompt {
    right: 0;
    bottom: 0;
    left: 0;
    width: auto;
    border-radius: 16px 16px 0 0;
    border-bottom: 0;
  }
}

@media (prefers-reduced-motion: reduce) {
  .join-prompt-enter-active,
  .join-prompt-leave-active {
    transition: none;
  }
}
</style>
