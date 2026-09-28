import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { createMemoryHistory, createRouter } from 'vue-router'
import Settings from '@/views/Settings.vue'

const deleteAccount = vi.fn()
const resetFavorites = vi.fn()
const toastSuccess = vi.fn()
const toastError = vi.fn()
const authState = { isDemoUser: false, error: null as string | null }

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
    get error() {
      return authState.error
    },
    isAuthenticated: true,
    user: { username: 'mika', email: 'mika@example.test', preferences: {} },
    deleteAccount,
  }),
}))

vi.mock('@/stores/favorites', () => ({
  useFavoritesStore: () => ({ reset: resetFavorites }),
}))

const mountSettings = async () => {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', component: { template: '<div />' } },
      { path: '/settings', component: Settings },
    ],
  })
  router.push('/settings')
  await router.isReady()
  const wrapper = mount(Settings, { global: { plugins: [router] } })
  await flushPromises()
  return { wrapper, router }
}

describe('Settings delete account', () => {
  beforeEach(() => {
    authState.isDemoUser = false
    authState.error = null
    deleteAccount.mockReset()
    resetFavorites.mockReset()
    toastSuccess.mockReset()
    toastError.mockReset()
  })

  it('requires a password and acknowledgement before deleting', async () => {
    deleteAccount.mockResolvedValue(undefined)
    const { wrapper, router } = await mountSettings()

    await wrapper.get('[data-testid="delete-account-start"]').trigger('click')
    const confirm = wrapper.get('[data-testid="delete-account-confirm"]')
    expect(confirm.attributes('disabled')).toBeDefined()

    await wrapper.get('[data-testid="delete-account-password"]').setValue('Secret123!')
    expect(confirm.attributes('disabled')).toBeDefined()
    await wrapper.get('[data-testid="delete-account-ack"]').setValue(true)
    expect(confirm.attributes('disabled')).toBeUndefined()

    await wrapper.get('form.delete-form').trigger('submit')
    await flushPromises()

    expect(deleteAccount).toHaveBeenCalledWith('Secret123!')
    expect(resetFavorites).toHaveBeenCalled()
    expect(toastSuccess).toHaveBeenCalled()
    expect(router.currentRoute.value.path).toBe('/')
  })

  it('shows the server error and stays put when the password is wrong', async () => {
    deleteAccount.mockImplementation(async () => {
      authState.error = 'Password is incorrect.'
      throw new Error('bad')
    })
    const { wrapper, router } = await mountSettings()

    await wrapper.get('[data-testid="delete-account-start"]').trigger('click')
    await wrapper.get('[data-testid="delete-account-password"]').setValue('wrong')
    await wrapper.get('[data-testid="delete-account-ack"]').setValue(true)
    await wrapper.get('form.delete-form').trigger('submit')
    await flushPromises()

    expect(toastError).toHaveBeenCalledWith('Password is incorrect.')
    expect(router.currentRoute.value.path).toBe('/settings')
  })

  it('hides deletion for the demo account', async () => {
    authState.isDemoUser = true
    const { wrapper } = await mountSettings()

    const section = wrapper.get('[data-testid="delete-account"]')
    expect(section.text()).toContain('cannot be deleted')
    expect(wrapper.find('[data-testid="delete-account-start"]').exists()).toBe(false)
  })
})
