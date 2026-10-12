import { describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import UserAvatar from '@/components/UserAvatar.vue'
import { useBadgesStore } from '@/stores/badges'

vi.mock('@/services/api', () => ({
  badgesAPI: {
    list: () =>
      Promise.resolve({
        data: { data: [{ username: 'iMaji', badges: ['creator'], frame: 'creator' }] },
      }),
  },
}))

const auth = vi.hoisted(() => ({
  user: null as { username: string; profilePicture: string | null } | null,
}))
vi.mock('@/stores/auth', () => ({ useAuthStore: () => auth }))

describe('UserAvatar', () => {
  it("shows the signed-in user's current picture over the page's copy", () => {
    setActivePinia(createPinia())
    auth.user = { username: 'Mika', profilePicture: 'https://cdn.test/new.png' }
    const mine = mount(UserAvatar, { props: { name: 'mika', src: 'https://cdn.test/old.png' } })
    expect(mine.get('img').attributes('src')).toBe('https://cdn.test/new.png')
    const theirs = mount(UserAvatar, { props: { name: 'kai', src: 'https://cdn.test/kai.png' } })
    expect(theirs.get('img').attributes('src')).toBe('https://cdn.test/kai.png')
    auth.user = null
  })

  it('rings the picture with the badge the caller passes', () => {
    const wrapper = mount(UserAvatar, { props: { name: 'kai', badge: 'admin', size: 40 } })
    expect(wrapper.classes()).toContain('ring-admin')
    expect(wrapper.find('[data-testid="avatar-ring-admin"]').exists()).toBe(true)
  })

  it("looks up the user's frame from the badges store", async () => {
    setActivePinia(createPinia())
    await useBadgesStore().load(true)
    const wrapper = mount(UserAvatar, { props: { name: 'iMaji' } })
    expect(wrapper.classes()).toContain('ring-creator')
    // Everyone else wears the plain User ring, with nothing behind it.
    const plain = mount(UserAvatar, { props: { name: 'nobody' } })
    expect(plain.classes()).toContain('ring-user')
    expect(plain.find('.frame').exists()).toBe(false)
  })

  it('keeps the picture round, with the badge silhouette behind it', () => {
    const spade = mount(UserAvatar, { props: { badge: 'artist', size: 40 } })
    expect(spade.find('.frame').exists()).toBe(true)
    expect(spade.find('.ring').exists()).toBe(true)
    expect(spade.get('.user-avatar-inner').attributes('style')).toBeUndefined()
    const plain = mount(UserAvatar, { props: { badge: null } })
    expect(plain.find('.frame').exists()).toBe(false)
    expect(plain.find('.ring').exists()).toBe(false)
  })

  it('frames in coral until the user picks an accent, and silver has its own sheen', () => {
    const coral = mount(UserAvatar, { props: { badge: 'admin', accent: null } })
    expect(coral.findAll('stop')[1]!.attributes('stop-color')).toBe('#e07a5f')
    const silver = mount(UserAvatar, { props: { badge: 'admin', accent: 'silver' } })
    expect(silver.get('stop').attributes('stop-color')).toBe('#f8fafc')
    const teal = mount(UserAvatar, { props: { badge: 'admin', accent: 'teal' } })
    expect(teal.findAll('stop')[1]!.attributes('stop-color')).toBe('#2bbbad')
  })

  it('shows no ring for no emblem or an unknown badge', () => {
    expect(mount(UserAvatar, { props: { badge: null } }).classes()).not.toContain('ringed')
    expect(mount(UserAvatar, { props: { badge: 'future' } }).classes()).not.toContain('ringed')
  })
})
