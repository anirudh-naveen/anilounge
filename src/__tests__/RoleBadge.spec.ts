import { describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'

vi.mock('@/services/api', () => ({
  staffAPI: {
    list: vi.fn().mockResolvedValue({
      data: {
        data: [
          { id: '1', username: 'Anirudh', role: 'creator' },
          { id: '2', username: 'mod', role: 'admin' },
        ],
      },
    }),
  },
}))

import RoleBadge from '@/components/RoleBadge.vue'

describe('RoleBadge', () => {
  it('marks the creator and admins, and nobody else', async () => {
    setActivePinia(createPinia())
    const creator = mount(RoleBadge, { props: { username: 'anirudh' } })
    const admin = mount(RoleBadge, { props: { username: 'MOD' } })
    const regular = mount(RoleBadge, { props: { username: 'viewer' } })
    await flushPromises()
    expect(creator.find('[data-testid="role-badge-creator"]').attributes('title')).toBe(
      'AniLounge creator',
    )
    expect(admin.find('[data-testid="role-badge-admin"]').exists()).toBe(true)
    expect(regular.html()).not.toContain('role-badge')
  })
})
