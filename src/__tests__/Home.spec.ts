import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { createMemoryHistory, createRouter } from 'vue-router'
import Home from '@/views/Home.vue'

const getActivity = vi.fn()
const getUpdates = vi.fn()
const getCharacterOfTheDay = vi.fn()
const auth = { isAuthenticated: false, user: null as { username: string } | null }

vi.mock('@/services/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/services/api')>()
  return {
    ...actual,
    homeAPI: {
      getActivity: () => getActivity(),
      getUpdates: () => getUpdates(),
      getCharacterOfTheDay: () => getCharacterOfTheDay(),
    },
  }
})

vi.mock('@/stores/auth', () => ({
  useAuthStore: () => auth,
}))

vi.mock('@/stores/badges', () => ({
  useBadgesStore: () => ({
    load: () => Promise.resolve(),
    badgesFor: () => [],
    featuredFor: () => null,
    choiceFor: () => null,
  }),
}))

const entry = (id: string, isSelf: boolean, at: string, overrides = {}) => ({
  id,
  user: {
    _id: isSelf ? 'me' : 'friend',
    username: isSelf ? 'ani' : 'kai',
    profilePicture: null,
    isSelf,
  },
  action: 'updated',
  status: 'watching',
  currentEpisode: 4,
  previousEpisode: 1,
  rating: 8,
  at,
  content: {
    _id: `show-${id}`,
    title: `Show ${id}`,
    posterPath: '',
    contentType: 'tv',
    episodeCount: 12,
  },
  ...overrides,
})

const soon = new Date(Date.now() + 5 * 3600 * 1000).toISOString()

const updatesPayload = (source: 'watchlist' | 'trending') => ({
  source,
  items: [
    {
      kind: 'episode',
      at: soon,
      reason: source === 'watchlist' ? 'watchlist' : 'trending',
      via: null,
      content: {
        _id: 'airing-1',
        title: 'Frieren',
        posterPath: '',
        backdropPath: '',
        contentType: 'tv',
        malStatus: 'currently_airing',
        nextEpisodeAirDate: soon,
        nextEpisodeNumber: 12,
      },
    },
    {
      kind: 'premiere',
      at: null,
      reason: source === 'watchlist' ? 'related' : 'trending',
      via: source === 'watchlist' ? { _id: 'x', title: 'Frieren' } : null,
      content: {
        _id: 'upcoming-1',
        title: 'Frieren Season 2',
        posterPath: '',
        backdropPath: '',
        contentType: 'tv',
        malStatus: 'not_yet_aired',
      },
    },
  ],
})

const characterPayload = {
  day: '2026-09-27',
  character: {
    _id: 'char-1',
    entityType: 'character',
    name: 'Narumi Momose',
    nativeName: '桃瀬成海',
    about: 'Height: 154 cm\n\nManga and cosplay are up her alley.',
    imagePath: 'https://cdn.example/narumi.png',
    appearances: [
      { role: 'Main', content: { _id: 'wotakoi', title: 'Wotakoi', contentType: 'tv' } },
      { role: 'Main', content: { _id: 'wotakoi', title: 'Wotakoi', contentType: 'tv' } },
    ],
  },
}

const mountHome = async () => {
  const stub = { template: '<div />' }
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', name: 'home', component: Home },
      { path: '/tv-show/:id', name: 'TVShowDetails', component: stub },
      { path: '/movie/:id', name: 'MovieDetails', component: stub },
      { path: '/character/:id', name: 'CharacterDetails', component: stub },
      { path: '/register', component: stub },
      { path: '/login', component: stub },
      { path: '/search', component: stub },
      { path: '/forum', component: stub },
    ],
  })
  await router.push('/')
  await router.isReady()
  const wrapper = mount(Home, { global: { plugins: [router] } })
  await flushPromises()
  return wrapper
}

