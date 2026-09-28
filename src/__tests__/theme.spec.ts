import { beforeEach, describe, expect, it } from 'vitest'
import { nextTick } from 'vue'
import { THEME_STORAGE_KEY, useTheme } from '@/composables/useTheme'

describe('useTheme', () => {
  beforeEach(() => {
    localStorage.clear()
    useTheme().setPreference('system')
  })

  it('toggles between light and dark and saves the choice', async () => {
    const theme = useTheme()
    theme.setPreference('light')
    await nextTick()
    expect(document.documentElement.dataset.theme).toBe('light')

    theme.toggle()
    await nextTick()
    expect(theme.resolved.value).toBe('dark')
    expect(document.documentElement.dataset.theme).toBe('dark')
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe('dark')
  })

  it('forgets the saved choice when following the system', async () => {
    const theme = useTheme()
    theme.setPreference('dark')
    theme.setPreference('system')
    await nextTick()
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBeNull()
    expect(theme.preference.value).toBe('system')
  })
})
