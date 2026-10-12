import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import BadgeEmblem from '@/components/BadgeEmblem.vue'

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
