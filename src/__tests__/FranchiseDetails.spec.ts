import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { createMemoryHistory, createRouter } from 'vue-router'
import FranchiseDetails from '@/views/FranchiseDetails.vue'

const api = vi.hoisted(() => ({
  getFranchise: vi.fn(),
  setFranchiseWatchOrder: vi.fn(),
  addFranchiseWork: vi.fn(),
  searchContent: vi.fn(),
}))
const auth = vi.hoisted(() => ({ canEditContent: false }))

vi.mock('@/services/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/services/api')>()
  return {
    ...actual,
    contentAPI: { ...actual.contentAPI, getFranchise: api.getFranchise },
    adminAPI: {
      ...actual.adminAPI,
      setFranchiseWatchOrder: api.setFranchiseWatchOrder,
      addFranchiseWork: api.addFranchiseWork,
      searchContent: api.searchContent,
    },
  }
})
vi.mock('@/stores/auth', () => ({ useAuthStore: () => auth }))
vi.mock('@/stores/favorites', () => ({
  useFavoritesStore: () => ({ isFavorite: () => false, load: vi.fn(), toggle: vi.fn() }),
}))
vi.mock('vue-toastification', () => ({
  useToast: () => ({ success: vi.fn(), error: vi.fn() }),
}))

const franchise = {
  _id: 'f-1',
  name: 'Naruto',
  nicknames: [],
  about: '',
  imagePath: '',
  rating: null,
  customOrder: false,
  works: [
    { _id: 'w-1', title: 'Naruto', contentType: 'season', seriesId: 's-1' },
    { _id: 'w-2', title: 'The Last', contentType: 'movie' },
  ],
  characters: [
    { _id: 'c-1', name: 'Uzumaki, Naruto', imagePath: '', role: 'Main' },
    { _id: 'c-2', name: 'Iruka Umino', imagePath: '', role: 'Supporting' },
  ],
  staff: [{ _id: 'p-1', name: 'Hayato Date', imagePath: '', roles: ['Director'] }],
}

const routes = [
  { path: '/franchise/:id', name: 'FranchiseDetails', component: FranchiseDetails },
  { path: '/character/:id', name: 'CharacterDetails', component: { template: '<div />' } },
  { path: '/staff/:slug?/:id', component: { template: '<div />' } },
  { path: '/movie/:id', name: 'MovieDetails', component: { template: '<div />' } },
  { path: '/tv-show/:id', name: 'TVShowDetails', component: { template: '<div />' } },
]

const mountPage = async () => {
  const router = createRouter({ history: createMemoryHistory(), routes })
  await router.push('/franchise/f-1')
  await router.isReady()
  const wrapper = mount(FranchiseDetails, { global: { plugins: [router] } })
  await flushPromises()
  return wrapper
}

describe('FranchiseDetails', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    auth.canEditContent = false
    api.getFranchise.mockResolvedValue({ data: { data: franchise } })
  })

  it('lists every character, then the staff, below the watch order', async () => {
    const wrapper = await mountPage()
    const characters = wrapper.get('[data-testid="franchise-characters"]').text()
    expect(characters).toContain('Naruto Uzumaki')
    expect(characters).toContain('Iruka Umino')
    expect(wrapper.get('[data-testid="franchise-staff"]').text()).toContain('Hayato Date')
    const html = wrapper.html()
    expect(html.indexOf('franchise-timeline')).toBeLessThan(html.indexOf('franchise-characters'))
    expect(html.indexOf('franchise-characters')).toBeLessThan(html.indexOf('franchise-staff'))
  })

  it('hides the order editor from regular users', async () => {
    const wrapper = await mountPage()
    expect(wrapper.find('[data-testid="edit-watch-order"]').exists()).toBe(false)
  })

  it('lets content editors move a title and saves the new order', async () => {
    auth.canEditContent = true
    const reordered = { ...franchise, customOrder: true, works: [...franchise.works].reverse() }
    api.setFranchiseWatchOrder.mockResolvedValue({ data: { data: reordered, message: 'Saved.' } })
    const wrapper = await mountPage()
    await wrapper.get('[data-testid="edit-watch-order"]').trigger('click')
    await wrapper.findAll('[data-testid="move-down"]')[0]!.trigger('click')
    await flushPromises()
    expect(api.setFranchiseWatchOrder).toHaveBeenCalledWith('f-1', ['w-2', 'w-1'])
    expect(wrapper.find('[data-testid="reset-watch-order"]').exists()).toBe(true)
  })

  it('adds a searched title to the franchise', async () => {
    auth.canEditContent = true
    api.searchContent.mockResolvedValue({
      data: {
        data: {
          items: [
            { id: 's-1', kind: 'series', title: 'Naruto' },
            { id: 'w-3', kind: 'movie', title: 'Boruto: Naruto the Movie' },
          ],
        },
      },
    })
    api.addFranchiseWork.mockResolvedValue({ data: { data: franchise, message: 'Added.' } })
    const wrapper = await mountPage()
    await wrapper.get('[data-testid="edit-watch-order"]').trigger('click')
    await wrapper.get('[data-testid="add-title-search"]').setValue('naruto')
    // Past the search debounce.
    await new Promise((resolve) => setTimeout(resolve, 350))
    await flushPromises()
    // The series already in the franchise isn't offered again.
    expect(wrapper.find('[data-testid="add-title-s-1"]').exists()).toBe(false)
    await wrapper.get('[data-testid="add-title-w-3"]').trigger('click')
    await flushPromises()
    expect(api.addFranchiseWork).toHaveBeenCalledWith('f-1', 'w-3')
  })
})
