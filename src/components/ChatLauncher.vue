<!--
  ChatLauncher.vue — AI assistant trigger (component).

  Floating Lounge Guide button rendered only by the Search view. Opens the
  catalog chatbot (a sign-in prompt when signed out) and loads its
  recommendation cards into the search results. With `hide-trigger` the page opens it
  through `v-model:open` instead (the app layout's top bar button).
-->
<template>
  <div class="chat-launcher">
    <button
      v-if="!open && !hideTrigger"
      type="button"
      class="chat-trigger"
      data-testid="chat-launcher"
      title="Lounge Guide (AI Assistant)"
      aria-label="Open Lounge Guide, the AI assistant"
      @click="open = true"
    >
      <img src="/anilounge-logo.png" alt="" width="60" height="60" />
    </button>
    <Chatbot
      v-if="open"
      :show-chatbot="true"
      @close="open = false"
      @search-results="onSearchResults"
    />
  </div>
</template>

<script setup lang="ts">
import Chatbot from '@/components/Chatbot.vue'
import { defaultSearchFilters, useContentStore } from '@/stores/content'
import type { UnifiedContent } from '@/types/content'

defineProps<{ /** The page has its own button that opens the chat. */ hideTrigger?: boolean }>()

const open = defineModel<boolean>('open', { default: false })
const contentStore = useContentStore()

const onSearchResults = (results: UnifiedContent[]) => {
  const reset = defaultSearchFilters()
  contentStore.searchResults = results
  contentStore.searchFilters = reset
  contentStore.searchAppliedFilters = { ...reset }
}
</script>

<style scoped>
.chat-launcher {
  position: fixed;
  bottom: calc(2rem + var(--safe-bottom));
  right: calc(2rem + var(--safe-right));
  z-index: 999;
}

.chat-trigger {
  width: 60px;
  height: 60px;
  border-radius: 50%;
  padding: 3px;
  background: linear-gradient(135deg, var(--coral-primary), var(--teal-primary));
  border: none;
  overflow: hidden;
  cursor: pointer;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
  transition: all 0.3s ease;
  display: flex;
  align-items: center;
  justify-content: center;
  text-align: center;
}

.chat-trigger img {
  width: 100%;
  height: 100%;
  border-radius: 50%;
  object-fit: cover;
}

.chat-trigger:hover {
  transform: scale(1.1);
  box-shadow: 0 6px 30px rgba(0, 0, 0, 0.4);
}

@media (max-width: 768px) {
  .chat-launcher {
    bottom: calc(1rem + var(--safe-bottom));
    right: calc(1rem + var(--safe-right));
  }

  .chat-trigger {
    width: 50px;
    height: 50px;
  }
}
</style>
