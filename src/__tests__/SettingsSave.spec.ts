import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { createMemoryHistory, createRouter } from 'vue-router'
import Settings from '@/views/Settings.vue'

const getCommunication = vi.fn()
const updateCommunication = vi.fn()
const updateEmail = vi.fn()
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
      update: (...args: unknown[]) => updateEmail(...args),
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

describe('Settings save buttons', () => {
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

  it('waits for Save before sending the toggle', async () => {
    updateCommunication.mockResolvedValue({ data: { data: { allowProfanity: true } } })
    const wrapper = await mountSettings()
    const save = wrapper.get('[data-testid="save-communication"]')
    expect(save.attributes('disabled')).toBeDefined()

    // Flipping back and forth sends nothing.
    await wrapper.get('[data-testid="allow-profanity"]').setValue(true)
    await wrapper.get('[data-testid="allow-profanity"]').setValue(false)
    await wrapper.get('[data-testid="allow-profanity"]').setValue(true)
    expect(updateCommunication).not.toHaveBeenCalled()
    expect(wrapper.text()).toContain('Unsaved changes')

    await save.trigger('click')
    await flushPromises()
    expect(updateCommunication).toHaveBeenCalledTimes(1)
    expect(updateCommunication).toHaveBeenCalledWith({ allowProfanity: true })
    expect(toastSuccess).toHaveBeenCalled()
    expect(wrapper.get('[data-testid="save-communication"]').attributes('disabled')).toBeDefined()
  })

  it('keeps the edit when saving fails, and discards on request', async () => {
    updateCommunication.mockRejectedValue(new Error('offline'))
    const wrapper = await mountSettings()
    const toggle = wrapper.get('[data-testid="allow-profanity"]')
    await toggle.setValue(true)
    await wrapper.get('[data-testid="save-communication"]').trigger('click')
    await flushPromises()
    expect(toastError).toHaveBeenCalled()
    expect((toggle.element as HTMLInputElement).checked).toBe(true)
    expect(wrapper.text()).toContain('Unsaved changes')

    const discard = wrapper.findAll('button').find((button) => button.text() === 'Discard')
    await discard!.trigger('click')
    expect((toggle.element as HTMLInputElement).checked).toBe(false)
  })

  it('saves both email toggles in one request', async () => {
    const wrapper = await mountSettings()
    await wrapper.get('[data-testid="email-pref-announcements"]').setValue(false)
    await wrapper.get('[data-testid="email-pref-friend_requests"]').setValue(false)
    expect(updateEmail).not.toHaveBeenCalled()
    updateEmail.mockResolvedValue({
      data: { data: { announcements: false, friend_requests: false } },
    })
    await wrapper.get('[data-testid="save-email"]').trigger('click')
    await flushPromises()
    expect(updateEmail).toHaveBeenCalledTimes(1)
    expect(updateEmail).toHaveBeenCalledWith({ announcements: false, friend_requests: false })
  })

  it('applies the theme only on Save', async () => {
    const wrapper = await mountSettings()
    await wrapper.get('[data-testid="theme-dark"]').trigger('click')
    expect(document.documentElement.dataset.theme).not.toBe('dark')
    await wrapper.get('[data-testid="save-appearance"]').trigger('click')
    expect(document.documentElement.dataset.theme).toBe('dark')
  })

  it('is locked for the demo account', async () => {
    authState.isDemoUser = true
    const wrapper = await mountSettings()
    expect(wrapper.get('[data-testid="allow-profanity"]').attributes('disabled')).toBeDefined()
  })
})
