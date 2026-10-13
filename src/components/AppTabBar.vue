<!--
  AppTabBar.vue — the app layout's bottom tab bar (component).

  A floating, frosted bar over the page with the five sections: Home, Forum, Watchlist,
  Search, and Profile (the viewer's avatar). Tapping the open tab again scrolls its page
  to the top, as iOS tab bars do. Only shown in the app layout (utils/nativeApp.ts).
-->
<template>
  <nav class="tab-bar" aria-label="Sections">
    <router-link
      v-for="tab in APP_TABS"
      :key="tab.name"
      :to="tab.to"
      class="tab"
      :class="{ active: activeTab === tab.name }"
      :aria-current="activeTab === tab.name ? 'page' : undefined"
      :data-testid="`tab-${tab.name}`"
      @click="onTap(tab.name)"
    >
      <span class="tab-icon" aria-hidden="true">
        <template v-if="tab.name === 'profile'">
          <UserAvatar
            :src="authStore.user?.profilePicture"
            :name="authStore.user?.username"
            :size="26"
            class="tab-avatar"
          />
          <span v-if="unread" class="tab-dot" data-testid="tab-unread-dot"></span>
        </template>
        <svg
          v-else
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="1.8"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <path v-for="path in tab.paths" :key="path" :d="path" />
          <circle v-if="tab.name === 'search'" cx="11" cy="11" r="6.25" />
        </svg>
      </span>
      <span class="tab-label">{{ tab.label }}</span>
    </router-link>
  </nav>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { useInboxStore } from '@/stores/inbox'
import { useMessagesStore } from '@/stores/messages'
import { APP_TABS, appTabFor, type AppTabName } from '@/utils/appTabs'
import { haptic } from '@/utils/nativeApp'
import UserAvatar from '@/components/UserAvatar.vue'

const route = useRoute()
const authStore = useAuthStore()
const inboxStore = useInboxStore()
const messagesStore = useMessagesStore()

const activeTab = computed(() => appTabFor(route))
const unread = computed(() => Boolean(messagesStore.total || inboxStore.counts.total))

const onTap = (name: AppTabName) => {
  haptic()
  if (name === activeTab.value) window.scrollTo({ top: 0, behavior: 'smooth' })
}
</script>

<style scoped>
.tab-bar {
  position: fixed;
  left: calc(12px + var(--safe-left));
  right: calc(12px + var(--safe-right));
  bottom: max(10px, calc(var(--safe-bottom) - 6px));
  z-index: 900;
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  max-width: 480px;
  margin: 0 auto;
  padding: 6px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--navbar-primary) 78%, transparent);
  border: 1px solid rgba(255, 255, 255, 0.1);
  box-shadow:
    0 12px 32px rgba(8, 14, 26, 0.35),
    inset 0 1px 0 rgba(255, 255, 255, 0.08);
  backdrop-filter: blur(22px) saturate(170%);
  -webkit-backdrop-filter: blur(22px) saturate(170%);
}

.tab {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 2px;
  height: 52px;
  border-radius: 999px;
  color: rgba(232, 237, 245, 0.62);
  text-decoration: none;
  -webkit-tap-highlight-color: transparent;
  transition:
    color 0.2s ease,
    background 0.2s ease;
}

.tab:active {
  transform: scale(0.94);
}

.tab.active {
  color: var(--coral-light);
  background: rgba(224, 122, 95, 0.16);
}

.tab-icon {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
}

.tab-icon svg {
  width: 24px;
  height: 24px;
}

.tab-avatar {
  opacity: 0.85;
  box-shadow: 0 0 0 1.5px rgba(232, 237, 245, 0.35);
}

.tab.active .tab-avatar {
  opacity: 1;
  box-shadow: 0 0 0 2px var(--coral-light);
}

.tab-dot {
  position: absolute;
  top: -1px;
  right: -3px;
  width: 9px;
  height: 9px;
  border-radius: 50%;
  background: var(--coral-primary);
  box-shadow: 0 0 0 2px var(--navbar-primary);
}

.tab-label {
  font-size: 0.65rem;
  font-weight: 600;
  letter-spacing: 0.01em;
  line-height: 1;
}
</style>
