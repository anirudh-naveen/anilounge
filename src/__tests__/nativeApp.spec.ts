import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import type { Router } from 'vue-router'

const browserOpen = vi.fn(() => Promise.resolve())
const splashHide = vi.fn(() => Promise.resolve())
const writeFile = vi.fn(() => Promise.resolve({ uri: 'file:///cache/log.txt' }))
const share = vi.fn(() => Promise.reject(new Error('Share canceled')))

const widgetState = vi.hoisted(() => ({ token: null as string | null }))
const widgetBridge = vi.hoisted(() => ({
  getToken: vi.fn(() => Promise.resolve({ token: widgetState.token })),
  setToken: vi.fn(({ token }: { token: string }) => {
    widgetState.token = token
    return Promise.resolve()
  }),
  clearToken: vi.fn(() => {
    widgetState.token = null
    return Promise.resolve()
  }),
  reload: vi.fn(() => Promise.resolve()),
}))
vi.mock('@capacitor/core', () => ({
  Capacitor: { isNativePlatform: () => true },
  registerPlugin: () => widgetBridge,
}))
const appListeners: Record<string, (event: { url: string }) => void> = {}
vi.mock('@capacitor/app', () => ({
  App: {
    addListener: (name: string, listener: (event: { url: string }) => void) => {
      appListeners[name] = listener
    },
    getLaunchUrl: () => Promise.resolve({ url: 'https://www.anilounge.net/forum?sort=new' }),
  },
}))
vi.mock('@capacitor/browser', () => ({ Browser: { open: browserOpen } }))
vi.mock('@capacitor/splash-screen', () => ({ SplashScreen: { hide: splashHide } }))
vi.mock('@capacitor/filesystem', () => ({
  Filesystem: { writeFile },
  Directory: { Cache: 'CACHE' },
  Encoding: { UTF8: 'utf8' },
}))
vi.mock('@capacitor/share', () => ({ Share: { share } }))

const pushListeners: Record<string, (event: never) => void> = {}
const pushRegister = vi.fn(() => Promise.resolve())
const requestPermissions = vi.fn(() => Promise.resolve({ receive: 'granted' }))
vi.mock('@capacitor/push-notifications', () => ({
  PushNotifications: {
    addListener: (name: string, listener: (event: never) => void) => {
      pushListeners[name] = listener
      return Promise.resolve({ remove: vi.fn() })
    },
    checkPermissions: () => Promise.resolve({ receive: 'granted' }),
    requestPermissions,
    register: pushRegister,
  },
}))
const registerDevice = vi.fn(() => Promise.resolve({}))
const unregisterDevice = vi.fn(() => Promise.resolve({}))
const issueToken = vi.fn(() => Promise.resolve({ data: { data: { token: 'widget-secret' } } }))
const revokeToken = vi.fn(() => Promise.resolve({}))
vi.mock('@/services/api', () => ({
  pushAPI: { registerDevice, unregisterDevice },
  widgetAPI: { issueToken, revokeToken },
}))
vi.mock('@capacitor/status-bar', () => ({
  StatusBar: { setStyle: vi.fn(() => Promise.resolve()) },
  Style: { Dark: 'DARK' },
}))

const push = vi.fn()
const currentRoute = { value: { fullPath: '/' } }

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
  /** Paths opened while starting up (the launch link resolves after start returns). */
  let launchPushes: unknown[][] = []

  beforeAll(async () => {
    const { startNativeApp } = await import('@/utils/nativeApp')
    await startNativeApp({ push, currentRoute } as unknown as Router)
    await new Promise((resolve) => setTimeout(resolve))
    launchPushes = [...push.mock.calls]
  })

  afterEach(() => {
    browserOpen.mockClear()
    push.mockClear()
  })

  it('hides the splash screen once started', () => {
    expect(splashHide).toHaveBeenCalled()
  })

  it('opens the page for a link that launched the app', () => {
    expect(launchPushes).toEqual([['/forum?sort=new']])
  })

  it('opens anilounge.net links tapped while the app is running, ignoring others', () => {
    appListeners.appUrlOpen!({ url: 'https://anilounge.net/u/mika#forum' })
    appListeners.appUrlOpen!({ url: 'https://example.com/u/mika' })
    expect(push).toHaveBeenCalledTimes(1)
    expect(push).toHaveBeenCalledWith('/u/mika#forum')
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

  it('shares links with the native sheet and reports a closed sheet as cancelled', async () => {
    const { shareLink } = await import('@/utils/nativeApp')
    share.mockResolvedValueOnce(undefined as never)
    const link = { title: 'Frieren', url: 'https://www.anilounge.net/tv-show/frieren/12' }
    await expect(shareLink(link)).resolves.toBe('shared')
    expect(share).toHaveBeenLastCalledWith({ ...link, dialogTitle: 'Frieren' })
    await expect(shareLink(link)).resolves.toBe('cancelled')
  })

  it('opens the page a tapped notification points to', () => {
    pushListeners.pushNotificationActionPerformed!({
      notification: { data: { path: '/forum/post/p1#comment-c2' } },
    } as never)
    pushListeners.pushNotificationActionPerformed!({
      notification: { data: { path: 'https://evil.example' } },
    } as never)
    expect(push).toHaveBeenCalledTimes(1)
    expect(push).toHaveBeenCalledWith('/forum/post/p1#comment-c2')
  })

  it('turns on notifications, registers the token, and forgets it on sign-out', async () => {
    const { enablePush, forgetPushDevice } = await import('@/utils/nativeApp')
    await expect(enablePush()).resolves.toBe(true)
    expect(requestPermissions).toHaveBeenCalled()
    expect(pushRegister).toHaveBeenCalled()

    pushListeners.registration!({ value: 'ab'.repeat(32) } as never)
    await new Promise((resolve) => setTimeout(resolve))
    expect(registerDevice).toHaveBeenCalledWith('ab'.repeat(32))

    await forgetPushDevice()
    expect(unregisterDevice).toHaveBeenCalledWith('ab'.repeat(32))
    unregisterDevice.mockClear()
    await forgetPushDevice()
    expect(unregisterDevice).not.toHaveBeenCalled()
  })

  it('opens the page for a widget tap', () => {
    appListeners.appUrlOpen!({ url: 'anilounge://app/tv-show/frieren/12?tab=cast' })
    appListeners.appUrlOpen!({ url: 'anilounge://other/tv-show/frieren/12' })
    expect(push).toHaveBeenCalledTimes(1)
    expect(push).toHaveBeenCalledWith('/tv-show/frieren/12?tab=cast')
  })

  it('signs the widgets in once and out again with the account', async () => {
    const { connectWidgets, disconnectWidgets } = await import('@/utils/nativeApp')
    await connectWidgets()
    expect(issueToken).toHaveBeenCalledTimes(1)
    expect(widgetBridge.setToken).toHaveBeenCalledWith({ token: 'widget-secret' })

    await connectWidgets()
    expect(issueToken).toHaveBeenCalledTimes(1)

    await disconnectWidgets()
    expect(revokeToken).toHaveBeenCalledWith('widget-secret')
    expect(widgetBridge.clearToken).toHaveBeenCalled()
    expect(widgetState.token).toBeNull()
  })

  it('hides donation links', async () => {
    const { DONATE_URL } = await import('@/utils/donations')
    expect(DONATE_URL).toBe('')
  })
})
