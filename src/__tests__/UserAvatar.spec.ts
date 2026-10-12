import { describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import UserAvatar from '@/components/UserAvatar.vue'
import { useBadgesStore } from '@/stores/badges'

vi.mock('@/services/api', () => ({
  badgesAPI: {
    list: () =>
      Promise.resolve({
        data: { data: [{ username: 'iMaji', badges: ['creator'], featured: 'creator' }] },
      }),
  },
}))

describe('UserAvatar', () => {
  it('rings the picture with the badge the caller passes', () => {
    const wrapper = mount(UserAvatar, { props: { name: 'kai', badge: 'admin', size: 40 } })
    expect(wrapper.classes()).toContain('ring-admin')
    expect(wrapper.find('[data-testid="avatar-ring-admin"]').exists()).toBe(true)
  })

  it("looks up the user's emblem from the badges store", async () => {
    setActivePinia(createPinia())
    await useBadgesStore().load(true)
    const wrapper = mount(UserAvatar, { props: { name: 'iMaji' } })
    expect(wrapper.classes()).toContain('ring-creator')
    const plain = mount(UserAvatar, { props: { name: 'nobody' } })
    expect(plain.classes()).not.toContain('ringed')
  })

  it('crops to the emblem silhouette, or crowns Creator and caps Bot', () => {
    const spade = mount(UserAvatar, { props: { badge: 'artist', size: 40 } })
    expect(spade.classes()).toContain('shaped')
    expect(spade.find('.frame').exists()).toBe(true)
    expect(spade.get('.user-avatar-inner').attributes('style')).toContain('mask')
    const creator = mount(UserAvatar, { props: { badge: 'creator' } })
    expect(creator.classes()).toContain('round')
    expect(creator.find('.crown').exists()).toBe(true)
    expect(
      mount(UserAvatar, { props: { badge: 'bot' } })
        .find('.crown.jester')
        .exists(),
    ).toBe(true)
  })

  it('frames in silver until the user picks an accent', () => {
    const silver = mount(UserAvatar, { props: { badge: 'admin', accent: null } })
    expect(silver.get('stop').attributes('stop-color')).toBe('#f8fafc')
    const teal = mount(UserAvatar, { props: { badge: 'admin', accent: 'teal' } })
    expect(teal.findAll('stop')[1]!.attributes('stop-color')).toBe('#2bbbad')
  })

  it('shows no ring for no emblem or an unknown badge', () => {
    expect(mount(UserAvatar, { props: { badge: null } }).classes()).not.toContain('ringed')
    expect(mount(UserAvatar, { props: { badge: 'future' } }).classes()).not.toContain('ringed')
  })
})
