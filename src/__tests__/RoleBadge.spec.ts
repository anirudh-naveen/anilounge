import { describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'

vi.mock('@/services/api', () => ({
  staffAPI: {
    list: vi.fn().mockResolvedValue({
      data: {
        data: [
          { id: '1', username: 'Anirudh', role: 'creator' },
          { id: '2', username: 'mod', role: 'admin', cosmetic: ['developer'] },
          { id: '3', username: 'painter', role: null, cosmetic: ['artist', 'influencer'] },
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
    expect(admin.find('[data-testid="role-badge-developer"]').exists()).toBe(true)
    const painter = mount(RoleBadge, { props: { username: 'painter' } })
    await flushPromises()
    expect(painter.find('[data-testid="role-badge-admin"]').exists()).toBe(false)
    expect(painter.findAll('.cosmetic-badge').map((badge) => badge.attributes('title'))).toEqual([
      'Artist',
      'Influencer',
    ])
  })
})
