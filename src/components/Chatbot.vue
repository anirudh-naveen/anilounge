<!-- eslint-disable vue/multi-word-component-names -->
<!--
  Chatbot.vue — catalog-grounded AI recommendation chat.

  Modal chat UI that sends queries to /ai/chat and renders returned catalog
  rows with the same poster-card fields Search uses.
-->
<template>
  <div class="chatbot-container" data-testid="chatbot">
    <!-- Title: Header -->
    <div class="chatbot-header">
      <h3>AI Assistant</h3>
      <button
        @click="toggleChatbot"
        class="close-btn"
        type="button"
        aria-label="Close AI assistant"
      >
        ×
      </button>
    </div>

    <!-- Title: Transcript -->
    <div class="chatbot-messages" ref="messagesContainer">
      <div v-for="message in messages" :key="message.id" :class="['message', message.type]">
        <div class="message-content">
          <div v-if="message.type === 'bot'" class="bot-avatar">AI</div>
          <div class="message-text">{{ message.text }}</div>
        </div>
        <div v-if="message.results?.length" class="chat-results" data-testid="chat-results">
          <button
            v-for="item in message.results"
            :key="item._id"
            type="button"
            class="chat-result-card poster-frame"
            @click="openDetails(item)"
          >
            <div class="chat-result-poster">
              <img
                :src="getPosterUrl(item.posterPath || '')"
                :alt="getDisplayTitle(item)"
                @error="handleImageError"
              />
              <div
                class="content-type-badge poster-corner-tag poster-corner-tag-right"
                :class="getContentTypeBadgeClass(item.contentType)"
              >
                {{ getCardContentTypeDisplay(item.contentType) }}
              </div>
            </div>
            <span class="chat-result-title">{{ getDisplayTitle(item) }}</span>
            <span v-if="getNativeTitle(item)" class="chat-result-native">{{
              getNativeTitle(item)
            }}</span>
            <span v-if="item.why" class="chat-result-why">{{ item.why }}</span>
          </button>
        </div>
        <div class="message-time">{{ formatTime(message.timestamp) }}</div>
      </div>

      <div v-if="isTyping" class="message bot">
        <div class="message-content">
          <div class="bot-avatar">AI</div>
          <div class="typing-indicator">
            <span></span>
            <span></span>
            <span></span>
          </div>
        </div>
      </div>
    </div>

    <!-- Title: Composer -->
    <div class="chatbot-input">
      <input
        v-model="inputMessage"
        data-testid="chat-input"
        @keyup.enter="sendMessage"
        placeholder="Ask about a title, studio, voice actor, or genre..."
        :disabled="isTyping"
      />
      <button
        data-testid="chat-send"
        type="button"
        @click="sendMessage"
        :disabled="!inputMessage.trim() || isTyping"
      >
        Send
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, nextTick, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import {
  aiAPI,
  getCardContentTypeDisplay,
  getContentTypeBadgeClass,
  getDetailsRouteName,
  getPosterUrl,
} from '@/services/api'
import { getDisplayTitle, getNativeTitle } from '@/utils/titles'
import type { UnifiedContent } from '@/types/content'

interface Message {
  id: string
  type: 'user' | 'bot'
  text: string
  timestamp: Date
  results?: UnifiedContent[]
}

defineProps<{
  showChatbot: boolean
}>()

const emit = defineEmits<{
  close: []
  'search-results': [results: UnifiedContent[]]
}>()

const router = useRouter()
const route = useRoute()

const messages = ref<Message[]>([])
const inputMessage = ref('')
const isTyping = ref(false)
const messagesContainer = ref<HTMLElement>()

const toggleChatbot = () => {
  emit('close')
}

const handleImageError = (event: Event) => {
  const img = event.target as HTMLImageElement
  img.src = '/placeholder-movie.jpg'
}

const openDetails = (item: UnifiedContent) => {
  router.push({
    name: getDetailsRouteName(item),
    params: { id: item._id },
    query: { from: route.fullPath },
  })
}

const sendMessage = async () => {
  if (!inputMessage.value.trim() || isTyping.value) return

  const userMessage: Message = {
    id: Date.now().toString(),
    type: 'user',
    text: inputMessage.value.trim(),
    timestamp: new Date(),
  }

  messages.value.push(userMessage)
  const query = userMessage.text
  inputMessage.value = ''

  isTyping.value = true
  await nextTick()
  scrollToBottom()

  const history = messages.value
    .filter((message) => message.id !== 'welcome' && message.id !== userMessage.id)
    .slice(-12)
    .map((message) => ({
      role: message.type === 'user' ? 'user' : 'model',
      text: message.text,
    }))

  try {
    const response = await aiAPI.chat(query, history)
    const data = response.data?.data ?? response.data
    const results: UnifiedContent[] = Array.isArray(data.results) ? data.results : []

    const botMessage: Message = {
      id: (Date.now() + 1).toString(),
      type: 'bot',
      text: data.response || "Sorry, I couldn't process your request.",
      timestamp: new Date(),
      results,
    }

    messages.value.push(botMessage)

    if (results.length) {
      emit('search-results', results)
    }
  } catch (error) {
    console.error('Chatbot error:', error)
    const errorMessage: Message = {
      id: (Date.now() + 1).toString(),
      type: 'bot',
      text: "Sorry, I'm having trouble connecting right now. Please try again later.",
      timestamp: new Date(),
    }
    messages.value.push(errorMessage)
  } finally {
    isTyping.value = false
    await nextTick()
    scrollToBottom()
  }
}

