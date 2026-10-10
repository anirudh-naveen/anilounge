import { beforeEach, describe, expect, it } from 'vitest'
import { nextTick } from 'vue'
import { THEME_STORAGE_KEY, useTheme } from '@/composables/useTheme'

describe('useTheme', () => {
  beforeEach(() => {
    localStorage.clear()
    useTheme().setPreference('dark')
  })

  it('applies and saves the chosen theme', async () => {
    const theme = useTheme()
    theme.setPreference('dusk')
    await nextTick()
    expect(document.documentElement.dataset.theme).toBe('dusk')
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe('dusk')
  })

  it('previews a theme without saving it', async () => {
    const theme = useTheme()
    theme.preview('penumbra')
    await nextTick()
    expect(document.documentElement.dataset.theme).toBe('penumbra')
    expect(theme.preference.value).toBe('dark')
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe('dark')

    theme.preview(null)
    await nextTick()
    expect(document.documentElement.dataset.theme).toBe('dark')
  })
})
