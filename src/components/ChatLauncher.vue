<!--
  ChatLauncher.vue — AI assistant trigger (component).

  Floating button rendered only by the Search view. Opens the catalog chatbot
  and loads its recommendation cards into the search results.
-->
<template>
  <div class="chat-launcher">
    <button
      v-if="!open"
      type="button"
      class="chat-trigger"
      data-testid="chat-launcher"
      title="AI Assistant"
      aria-label="Open AI Assistant"
      @click="open = true"
    >
      AI
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
import { ref } from 'vue'
import Chatbot from '@/components/Chatbot.vue'
import { defaultSearchFilters, useContentStore } from '@/stores/content'
import type { UnifiedContent } from '@/types/content'

const open = ref(false)
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
  bottom: 2rem;
  right: 2rem;
  z-index: 999;
}

.chat-trigger {
  width: 60px;
  height: 60px;
  border-radius: 50%;
  background: linear-gradient(135deg, var(--coral-primary), var(--teal-primary));
  border: none;
  color: white;
  font-size: 1rem;
  font-weight: 700;
  letter-spacing: 0.04em;
  line-height: 1;
  cursor: pointer;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
  transition: all 0.3s ease;
  display: flex;
  align-items: center;
  justify-content: center;
  text-align: center;
}

.chat-trigger:hover {
  transform: scale(1.1);
  box-shadow: 0 6px 30px rgba(0, 0, 0, 0.4);
}

@media (max-width: 768px) {
  .chat-launcher {
    bottom: 1rem;
    right: 1rem;
  }

  .chat-trigger {
    width: 50px;
    height: 50px;
    font-size: 0.9rem;
  }
}
</style>
