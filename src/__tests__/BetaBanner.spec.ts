import { beforeEach, describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import { createMemoryHistory, createRouter } from 'vue-router'
import BetaBanner from '@/components/BetaBanner.vue'
import Feedback from '@/views/Feedback.vue'

describe('BetaBanner feedback link', () => {
  beforeEach(() => {
    localStorage.removeItem('beta-banner-dismissed')
  })
  it('links Report bugs or suggestions to the feedback page', async () => {
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [
        { path: '/', component: { template: '<div />' } },
        { path: '/feedback', name: 'feedback', component: Feedback },
      ],
    })
    await router.push('/')
    await router.isReady()

    const wrapper = mount(BetaBanner, {
      global: { plugins: [router] },
    })

    const link = wrapper.get('a.feedback-link')
    expect(link.text()).toContain('Report bugs or suggestions')
    expect(link.attributes('href')).toBe('/feedback')
  })
})
