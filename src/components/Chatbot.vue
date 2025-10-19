<!-- eslint-disable vue/multi-word-component-names -->
<template>
  <div class="chatbot-container">
    <div class="chatbot-header">
      <h3>AI Assistant</h3>
      <button @click="toggleChatbot" class="close-btn">×</button>
    </div>

    <div class="chatbot-messages" ref="messagesContainer">
      <div v-for="message in messages" :key="message.id" :class="['message', message.type]">
        <div class="message-content">
          <div v-if="message.type === 'bot'" class="bot-avatar">AI</div>
          <div class="message-text">{{ message.text }}</div>
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

    <div class="chatbot-input">
      <input
        v-model="inputMessage"
        @keyup.enter="sendMessage"
        placeholder="Ask me about anime recommendations..."
        :disabled="isTyping"
      />
      <button @click="sendMessage" :disabled="!inputMessage.trim() || isTyping">Send</button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, nextTick, onMounted } from 'vue'
import { useContentStore } from '@/stores/content'
import { aiAPI } from '@/services/api'

interface Message {
  id: string
  type: 'user' | 'bot'
  text: string
  timestamp: Date
}

defineProps<{
  showChatbot: boolean
}>()

const emit = defineEmits<{
  close: []
}>()

const contentStore = useContentStore()

const messages = ref<Message[]>([])
const inputMessage = ref('')
const isTyping = ref(false)
const messagesContainer = ref<HTMLElement>()

const toggleChatbot = () => {
  emit('close')
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
  const query = inputMessage.value.trim()
  inputMessage.value = ''

  isTyping.value = true
  await nextTick()
  scrollToBottom()

  try {
    // Get AI response
    const response = await aiAPI.chat(query)
    const data = response.data

    const botMessage: Message = {
      id: (Date.now() + 1).toString(),
      type: 'bot',
      text: data.response || "Sorry, I couldn't process your request.",
      timestamp: new Date(),
    }

    messages.value.push(botMessage)

    // If the AI suggests searching for something, trigger a search
    if (data.searchSuggestion) {
      await contentStore.searchContent(data.searchSuggestion)
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
  // Add welcome message
  const welcomeMessage: Message = {
    id: 'welcome',
    type: 'bot',
    text: 'Hi! I\'m your AI assistant for finding animated content. I can help you discover anime, movies, and TV shows. Try asking me things like "Find me some action anime" or "What are the best Studio Ghibli movies?"',
    timestamp: new Date(),
  }
  messages.value.push(welcomeMessage)
})
</script>

<style scoped>
.chatbot-container {
  position: fixed;
  bottom: 2rem;
  right: 2rem;
  width: 400px;
  height: 500px;
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
  background: var(--purple-accent);
}

.chatbot-input button:disabled {
  background: var(--text-secondary);
  cursor: not-allowed;
}
</style>
