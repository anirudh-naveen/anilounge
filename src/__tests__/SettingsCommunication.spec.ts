import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { createMemoryHistory, createRouter } from 'vue-router'
import Settings from '@/views/Settings.vue'

const getCommunication = vi.fn()
const updateCommunication = vi.fn()
const toastSuccess = vi.fn()
const toastError = vi.fn()
const authState = { isDemoUser: false }

vi.mock('vue-cropperjs', () => ({ default: { template: '<div />' } }))
vi.mock('vue-cropperjs/node_modules/cropperjs/dist/cropper.css', () => ({}))

vi.mock('vue-toastification', () => ({
  useToast: () => ({ error: toastError, success: toastSuccess, info: vi.fn() }),
}))

vi.mock('@/stores/auth', () => ({
  useAuthStore: () => ({
    get isDemoUser() {
      return authState.isDemoUser
    },
    error: null,
    isAuthenticated: true,
    user: { username: 'mika', email: 'mika@example.test', preferences: {} },
  }),
}))

vi.mock('@/services/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/services/api')>()
  return {
    ...actual,
    securityAPI: {
      getStatus: vi.fn().mockResolvedValue({
        data: { data: { twoFactorEnabled: false, backupCodesRemaining: 0 } },
      }),
    },
    emailPreferencesAPI: {
      get: vi.fn().mockResolvedValue({
        data: { data: { announcements: true, friend_requests: true } },
      }),
      update: vi.fn(),
    },
    communicationAPI: {
      get: (...args: unknown[]) => getCommunication(...args),
      update: (...args: unknown[]) => updateCommunication(...args),
    },
  }
})

vi.mock('@/stores/favorites', () => ({
  useFavoritesStore: () => ({ reset: vi.fn() }),
}))

const mountSettings = async () => {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/settings', component: Settings }],
  })
  router.push('/settings')
  await router.isReady()
  const wrapper = mount(Settings, { global: { plugins: [router] } })
  await flushPromises()
  return wrapper
}

describe('Settings communication', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    authState.isDemoUser = false
    getCommunication.mockResolvedValue({ data: { data: { allowProfanity: false } } })
  })

  it('shows the saved profanity setting, off by default', async () => {
    const wrapper = await mountSettings()
    const toggle = wrapper.get('[data-testid="allow-profanity"]')
    expect((toggle.element as HTMLInputElement).checked).toBe(false)
    expect(toggle.attributes('disabled')).toBeUndefined()
  })

  it('saves the toggle', async () => {
    updateCommunication.mockResolvedValue({ data: { data: { allowProfanity: true } } })
    const wrapper = await mountSettings()
    await wrapper.get('[data-testid="allow-profanity"]').setValue(true)
    await flushPromises()
    expect(updateCommunication).toHaveBeenCalledWith({ allowProfanity: true })
    expect(toastSuccess).toHaveBeenCalled()
  })

  it('reverts the toggle when saving fails', async () => {
    updateCommunication.mockRejectedValue(new Error('offline'))
    const wrapper = await mountSettings()
    const toggle = wrapper.get('[data-testid="allow-profanity"]')
    await toggle.setValue(true)
    await flushPromises()
    expect((toggle.element as HTMLInputElement).checked).toBe(false)
    expect(toastError).toHaveBeenCalled()
  })

  it('is locked for the demo account', async () => {
    authState.isDemoUser = true
    const wrapper = await mountSettings()
    expect(wrapper.get('[data-testid="allow-profanity"]').attributes('disabled')).toBeDefined()
  })
})
