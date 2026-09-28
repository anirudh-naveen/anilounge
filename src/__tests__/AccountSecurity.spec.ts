import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { createMemoryHistory, createRouter } from 'vue-router'
import Login from '@/views/Login.vue'
import VerifyEmail from '@/views/VerifyEmail.vue'
import Settings from '@/views/Settings.vue'

const login = vi.fn()
const verifyTwoFactor = vi.fn()
const verifyEmail = vi.fn()
const startTwoFactorSetup = vi.fn()
const enableTwoFactor = vi.fn()
const authState = {
  isLoading: false,
  error: null as string | null,
  errorCode: null as string | null,
  isDemoUser: false,
}

vi.mock('vue-cropperjs', () => ({ default: { template: '<div />' } }))
vi.mock('vue-cropperjs/node_modules/cropperjs/dist/cropper.css', () => ({}))

vi.mock('vue-toastification', () => ({
  useToast: () => ({ error: vi.fn(), success: vi.fn(), info: vi.fn() }),
}))

vi.mock('@/services/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/services/api')>()
  return {
    ...actual,
    authAPI: { ...actual.authAPI, resendVerification: vi.fn().mockResolvedValue({}) },
    securityAPI: {
      getStatus: vi.fn().mockResolvedValue({
        data: { data: { twoFactorEnabled: false, backupCodesRemaining: 0 } },
      }),
      startTwoFactorSetup: (...args: unknown[]) => startTwoFactorSetup(...args),
      enableTwoFactor: (...args: unknown[]) => enableTwoFactor(...args),
    },
  }
})

vi.mock('@/stores/auth', () => ({
  useAuthStore: () => ({
    get isLoading() {
      return authState.isLoading
    },
    get error() {
      return authState.error
    },
    get errorCode() {
      return authState.errorCode
    },
    get isDemoUser() {
      return authState.isDemoUser
    },
    isAuthenticated: true,
    user: { username: 'mika', email: 'mika@example.test', preferences: {} },
    login,
    verifyTwoFactor,
    verifyEmail,
  }),
}))

vi.mock('@/stores/favorites', () => ({ useFavoritesStore: () => ({ reset: vi.fn() }) }))

const stub = { template: '<div />' }

const mountAt = async (component: object, path: string) => {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', component: stub },
      { path: '/login', component: Login },
      { path: '/verify-email', name: 'verifyEmail', component: VerifyEmail },
      { path: '/unlock-account', name: 'unlockAccount', component: stub },
      { path: '/register', component: stub },
      { path: '/settings', component: Settings },
    ],
  })
  router.push(path)
  await router.isReady()
  const wrapper = mount(component, { global: { plugins: [router] } })
  await flushPromises()
  return { wrapper, router }
}

describe('account security flows', () => {
  beforeEach(() => {
    vi.useRealTimers()
    Object.assign(authState, { isLoading: false, error: null, errorCode: null, isDemoUser: false })
    ;[login, verifyTwoFactor, verifyEmail, startTwoFactorSetup, enableTwoFactor].forEach((fn) =>
      fn.mockReset(),
    )
  })

  it('asks for an authenticator code when the account has 2FA', async () => {
    login.mockResolvedValue({ requiresTwoFactor: true, challengeToken: 'challenge-1' })
    verifyTwoFactor.mockResolvedValue(undefined)
    const { wrapper, router } = await mountAt(Login, '/login')

    await wrapper.get('#email').setValue('mika@example.test')
    await wrapper.get('#password').setValue('Secret123!')
    await wrapper.get('form').trigger('submit')
    await flushPromises()

    const codeForm = wrapper.get('[data-testid="two-factor-form"]')
    await wrapper.get('#two-factor-code').setValue('123456')
    await codeForm.trigger('submit')
    await new Promise((resolve) => setTimeout(resolve, 120))
    await flushPromises()

    expect(verifyTwoFactor).toHaveBeenCalledWith('challenge-1', '123456')
    expect(router.currentRoute.value.path).toBe('/')
  })

  it('sends unverified accounts to email verification', async () => {
    login.mockImplementation(async () => {
      authState.errorCode = 'EMAIL_NOT_VERIFIED'
      throw new Error('unverified')
    })
    const { wrapper, router } = await mountAt(Login, '/login')

    await wrapper.get('#email').setValue('new@example.test')
    await wrapper.get('#password').setValue('Secret123!')
    await wrapper.get('form').trigger('submit')
    await flushPromises()

    expect(router.currentRoute.value.path).toBe('/verify-email')
    expect(router.currentRoute.value.query.email).toBe('new@example.test')
  })

  it('auto-submits the code from the emailed link', async () => {
    verifyEmail.mockResolvedValue({ alreadyVerified: false })
    const { router } = await mountAt(
      VerifyEmail,
      '/verify-email?email=new%40example.test&code=654321',
    )

    expect(verifyEmail).toHaveBeenCalledWith('new@example.test', '654321')
    expect(router.currentRoute.value.path).toBe('/')
  })

  it('walks through 2FA setup and shows backup codes once', async () => {
    startTwoFactorSetup.mockResolvedValue({
      data: { data: { secret: 'ABCDEF', qrCodeDataUrl: 'data:image/png;base64,xx' } },
    })
    enableTwoFactor.mockResolvedValue({
      data: { data: { backupCodes: ['aaaa-bbbb', 'cccc-dddd'] } },
    })
    const { wrapper } = await mountAt(Settings, '/settings')

    await wrapper.get('[data-testid="two-factor-start"]').trigger('click')
    await flushPromises()
    expect(wrapper.text()).toContain('ABCDEF')

    await wrapper.get('[data-testid="two-factor-setup-code"]').setValue('123456')
    await wrapper.get('[data-testid="two-factor"] form').trigger('submit')
    await flushPromises()

    expect(enableTwoFactor).toHaveBeenCalledWith('123456')
    expect(wrapper.get('[data-testid="backup-codes"]').text()).toContain('aaaa-bbbb')
  })

  it('does not offer 2FA to the demo account', async () => {
    authState.isDemoUser = true
    const { wrapper } = await mountAt(Settings, '/settings')

    expect(wrapper.get('[data-testid="two-factor"]').text()).toContain('cannot use two-factor')
    expect(wrapper.find('[data-testid="two-factor-start"]').exists()).toBe(false)
  })
})
