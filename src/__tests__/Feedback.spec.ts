import { describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'

vi.mock('vue-toastification', () => ({
  useToast: () => ({ error: vi.fn(), success: vi.fn() }),
}))

import Feedback from '@/views/Feedback.vue'

describe('Feedback page', () => {
  it('renders the bug and suggestion form', () => {
    const wrapper = mount(Feedback)
    expect(wrapper.text()).toContain('Report bugs or suggestions')
    expect(wrapper.find('[data-testid="feedback-form"]').exists()).toBe(true)
    expect(wrapper.text()).toContain('Bug report')
  })
})
