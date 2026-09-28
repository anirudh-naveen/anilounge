import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createMemoryHistory, createRouter } from 'vue-router'
import App from '../App.vue'

vi.mock('vue-toastification', () => ({
  useToast: () => ({ error: vi.fn(), success: vi.fn() }),
}))

const refreshSession = vi.fn()

vi.mock('@/services/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/services/api')>()
  return { ...actual, refreshSession: () => refreshSession() }
})

const mountApp = async () => {
  const pinia = createPinia()
  setActivePinia(pinia)
  const page = { template: '<div data-testid="page" />' }
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      '/',
      '/forum',
      '/watchlist',
      '/search',
      '/profile',
      '/settings',
      '/login',
      '/register',
    ].map((path) => ({ path, component: page })),
  })
  await router.push('/')
  await router.isReady()
  const wrapper = mount(App, {
    global: {
      plugins: [pinia, router],
      stubs: { BetaBanner: true, ChatLauncher: true },
    },
  })
  await flushPromises()
  return wrapper
}

describe('App', () => {
  beforeEach(() => {
    localStorage.clear()
    refreshSession.mockReset()
    refreshSession.mockResolvedValue(null)
  })

  it('renders the shell with guest auth actions', async () => {
    const wrapper = await mountApp()
    expect(wrapper.find('.logo-text').text()).toBe('AniLounge')
    expect(wrapper.find('[data-testid="page"]').exists()).toBe(true)
    expect(wrapper.find('.auth-buttons').text()).toContain('Login')
    expect(wrapper.find('.auth-buttons').text()).toContain('Register')
    expect(wrapper.find('a[href="/watchlist"]').exists()).toBe(false)
  })

  it('removes access tokens left in localStorage by older builds', async () => {
    localStorage.setItem('token', 'stale')
    localStorage.setItem('user', '{}')
    await mountApp()
    expect(localStorage.getItem('token')).toBeNull()
    expect(localStorage.getItem('user')).toBeNull()
  })

  it('restores a signed-in session from the cookie and shows the user menu', async () => {
    refreshSession.mockResolvedValue({
      accessToken: 'token',
      user: { id: 'u1', username: 'ani', email: 'a@b.co' },
    })
    const wrapper = await mountApp()
    expect(wrapper.find('.auth-buttons').exists()).toBe(false)
    expect(wrapper.find('.user-name').text()).toBe('ani')
    expect(wrapper.find('a[href="/watchlist"]').exists()).toBe(true)

    await wrapper.get('.user-trigger').trigger('click')
    expect(wrapper.find('.dropdown-menu').text()).toContain('Logout')
  })
})