const scrollToBottom = () => {
  if (messagesContainer.value) {
    messagesContainer.value.scrollTop = messagesContainer.value.scrollHeight
  }
}

const formatTime = (date: Date) => {
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

onMounted(() => {
  const welcomeMessage: Message = {
    id: 'welcome',
    type: 'bot',
    text: 'Hi! I can talk about animated movies, series, studios, voice actors, and genres in the AniLounge catalog. Try "Studio Ghibli movies", "what is isekai", or "something like Frieren".',
    timestamp: new Date(),
  }
  messages.value.push(welcomeMessage)
})
</script>

<style scoped>
.chatbot-container {
  position: fixed;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  width: 80vw;
  height: 80vh;
  max-width: 1200px;
  max-height: 800px;
  background: var(--bg-primary);
  border: 1px solid var(--border-color);
  border-radius: 12px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
  display: flex;
  flex-direction: column;
  z-index: 1000;
}

.chatbot-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 1rem;
  border-bottom: 1px solid var(--border-color);
  background: var(--bg-secondary);
  border-radius: 12px 12px 0 0;
}

.chatbot-header h3 {
  margin: 0;
  color: var(--text-primary);
  font-size: 1.1rem;
}

.close-btn {
  background: none;
  border: none;
  font-size: 1.5rem;
  color: var(--text-secondary);
  cursor: pointer;
  padding: 0.25rem;
  border-radius: 4px;
  transition: background-color 0.2s;
}

.close-btn:hover {
  background: var(--bg-primary);
}

.chatbot-messages {
  flex: 1;
  padding: 1rem;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.message {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.message.user {
  align-items: flex-end;
}

.message.bot {
  align-items: flex-start;
}

.message-content {
  display: flex;
  align-items: flex-start;
  gap: 0.5rem;
  max-width: 80%;
}

.message.user .message-content {
  flex-direction: row-reverse;
}

.bot-avatar {
  font-size: 1.2rem;
  flex-shrink: 0;
}

.message-text {
  background: var(--bg-secondary);
  padding: 0.75rem 1rem;
  border-radius: 12px;
  color: var(--text-primary);
  font-size: 0.9rem;
  line-height: 1.4;
  white-space: pre-wrap;
}

.message.user .message-text {
  background: var(--highlight-color);
  color: white;
}

.message-time {
  font-size: 0.75rem;
  color: var(--text-secondary);
  margin-top: 0.25rem;
}

.chat-results {
  display: flex;
  gap: 0.75rem;
  overflow-x: auto;
  max-width: 100%;
  padding: 0.25rem 0 0.5rem;
}

.chat-result-card {
  flex: 0 0 168px;
  width: 168px;
  background: var(--bg-secondary);
  border: 1px solid var(--border-color);
  border-radius: 10px;
  padding: 0;
  cursor: pointer;
  text-align: left;
  color: var(--text-primary);
}

.chat-result-card:hover {
  border-color: var(--highlight-color);
}

.chat-result-poster {
  position: relative;
  width: 100%;
  aspect-ratio: 2 / 3;
  overflow: hidden;
  border-radius: 10px 10px 0 0;
}

.chat-result-poster img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.chat-result-title,
.chat-result-native {
  display: block;
  padding: 0.4rem 0.5rem 0;
  font-size: 0.8rem;
  line-height: 1.3;
}

.chat-result-title {
  font-weight: 600;
}

.chat-result-native {
  padding-bottom: 0.15rem;
  color: var(--text-secondary);
  font-size: 0.72rem;
}

.chat-result-why {
  display: -webkit-box;
  -webkit-line-clamp: 3;
  line-clamp: 3;
  -webkit-box-orient: vertical;
  overflow: hidden;
  padding: 0.15rem 0.5rem 0.55rem;
  color: var(--text-secondary);
  font-size: 0.7rem;
  line-height: 1.3;
}

.typing-indicator {
  display: flex;
  gap: 0.25rem;
  padding: 0.75rem 1rem;
  background: var(--bg-secondary);
  border-radius: 12px;
}

.typing-indicator span {
  width: 6px;
  height: 6px;
  background: var(--text-secondary);
  border-radius: 50%;
  animation: typing 1.4s infinite ease-in-out;
}

.typing-indicator span:nth-child(2) {
  animation-delay: 0.2s;
}

.typing-indicator span:nth-child(3) {
  animation-delay: 0.4s;
}

@keyframes typing {
  0%,
  60%,
  100% {
    transform: translateY(0);
  }
  30% {
    transform: translateY(-10px);
  }
}

.chatbot-input {
  display: flex;
  gap: 0.5rem;
  padding: 1rem;
  border-top: 1px solid var(--border-color);
  background: var(--bg-secondary);
  border-radius: 0 0 12px 12px;
}

.chatbot-input input {
  flex: 1;
  padding: 0.75rem;
  border: 1px solid var(--border-color);
  border-radius: 8px;
  background: var(--bg-primary);
  color: var(--text-primary);
  font-size: 0.9rem;
}

.chatbot-input input:focus {
  outline: none;
  border-color: var(--highlight-color);
}

.chatbot-input button {
  padding: 0.75rem 1rem;
  background: var(--highlight-color);
  color: white;
  border: none;
  border-radius: 8px;
  cursor: pointer;
  font-size: 0.9rem;
  font-weight: 600;
  transition: background-color 0.2s;
}

.chatbot-input button:hover:not(:disabled) {
  background: var(--coral-deep);
}

.chatbot-input button:disabled {
  background: var(--text-secondary);
  cursor: not-allowed;
}
</style>
