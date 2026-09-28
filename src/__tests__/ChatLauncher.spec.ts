import { describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import ChatLauncher from '@/components/ChatLauncher.vue'
import { useContentStore } from '@/stores/content'
import type { UnifiedContent } from '@/types/content'

vi.mock('vue-toastification', () => ({
  useToast: () => ({ error: vi.fn(), success: vi.fn() }),
}))

const mountLauncher = () => {
  const pinia = createPinia()
  setActivePinia(pinia)
  return mount(ChatLauncher, {
    global: {
      plugins: [pinia],
      stubs: { Chatbot: true },
    },
  })
}

describe('ChatLauncher', () => {
  it('opens the chatbot from the floating button', async () => {
    const wrapper = mountLauncher()

    expect(wrapper.find('chatbot-stub').exists()).toBe(false)
    await wrapper.get('[data-testid="chat-launcher"]').trigger('click')
    await flushPromises()
    expect(wrapper.find('chatbot-stub').exists()).toBe(true)
  })

  it('loads chatbot recommendations into the search results', async () => {
    const wrapper = mountLauncher()
    const store = useContentStore()
    const results = [{ _id: 'a1', title: 'Frieren' }] as unknown as UnifiedContent[]

    await wrapper.get('[data-testid="chat-launcher"]').trigger('click')
    wrapper.getComponent({ name: 'Chatbot' }).vm.$emit('search-results', results)
    await flushPromises()

    expect(store.searchResults).toEqual(results)
  })
})
