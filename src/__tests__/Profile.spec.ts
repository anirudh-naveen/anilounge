import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { createMemoryHistory, createRouter } from 'vue-router'
import Profile from '@/views/Profile.vue'
import type { PublicProfile } from '@/types/profile'

const getPublicProfile = vi.fn()
const updateSettings = vi.fn()
const setFeaturedBadge = vi.fn()
const updateProfile = vi.fn()
const authState = { isDemoUser: false }

vi.mock('vue-toastification', () => ({
  useToast: () => ({ error: vi.fn(), success: vi.fn(), info: vi.fn() }),
}))

vi.mock('@/services/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/services/api')>()
  return {
    ...actual,
    profileAPI: {
      ...actual.profileAPI,
      getPublicProfile: (...args: unknown[]) => getPublicProfile(...args),
      updateSettings: (...args: unknown[]) => updateSettings(...args),
      setFeaturedBadge: (...args: unknown[]) => setFeaturedBadge(...args),
    },
  }
})

vi.mock('vue-cropperjs', () => ({ default: { template: '<div />' } }))
vi.mock('vue-cropperjs/node_modules/cropperjs/dist/cropper.css', () => ({}))

vi.mock('@/stores/auth', () => ({
  useAuthStore: () => ({
    isAuthenticated: true,
    user: { username: 'mika' },
    get isDemoUser() {
      return authState.isDemoUser
    },
    updateProfile: (...args: unknown[]) => updateProfile(...args),
  }),
}))

const badges = vi.hoisted(() => ({
  held: [] as string[],
  featured: null as string | null,
  choice: null as string | null,
}))

vi.mock('@/stores/badges', () => ({
  useBadgesStore: () => ({
    load: () => Promise.resolve(),
    badgesFor: () => badges.held,
    featuredFor: () => badges.featured,
    choiceFor: () => badges.choice,
  }),
}))

vi.mock('@/stores/favorites', () => ({
  useFavoritesStore: () => ({
    isLoaded: false,
    isFavorite: () => true,
    load: vi.fn().mockResolvedValue(undefined),
    toggle: vi.fn(),
  }),
}))

const buildProfile = (overrides: Partial<PublicProfile> = {}): PublicProfile => ({
  user: {
    id: 'u1',
    username: 'mika',
    profilePicture: null,
    bio: 'Mostly mecha.',
    createdAt: '2025-01-02T00:00:00Z',
    preferences: { favoriteGenres: ['Mecha'] },
  },
  settings: {
    isPublic: true,
    accent: 'teal',
    headline: 'Giant robot fan',
    defaultTab: 'favorites',
    tabOrder: ['favorites', 'watchlist', 'stats'],
    hiddenTabs: [],
  },
  isOwner: false,
  tabs: ['favorites', 'watchlist', 'stats'],
  favorites: {
    content: [{ _id: 'c1', title: 'Gurren Lagann', overview: '', contentType: 'tv', genres: [] }],
    characters: [{ _id: 'e1', entityType: 'character', name: 'Kamina' }],
    voiceActors: [],
    studios: [],
  },
  watchlist: [
    {
      content: {
        _id: 'c1',
        title: 'Gurren Lagann',
        overview: '',
        contentType: 'tv',
        episodeCount: 27,
        genres: [],
      },
      status: 'watching',
      rating: 9,
      currentEpisode: 8,
      addedAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-02-01T00:00:00Z',
    },
  ],
  stats: {
    totals: {
      titles: 1,
      completed: 0,
      watching: 1,
      planToWatch: 0,
      dropped: 0,
      completedSeries: 0,
      completedMovies: 0,
      episodesWatched: 8,
      minutesWatched: 192,
      averageRating: 9,
      ratedCount: 1,
    },
    monthly: Array.from({ length: 12 }, (_, index) => ({
      month: `2026-${String(index + 1).padStart(2, '0')}`,
      minutes: index === 1 ? 192 : 0,
    })),
    genres: [{ name: 'Mecha', titles: 1, minutes: 192 }],
    ratingDistribution: [0, 0, 0, 0, 0, 0, 0, 0, 1, 0],
  },
  ...overrides,
})

const mountAt = async (path: string) => {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/profile', name: 'profile', component: Profile },
      { path: '/u/:username', name: 'publicProfile', component: Profile },
      { path: '/settings', component: { template: '<div />' } },
      { path: '/', component: { template: '<div />' } },
      { path: '/tv-show/:id', name: 'TVShowDetails', component: { template: '<div />' } },
      { path: '/character/:id', name: 'CharacterDetails', component: { template: '<div />' } },
    ],
  })
  router.push(path)
  await router.isReady()
  const wrapper = mount(Profile, { global: { plugins: [router] } })
  await flushPromises()
  return { wrapper, router }
}

