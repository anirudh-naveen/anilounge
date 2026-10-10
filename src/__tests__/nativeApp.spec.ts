import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import type { Router } from 'vue-router'

const browserOpen = vi.fn(() => Promise.resolve())
const splashHide = vi.fn(() => Promise.resolve())
const writeFile = vi.fn(() => Promise.resolve({ uri: 'file:///cache/log.txt' }))
const share = vi.fn(() => Promise.reject(new Error('Share canceled')))

vi.mock('@capacitor/core', () => ({ Capacitor: { isNativePlatform: () => true } }))
vi.mock('@capacitor/app', () => ({ App: { addListener: vi.fn() } }))
vi.mock('@capacitor/browser', () => ({ Browser: { open: browserOpen } }))
vi.mock('@capacitor/splash-screen', () => ({ SplashScreen: { hide: splashHide } }))
vi.mock('@capacitor/filesystem', () => ({
  Filesystem: { writeFile },
  Directory: { Cache: 'CACHE' },
  Encoding: { UTF8: 'utf8' },
}))
vi.mock('@capacitor/share', () => ({ Share: { share } }))
vi.mock('@capacitor/status-bar', () => ({
  StatusBar: { setStyle: vi.fn(() => Promise.resolve()) },
  Style: { Dark: 'DARK' },
}))

const push = vi.fn()

/** Click a link and report whether the page's own navigation was cancelled. */
const click = (href: string, target = '') => {
  const link = document.createElement('a')
  link.href = href
  if (target) link.target = target
  let cancelled = false
  // Runs after the app's capture-phase handler; then stops jsdom from navigating.
  link.addEventListener('click', (event) => {
    cancelled = event.defaultPrevented
    event.preventDefault()
  })
  document.body.appendChild(link)
  link.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 }))
  link.remove()
  return cancelled
}

describe('nativeApp (inside the iOS app)', () => {
  beforeAll(async () => {
    const { startNativeApp } = await import('@/utils/nativeApp')
    await startNativeApp({ push } as unknown as Router)
  })

  afterEach(() => {
    browserOpen.mockClear()
    push.mockClear()
  })

  it('hides the splash screen once started', () => {
    expect(splashHide).toHaveBeenCalled()
  })

  it('opens off-site links in the in-app browser sheet', () => {
    expect(click('https://discord.gg/example', '_blank')).toBe(true)
    expect(browserOpen).toHaveBeenCalledWith({ url: 'https://discord.gg/example' })
  })

  it("opens this site's new-tab links in place", () => {
    const href = `${window.location.origin}/tv-show/frieren/12?tab=cast#top`
    expect(click(href, '_blank')).toBe(true)
    expect(push).toHaveBeenCalledWith('/tv-show/frieren/12?tab=cast#top')
    expect(browserOpen).not.toHaveBeenCalled()
  })

  it('leaves ordinary same-site and non-web links alone', () => {
    expect(click(`${window.location.origin}/forum`)).toBe(false)
    expect(click('mailto:support@anilounge.net')).toBe(false)
    expect(push).not.toHaveBeenCalled()
    expect(browserOpen).not.toHaveBeenCalled()
  })

  it('saves text files through the share sheet, ignoring a cancelled sheet', async () => {
    const { saveTextFile } = await import('@/utils/nativeApp')
    await expect(saveTextFile('log.txt', 'hello')).resolves.toBeUndefined()
    expect(writeFile).toHaveBeenCalledWith({
      path: 'log.txt',
      data: 'hello',
      directory: 'CACHE',
      encoding: 'utf8',
    })
    expect(share).toHaveBeenCalledWith({ title: 'log.txt', files: ['file:///cache/log.txt'] })
  })

  it('hides donation links', async () => {
    const { DONATE_URL } = await import('@/utils/donations')
    expect(DONATE_URL).toBe('')
  })
})
