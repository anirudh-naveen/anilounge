import { describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createMemoryHistory, createRouter } from 'vue-router'
import ChatLauncher from '@/components/ChatLauncher.vue'
import { useContentStore } from '@/stores/content'

vi.mock('vue-toastification', () => ({
  useToast: () => ({ error: vi.fn(), success: vi.fn() }),
}))

describe('ChatLauncher', () => {
  it('opens the chatbot from the floating button', async () => {
    const pinia = createPinia()
    setActivePinia(pinia)
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [
        { path: '/', name: 'home', component: { template: '<div />' } },
        { path: '/search', name: 'search', component: { template: '<div />' } },
      ],
    })
    await router.push('/')
    await router.isReady()

    const wrapper = mount(ChatLauncher, {
      global: {
        plugins: [pinia, router],
        stubs: { Chatbot: true },
      },
    })

    expect(wrapper.find('[data-testid="chatbot"]').exists()).toBe(false)
    await wrapper.get('[data-testid="chat-launcher"]').trigger('click')
    await flushPromises()
    expect(wrapper.find('chatbot-stub').exists()).toBe(true)
    expect(useContentStore()).toBeTruthy()
  })
})