describe('Profile', () => {
  beforeEach(() => {
    getPublicProfile.mockReset()
    updateSettings.mockReset()
    updateProfile.mockReset()
    updateProfile.mockResolvedValue({})
    authState.isDemoUser = false
  })

  it('loads a shared profile by username and shows favorites first', async () => {
    getPublicProfile.mockResolvedValue({ data: { data: buildProfile() } })
    const { wrapper } = await mountAt('/u/mika')

    expect(getPublicProfile).toHaveBeenCalledWith('mika')
    expect(wrapper.get('[data-testid="profile-username"]').text()).toBe('mika')
    expect(wrapper.text()).toContain('Giant robot fan')
    expect(wrapper.get('[data-testid="panel-favorites"]').text()).toContain('Gurren Lagann')
    expect(wrapper.text()).toContain('Kamina')
    expect(wrapper.find('[data-testid="customize-profile"]').exists()).toBe(false)
  })

  it('switches to the stats tab and shows watch time', async () => {
    getPublicProfile.mockResolvedValue({ data: { data: buildProfile() } })
    const { wrapper, router } = await mountAt('/u/mika')

    await wrapper.get('[data-testid="profile-tab-stats"]').trigger('click')
    await flushPromises()

    expect(router.currentRoute.value.query.tab).toBe('stats')
    expect(wrapper.get('[data-testid="stat-watchtime"]').text()).toBe('3h')
    expect(wrapper.findAll('.month-col')).toHaveLength(12)
    expect(wrapper.text()).toContain('Mecha')
  })

  it('opens the default tab chosen by the owner', async () => {
    const profile = buildProfile()
    profile.settings.defaultTab = 'watchlist'
    getPublicProfile.mockResolvedValue({ data: { data: profile } })
    const { wrapper } = await mountAt('/u/mika')

    expect(wrapper.get('[data-testid="panel-watchlist"]').text()).toContain('8/27 eps')
  })

  it('shows an unavailable state for private or missing profiles', async () => {
    getPublicProfile.mockRejectedValue({ response: { status: 404 } })
    const { wrapper } = await mountAt('/u/ghost')

    expect(wrapper.find('[data-testid="profile-missing"]').exists()).toBe(true)
  })

  it('lets the owner save customization from /profile', async () => {
    getPublicProfile.mockResolvedValue({ data: { data: buildProfile({ isOwner: true }) } })
    const { wrapper } = await mountAt('/profile')
    expect(getPublicProfile).toHaveBeenCalledWith('mika')

    await wrapper.get('[data-testid="customize-profile"]').trigger('click')
    await wrapper.get('[data-testid="toggle-public"]').setValue(false)

    const saved = { ...buildProfile().settings, isPublic: false }
    updateSettings.mockResolvedValue({ data: { data: { settings: saved, bio: 'Mostly mecha.' } } })
    await wrapper.get('[data-testid="customize-panel"]').trigger('submit')
    await flushPromises()

    expect(updateSettings).toHaveBeenCalledWith(
      expect.objectContaining({ settings: expect.objectContaining({ isPublic: false }) }),
    )
    expect(wrapper.find('[data-testid="customize-panel"]').exists()).toBe(false)
    expect(wrapper.text()).toContain('Private')
  })

  it('saves favorite genres from the Customize panel, with no studio type-in', async () => {
    getPublicProfile.mockResolvedValue({ data: { data: buildProfile({ isOwner: true }) } })
    const { wrapper } = await mountAt('/profile')

    await wrapper.get('[data-testid="customize-profile"]').trigger('click')
    const romance = wrapper.findAll('.genre-option').find((node) => node.text() === 'Romance')!
    await romance.trigger('click')
    expect(wrapper.find('[data-testid="studio-input"]').exists()).toBe(false)

    updateSettings.mockResolvedValue({
      data: { data: { settings: buildProfile().settings, bio: 'Mostly mecha.' } },
    })
    await wrapper.get('[data-testid="customize-panel"]').trigger('submit')
    await flushPromises()

    expect(updateProfile).toHaveBeenCalledWith({
      preferences: { favoriteGenres: ['Mecha', 'Romance'] },
    })
    expect(wrapper.text()).toContain('Romance')
  })

  it('locks the profile picture for the demo account', async () => {
    authState.isDemoUser = true
    getPublicProfile.mockResolvedValue({ data: { data: buildProfile({ isOwner: true }) } })
    const { wrapper } = await mountAt('/profile')

    await wrapper.get('[data-testid="customize-profile"]').trigger('click')
    expect(wrapper.find('[data-testid="picture-demo-note"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="picture-input"]').exists()).toBe(false)
  })

  it('lists badges under the name for visitors, without the emblem picker', async () => {
    Object.assign(badges, { held: ['admin', 'artist'], featured: 'artist', choice: 'artist' })
    getPublicProfile.mockResolvedValue({ data: { data: buildProfile() } })
    const { wrapper } = await mountAt('/u/mika')

    const section = wrapper.get('[data-testid="profile-badges"]')
    expect(section.findAll('.badge-name').map((name) => name.text())).toEqual(['Admin', 'Artist'])
    expect(section.find('.badge-card.featured').text()).toContain('Artist')
    expect(section.find('[data-testid="emblem-picker"]').exists()).toBe(false)
    Object.assign(badges, { held: [], featured: null, choice: null })
  })

  it('lets the owner pick the badge next to their name from Customize', async () => {
    Object.assign(badges, { held: ['admin', 'artist'], featured: 'admin', choice: null })
    setFeaturedBadge.mockResolvedValue({ data: { data: {} } })
    updateSettings.mockResolvedValue({
      data: { data: { settings: buildProfile().settings, bio: '' } },
    })
    getPublicProfile.mockResolvedValue({ data: { data: buildProfile({ isOwner: true }) } })
    const { wrapper } = await mountAt('/u/mika')

    // Not in the Badges section any more.
    expect(wrapper.get('[data-testid="profile-badges"]').find('select').exists()).toBe(false)

    await wrapper.get('[data-testid="customize-profile"]').trigger('click')
    const picker = wrapper.get('[data-testid="emblem-picker"]')
    expect(picker.findAll('option').map((option) => option.text())).toEqual([
      'Automatic (Admin)',
      'Admin',
      'Artist',
      'No badge',
    ])
    await picker.setValue('artist')
    await wrapper.get('[data-testid="customize-panel"]').trigger('submit')
    await flushPromises()
    expect(setFeaturedBadge).toHaveBeenCalledWith('artist')
    Object.assign(badges, { held: [], featured: null, choice: null })
  })

  it('does not touch the badge when Customize saves without changing it', async () => {
    Object.assign(badges, { held: ['admin'], featured: 'admin', choice: null })
    setFeaturedBadge.mockReset()
    updateSettings.mockResolvedValue({
      data: { data: { settings: buildProfile().settings, bio: '' } },
    })
    getPublicProfile.mockResolvedValue({ data: { data: buildProfile({ isOwner: true }) } })
    const { wrapper } = await mountAt('/u/mika')
    await wrapper.get('[data-testid="customize-profile"]').trigger('click')
    await wrapper.get('[data-testid="customize-panel"]').trigger('submit')
    await flushPromises()
    expect(setFeaturedBadge).not.toHaveBeenCalled()
    Object.assign(badges, { held: [], featured: null, choice: null })
  })

  it('has no Badges section for people without badges', async () => {
    getPublicProfile.mockResolvedValue({ data: { data: buildProfile() } })
    const { wrapper } = await mountAt('/u/mika')
    expect(wrapper.find('[data-testid="profile-badges"]').exists()).toBe(false)
  })

  it('saves a custom accent from the color wheel', async () => {
    updateSettings.mockResolvedValue({
      data: { data: { settings: { ...buildProfile().settings, accent: '#3a7bff' }, bio: '' } },
    })
    getPublicProfile.mockResolvedValue({ data: { data: buildProfile({ isOwner: true }) } })
    const { wrapper } = await mountAt('/u/mika')
    await wrapper.get('[data-testid="customize-profile"]').trigger('click')
    await wrapper.get('[data-testid="accent-wheel"]').setValue('#3A7BFF')
    expect(wrapper.text()).toContain('#3a7bff')
    await wrapper.get('[data-testid="customize-panel"]').trigger('submit')
    await flushPromises()
    expect(updateSettings).toHaveBeenCalledWith(
      expect.objectContaining({ settings: expect.objectContaining({ accent: '#3a7bff' }) }),
    )
    const style = wrapper.get('.profile-page').attributes('style')
    expect(style).toContain('--profile-accent: #3a7bff')
    expect(style).toContain('--profile-on-accent: #ffffff')
  })
})