describe('Home', () => {
  beforeEach(() => {
    window.scrollTo = vi.fn()
    getActivity.mockReset()
    getUpdates.mockReset()
    getCharacterOfTheDay.mockReset()
    getUpdates.mockResolvedValue({ data: { data: updatesPayload('trending') } })
    getCharacterOfTheDay.mockResolvedValue({ data: { data: characterPayload } })
    auth.isAuthenticated = false
    auth.user = null
  })

  it('prompts guests to register instead of loading activity', async () => {
    const wrapper = await mountHome()
    expect(wrapper.find('[data-testid="status-signup"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="status-signup"]').text()).toContain('Register')
    expect(getActivity).not.toHaveBeenCalled()
    expect(wrapper.get('[data-testid="updates-panel"] .panel-title').text()).toBe('Trending')
  })

  it('shows personal and friend activity with tabs', async () => {
    auth.isAuthenticated = true
    auth.user = { username: 'ani' }
    getActivity.mockResolvedValue({
      data: {
        data: {
          personal: [entry('a', true, '2026-09-20T00:00:00Z')],
          friends: [entry('b', false, '2026-09-25T00:00:00Z', { status: 'completed' })],
          friendCount: 1,
        },
      },
    })
    const wrapper = await mountHome()
    expect(wrapper.text()).toContain('Welcome back, ani.')

    const items = wrapper.findAll('[data-testid="activity-item"]')
    expect(items).toHaveLength(2)
    expect(items[0]!.text()).toContain('kai completed Show b')
    expect(items[1]!.text()).toContain('You watched episodes 2–4 of Show a')
    expect(items[1]!.text()).toContain('★ 8/10')

    await wrapper.get('[data-testid="feed-tab-friends"]').trigger('click')
    expect(wrapper.findAll('[data-testid="activity-item"]')).toHaveLength(1)
    expect(wrapper.get('[data-testid="activity-item"]').text()).toContain('kai')
  })

  it('explains an empty friends tab', async () => {
    auth.isAuthenticated = true
    getActivity.mockResolvedValue({ data: { data: { personal: [], friends: [], friendCount: 0 } } })
    const wrapper = await mountHome()
    await wrapper.get('[data-testid="feed-tab-friends"]').trigger('click')
    expect(wrapper.get('[data-testid="activity-empty"]').text()).toContain('No friends yet')
  })

  it('groups watchlist release updates', async () => {
    auth.isAuthenticated = true
    getActivity.mockResolvedValue({ data: { data: { personal: [], friends: [], friendCount: 0 } } })
    getUpdates.mockResolvedValue({ data: { data: updatesPayload('watchlist') } })
    const wrapper = await mountHome()
    const panel = wrapper.get('[data-testid="updates-panel"]')
    expect(panel.get('.panel-title').text()).toBe('Updates')
    expect(panel.text()).toContain('New episodes')
    expect(panel.text()).toContain('Ep 12 · in 5h')
    expect(panel.text()).toContain('Upcoming')
    expect(panel.text()).toContain('Premiere date TBA')
    expect(panel.text()).toContain('Related to Frieren')
  })

  it('features the character of the day and the forum placeholder', async () => {
    const wrapper = await mountHome()
    const bar = wrapper.get('[data-testid="character-of-the-day"]')
    expect(bar.text()).toContain('Narumi Momose')
    expect(bar.text()).toContain('Manga and cosplay are up her alley.')
    expect(bar.text()).not.toContain('Height')
    expect(bar.findAll('.title-chip')).toHaveLength(1)
    expect(wrapper.get('[data-testid="forum-placeholder"]').text()).toContain('Coming soon')
    expect(wrapper.find('[data-testid="character-of-the-day-franchises"]').exists()).toBe(false)
  })

  it('shows the character of the day franchise before their titles', async () => {
    getCharacterOfTheDay.mockResolvedValue({
      data: {
        data: {
          ...characterPayload,
          character: {
            ...characterPayload.character,
            appearances: [
              {
                role: 'Main',
                content: { _id: 'op', title: 'One Piece', contentType: 'tv', franchise: 'One Piece' },
              },
              {
                role: 'Main',
                content: { _id: 'red', title: 'One Piece Film Red', contentType: 'movie', franchise: 'One Piece' },
              },
            ],
          },
        },
      },
    })
    const wrapper = await mountHome()
    const bar = wrapper.get('[data-testid="character-of-the-day"]')
    const franchises = bar.get('[data-testid="character-of-the-day-franchises"]')
    expect(franchises.findAll('.franchise-chip').map((chip) => chip.text())).toEqual(['One Piece'])
    expect(bar.text().indexOf('Franchise')).toBeLessThan(bar.text().indexOf('Appears in'))
  })
})
