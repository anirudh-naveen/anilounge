import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { isChunkLoadError, reloadForNewBuild } from '@/utils/staleBuild'

describe('staleBuild', () => {
  const assign = vi.fn()

  beforeEach(() => {
    sessionStorage.clear()
    vi.stubGlobal('location', { ...window.location, assign, reload: vi.fn() })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    assign.mockReset()
  })

  it('recognises chunk fetch failures from each browser', () => {
    expect(
      isChunkLoadError(new TypeError('Failed to fetch dynamically imported module: /assets/a.js')),
    ).toBe(true)
    expect(isChunkLoadError(new TypeError('error loading dynamically imported module'))).toBe(true)
    expect(isChunkLoadError(new TypeError('Importing a module script failed.'))).toBe(true)
    expect(isChunkLoadError(new Error('Request failed with status code 500'))).toBe(false)
  })

  it('loads the target page once, then backs off', () => {
    expect(reloadForNewBuild('/forum')).toBe(true)
    expect(assign).toHaveBeenCalledWith('/forum')
    expect(reloadForNewBuild('/forum')).toBe(false)
    expect(assign).toHaveBeenCalledTimes(1)
  })
})
