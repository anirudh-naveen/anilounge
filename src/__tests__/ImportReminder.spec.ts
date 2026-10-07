import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { shouldShowImportReminder } from '@/utils/watchlist'
import ImportReminder from '@/components/ImportReminder.vue'

const auth = vi.hoisted(() => ({ user: null as Record<string, unknown> | null }))
vi.mock('@/stores/auth', () => ({ useAuthStore: () => auth }))

const now = new Date('2026-10-03T12:00:00Z')
const daysAgo = (days: number) => new Date(now.getTime() - days * 86400000).toISOString()

describe('shouldShowImportReminder', () => {
  it('reminds accounts in their first month that have never imported', () => {
    expect(shouldShowImportReminder({ createdAt: daysAgo(3) }, now)).toBe(true)
    expect(shouldShowImportReminder({ createdAt: daysAgo(29) }, now)).toBe(true)
  })

  it('stops after a month, after an import, and for the demo account', () => {
    expect(shouldShowImportReminder({ createdAt: daysAgo(31) }, now)).toBe(false)
    expect(
      shouldShowImportReminder({ createdAt: daysAgo(3), watchlistImportedAt: daysAgo(1) }, now),
    ).toBe(false)
    expect(shouldShowImportReminder({ createdAt: daysAgo(3), isDemoAccount: true }, now)).toBe(
      false,
    )
    expect(shouldShowImportReminder(null, now)).toBe(false)
  })
})

describe('ImportReminder', () => {
  beforeEach(() => {
    localStorage.clear()
    auth.user = { id: 'u1', createdAt: new Date().toISOString(), watchlistImportedAt: null }
  })

  const mountReminder = () =>
    mount(ImportReminder, {
      global: {
        stubs: { RouterLink: { props: ['to'], template: '<a :href="to"><slot /></a>' } },
      },
    })

  it('points new users to the Connections page and can be dismissed for good', async () => {
    const wrapper = mountReminder()
    expect(wrapper.text()).toContain('Connect your account')
    expect(wrapper.get('a').attributes('href')).toBe('/connections')

    await wrapper.get('.dismiss-btn').trigger('click')
    expect(wrapper.find('[data-testid="import-reminder"]').exists()).toBe(false)
    expect(mountReminder().find('[data-testid="import-reminder"]').exists()).toBe(false)
  })

  it('stays hidden once the user has imported', () => {
    auth.user = { id: 'u1', createdAt: new Date().toISOString(), watchlistImportedAt: '2026-10-01' }
    expect(mountReminder().find('[data-testid="import-reminder"]').exists()).toBe(false)
  })
})
