import { describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'

vi.mock('@/services/api', () => ({
  badgesAPI: {
    list: vi.fn().mockResolvedValue({
      data: {
        data: [
          {
            id: '1',
            username: 'Anirudh',
            badges: ['creator', 'developer'],
            featured: 'creator',
            choice: null,
          },
          {
            id: '2',
            username: 'mod',
            badges: ['admin', 'artist'],
            featured: 'artist',
            choice: 'artist',
          },
          { id: '3', username: 'quiet', badges: ['influencer'], featured: null, choice: 'none' },
        ],
      },
    }),
  },
}))

import RoleBadge from '@/components/RoleBadge.vue'
import BadgeEmblem from '@/components/BadgeEmblem.vue'

describe('RoleBadge', () => {
  it('shows only the emblem each person picked, and nothing for none or no badges', async () => {
    setActivePinia(createPinia())
    const creator = mount(RoleBadge, { props: { username: 'anirudh' } })
    const admin = mount(RoleBadge, { props: { username: 'MOD' } })
    const quiet = mount(RoleBadge, { props: { username: 'quiet' } })
    const regular = mount(RoleBadge, { props: { username: 'viewer' } })
    await flushPromises()
    expect(creator.find('[data-testid="emblem-creator"]').attributes('title')).toBe('Creator')
    expect(creator.findAll('.emblem')).toHaveLength(1)
    expect(admin.find('[data-testid="emblem-artist"]').exists()).toBe(true)
    expect(admin.find('[data-testid="emblem-admin"]').exists()).toBe(false)
    expect(quiet.html()).not.toContain('emblem')
    expect(regular.html()).not.toContain('emblem')
  })
})

describe('BadgeEmblem', () => {
  it('draws the known emblems and a plain medal for future badges', () => {
    for (const id of [
      'creator',
      'admin',
      'developer',
      'artist',
      'influencer',
      'supporter',
      'bot',
    ]) {
      const wrapper = mount(BadgeEmblem, { props: { badge: id } })
      expect(wrapper.classes()).toContain(id)
    }
    const future = mount(BadgeEmblem, { props: { badge: 'early_supporter' } })
    expect(future.classes()).toContain('medal')
    expect(future.find('.sparkle').exists()).toBe(false)
  })
})
