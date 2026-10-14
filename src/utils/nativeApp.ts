/**
 * nativeApp.ts — behaviour for the iOS app, which loads this site in a native shell
 * (capacitor.config.ts). In browsers `isNativeApp` is false and `startNativeApp` does
 * nothing, so plugin code is only downloaded inside the app.
 */

import { Capacitor, registerPlugin } from '@capacitor/core'
import type { Router } from 'vue-router'
import { pushAPI, widgetAPI } from '@/services/api'
import { noteWatchlistSave, recordAppOpen } from '@/utils/appReview'

export const isNativeApp = Capacitor.isNativePlatform()

/**
 * Whether to show the app layout (bottom tab bar, compact top bars, sheets) instead of
 * the site chrome. On in the iOS app; in development, `?app-layout=1` previews it in a
 * browser for the rest of the tab and `?app-layout=0` turns it back off.
 */
export const isAppLayout = isNativeApp || (import.meta.env.DEV && previewAppLayout())

function previewAppLayout(): boolean {
  if (typeof window === 'undefined') return false
  try {
    const flag = new URLSearchParams(window.location.search).get('app-layout')
    if (flag === '1') sessionStorage.setItem('anilounge:app-layout', '1')
    if (flag === '0') sessionStorage.removeItem('anilounge:app-layout')
    return sessionStorage.getItem('anilounge:app-layout') === '1'
  } catch {
    return false
  }
}

/** After this long in the background, check for a newer deploy on return. */
const STALE_AFTER_MS = 10 * 60 * 1000

const SCRIPT_PATTERN = /\/assets\/index-[\w-]+\.js/

/** The entry script this page is running, e.g. `/assets/index-abc123.js`. */
const runningBuild = (): string | null => {
  const script = document.querySelector<HTMLScriptElement>('script[type="module"][src]')
  return script?.getAttribute('src')?.match(SCRIPT_PATTERN)?.[0] ?? null
}

/** Reload when the live site has been redeployed since this page loaded. */
const reloadIfRedeployed = async () => {
  const current = runningBuild()
  if (!current) return
  try {
    const html = await fetch('/', { cache: 'no-store' }).then((response) => response.text())
    const latest = html.match(SCRIPT_PATTERN)?.[0]
    if (latest && latest !== current) window.location.reload()
  } catch {
    // Offline: keep the page that's already open.
  }
}

/** Hosts whose links open in the app (universal links; ios/App/App/App.entitlements). */
const APP_LINK_HOSTS = new Set(['anilounge.net', 'www.anilounge.net'])

/**
 * The in-app path for a universal link or a widget's `anilounge://app/<path>` link,
 * or null for any other address.
 */
export function appLinkPath(address: string): string | null {
  try {
    const url = new URL(address)
    const universal = url.protocol === 'https:' && APP_LINK_HOSTS.has(url.hostname)
    const widget = url.protocol === 'anilounge:' && url.hostname === 'app'
    if (!universal && !widget) return null
    return (url.pathname || '/') + url.search + url.hash
  } catch {
    return null
  }
}

/**
 * Off-site links open in an in-app browser sheet instead of leaving the app. The app has
 * no tabs, so this site's new-tab links open in place (iOS would send them to Safari).
 */
const handleLinks = (router: Router, openUrl: (url: string) => void) => {
  document.addEventListener(
    'click',
    (event) => {
      if (event.defaultPrevented || event.button !== 0) return
      const link = (event.target as Element | null)?.closest?.('a[href]')
      if (!(link instanceof HTMLAnchorElement)) return
      // Links that open another app themselves (data-open-with="app").
      if (link.dataset.openWith === 'app') return
      const url = new URL(link.href, window.location.href)
      if (!/^https?:$/.test(url.protocol)) return
      if (url.origin === window.location.origin) {
        if (link.target !== '_blank') return
        event.preventDefault()
        router.push(url.pathname + url.search + url.hash)
        return
      }
      event.preventDefault()
      openUrl(url.href)
    },
    true,
  )
}

/**
 * Open a link in the app it belongs to (a Crunchyroll or Netflix link opens their app
 * when installed), else in Safari. Browsers open it in a new tab.
 */
export async function openInOtherApp(url: string): Promise<void> {
  if (!isNativeApp) {
    window.open(url, '_blank', 'noopener')
    return
  }
  const { AppLauncher } = await import('@capacitor/app-launcher')
  await AppLauncher.openUrl({ url })
}

/**
 * Open a calendar (.ics) link. In the app it opens in the in-app browser, which offers
 * "Add to Calendar"; browsers download or open it.
 */
export async function openCalendarFile(url: string): Promise<void> {
  if (!isNativeApp) {
    window.location.assign(url)
    return
  }
  const { Browser } = await import('@capacitor/browser')
  await Browser.open({ url })
}

/** The viewer's country (from the device language, e.g. en-GB → GB), for regional data. */
export function viewerRegion(): string {
  const locales = [...(navigator.languages || []), navigator.language]
  for (const locale of locales) {
    const region = locale?.split(/[-_]/)[1]
    if (region && /^[A-Za-z]{2}$/.test(region)) return region.toUpperCase()
  }
  return 'US'
}

/** US time zones (IANA names and their `US/*` aliases), for telling US viewers apart. */
const US_TIME_ZONES = new Set([
  'America/New_York',
  'America/Detroit',
  'America/Chicago',
  'America/Menominee',
  'America/Denver',
  'America/Boise',
  'America/Phoenix',
  'America/Los_Angeles',
  'America/Anchorage',
  'America/Juneau',
  'America/Sitka',
  'America/Metlakatla',
  'America/Yakutat',
  'America/Nome',
  'America/Adak',
  'Pacific/Honolulu',
])
const US_TIME_ZONE_PREFIXES = [
  'America/Indiana/',
  'America/Kentucky/',
  'America/North_Dakota/',
  'US/',
]

/**
 * Whether the viewer is in the United States: by the device's time zone when it
 * has one (it follows where the device is, unlike the language), else by the
 * language's country.
 * @param timeZone - Override for tests; defaults to the device's zone.
 */
export function isViewerInUS(timeZone?: string): boolean {
  let zone = timeZone
  if (zone === undefined) {
    try {
      zone = Intl.DateTimeFormat().resolvedOptions().timeZone || ''
    } catch {
      zone = ''
    }
  }
  if (zone && zone !== 'UTC' && zone !== 'Etc/UTC') {
    return (
      US_TIME_ZONES.has(zone) || US_TIME_ZONE_PREFIXES.some((prefix) => zone.startsWith(prefix))
    )
  }
  return viewerRegion() === 'US'
}

/**
 * Share a link with the system share sheet (the app's native sheet, or the browser's
 * where it has one), falling back to copying the link.
 * @returns What happened: `copied` means show a "link copied" note; `failed` means the
 *   caller should offer the link another way.
 */
export async function shareLink(link: {
  title: string
  text?: string
  url: string
}): Promise<'shared' | 'copied' | 'cancelled' | 'failed'> {
  if (isNativeApp) {
    const { Share } = await import('@capacitor/share')
    try {
      await Share.share({ ...link, dialogTitle: link.title })
      return 'shared'
    } catch {
      return 'cancelled'
    }
  }
  if (typeof navigator.share === 'function') {
    try {
      await navigator.share(link)
      return 'shared'
    } catch (error) {
      if ((error as Error)?.name === 'AbortError') return 'cancelled'
    }
  }
  try {
    await navigator.clipboard.writeText(link.url)
    return 'copied'
  } catch {
    return 'failed'
  }
}

/**
 * A light tap of haptic feedback in the app (`success` for bigger moments like a new
 * friend). Does nothing in browsers.
 */
export function haptic(kind: 'tap' | 'success' = 'tap'): void {
  if (!isNativeApp) return
  import('@capacitor/haptics')
    .then(({ Haptics, ImpactStyle, NotificationType }) =>
      kind === 'success'
        ? Haptics.notification({ type: NotificationType.Success })
        : Haptics.impact({ style: ImpactStyle.Light }),
    )
    .catch(() => {})
}

/**
 * Save a text file. Browsers download it; the app has no downloads, so it writes the
 * file to the app's cache and opens the share sheet (Save to Files, AirDrop, Mail, ...).
 */
export async function saveTextFile(filename: string, text: string): Promise<void> {
  if (!isNativeApp) {
    const url = URL.createObjectURL(new Blob([text], { type: 'text/plain' }))
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = filename
    anchor.click()
    URL.revokeObjectURL(url)
    return
  }
  const [{ Directory, Encoding, Filesystem }, { Share }] = await Promise.all([
    import('@capacitor/filesystem'),
    import('@capacitor/share'),
  ])
  const { uri } = await Filesystem.writeFile({
    path: filename,
    data: text,
    directory: Directory.Cache,
    encoding: Encoding.UTF8,
  })
  try {
    await Share.share({ title: filename, files: [uri] })
  } catch {
    // Closing the share sheet without picking anything rejects; nothing to do.
  }
}

// ---------------------------------------------------------------------------
// Push notifications
// ---------------------------------------------------------------------------

/** This device's APNs token, once registered with the API (so sign-out can remove it). */
const PUSH_TOKEN_KEY = 'anilounge:push-token'

const storedPushToken = (): string | null => {
  try {
    return localStorage.getItem(PUSH_TOKEN_KEY)
  } catch {
    return null
  }
}

let pushListeners: Promise<typeof import('@capacitor/push-notifications')> | null = null

/** The push plugin, with its token and tap listeners attached once. */
const pushPlugin = (router?: Router) => {
  pushListeners ??= import('@capacitor/push-notifications').then(async (plugin) => {
    const { PushNotifications } = plugin
    await PushNotifications.addListener('registration', ({ value }) => {
      pushAPI
        .registerDevice(value)
        .then(() => {
          try {
            localStorage.setItem(PUSH_TOKEN_KEY, value)
          } catch {
            // Without storage, sign-out just can't unregister this device; the server
            // drops it when the token stops working.
          }
        })
        .catch(() => {})
    })
    // Tapping a notification opens the page it is about.
    await PushNotifications.addListener('pushNotificationActionPerformed', ({ notification }) => {
      const path = (notification.data as { path?: unknown } | undefined)?.path
      if (router && typeof path === 'string' && path.startsWith('/')) router.push(path)
    })
    return plugin
  })
  return pushListeners
}

/** Notification permission for this app: 'unavailable' outside the iOS app. */
export async function pushPermission(): Promise<'granted' | 'denied' | 'prompt' | 'unavailable'> {
  if (!isNativeApp) return 'unavailable'
  const { PushNotifications } = await pushPlugin()
  const { receive } = await PushNotifications.checkPermissions()
  return receive === 'granted' || receive === 'denied' ? receive : 'prompt'
}

/**
 * Ask for notification permission (iOS shows its prompt once) and register this
 * device for the signed-in user.
 * @returns Whether notifications are now on.
 */
export async function enablePush(): Promise<boolean> {
  if (!isNativeApp) return false
  const { PushNotifications } = await pushPlugin()
  const { receive } = await PushNotifications.requestPermissions()
  if (receive !== 'granted') return false
  await PushNotifications.register()
  return true
}

/** Re-register when signed in with permission already given (tokens can change). */
export async function refreshPushRegistration(): Promise<void> {
  if ((await pushPermission()) !== 'granted') return
  const { PushNotifications } = await pushPlugin()
  await PushNotifications.register()
}

/** Stop pushes to this device for the account signing out. Call before signing out. */
export async function forgetPushDevice(): Promise<void> {
  const token = isNativeApp ? storedPushToken() : null
  if (!token) return
  try {
    await pushAPI.unregisterDevice(token)
  } catch {
    // Signing out still goes ahead; the token moves to whoever signs in next.
  }
  try {
    localStorage.removeItem(PUSH_TOKEN_KEY)
  } catch {
    // Nothing stored to clear.
  }
}

// ---------------------------------------------------------------------------
// Home screen widgets
// ---------------------------------------------------------------------------

/** The app's own plugin (ios/App/App/WidgetBridgePlugin.swift). */
interface WidgetBridgePlugin {
  getToken(): Promise<{ token: string | null }>
  setToken(options: { token: string }): Promise<void>
  clearToken(): Promise<void>
  reload(): Promise<void>
  setTheme(options: { theme: string }): Promise<void>
  setAppIcon(options: { theme: string }): Promise<{ changed: boolean }>
  requestReview(): Promise<void>
}

const WidgetBridge = registerPlugin<WidgetBridgePlugin>('WidgetBridge')

/** Give the widgets a sign-in of their own, unless they already have one. */
export async function connectWidgets(): Promise<void> {
  if (!isNativeApp) return
  const { token } = await WidgetBridge.getToken()
  if (token) return
  const response = await widgetAPI.issueToken()
  await WidgetBridge.setToken({ token: (response.data.data as { token: string }).token })
}

/** Sign the widgets out with the account (call before signing out). */
export async function disconnectWidgets(): Promise<void> {
  if (!isNativeApp) return
  try {
    const { token } = await WidgetBridge.getToken()
    if (token) await widgetAPI.revokeToken(token).catch(() => {})
    await WidgetBridge.clearToken()
  } catch {
    // An older app build without the widget plugin: nothing to sign out.
  }
}

/** Tell the widgets which site theme is saved (they redraw only when it changed). */
export function setWidgetTheme(theme: string): void {
  if (isNativeApp) WidgetBridge.setTheme({ theme }).catch(() => {})
}

/**
 * Switch the home screen icon to match a theme someone just picked. iOS shows a brief
 * "icon changed" notice, so this only runs on an actual change in Settings.
 */
export function setAppIconTheme(theme: string): void {
  if (isNativeApp) WidgetBridge.setAppIcon({ theme }).catch(() => {})
}

/** How long after a save the rating prompt waits, so the save itself lands first. */
const REVIEW_DELAY_MS = 1500

/**
 * A watchlist save went through: for long-time app users, now and then ask for an App
 * Store rating (utils/appReview.ts). Does nothing in browsers.
 */
export function noteGoodMoment(): void {
  if (!isNativeApp) return
  void noteWatchlistSave(
    () =>
      new Promise<void>((resolve, reject) => {
        setTimeout(() => WidgetBridge.requestReview().then(resolve, reject), REVIEW_DELAY_MS)
      }),
  )
}

/** Ask the widgets to refresh (after a watchlist change). */
export function refreshWidgets(): void {
  if (isNativeApp) WidgetBridge.reload().catch(() => {})
}

/** Set up the native shell. Call once after the app mounts. */
/**
 * Stop iOS zooming in when a text field under 16px is focused. The app shell turns off
 * pinch zoom (Capacitor's `zoomEnabled`), so that zoom could never be pinched back out.
 */
function lockViewportZoom() {
  const viewport = document.querySelector<HTMLMetaElement>('meta[name="viewport"]')
  if (viewport && !viewport.content.includes('maximum-scale')) {
    viewport.content += ', maximum-scale=1'
  }
}

export async function startNativeApp(router: Router): Promise<void> {
  if (!isNativeApp) return
  lockViewportZoom()
  const [{ App }, { Browser }, { SplashScreen }, { StatusBar, Style }] = await Promise.all([
    import('@capacitor/app'),
    import('@capacitor/browser'),
    import('@capacitor/splash-screen'),
    import('@capacitor/status-bar'),
  ])

  // Every theme has a dark navbar, so the status bar text stays light.
  StatusBar.setStyle({ style: Style.Dark }).catch(() => {})
  SplashScreen.hide().catch(() => {})

  handleLinks(router, (url) => {
    Browser.open({ url }).catch(() => {})
  })

  // Attach the push tap listener early, so a tap that launched the app is handled.
  pushPlugin(router).catch(() => {})

  // An anilounge.net link tapped in another app opens that page here.
  const openAppLink = (address: string | undefined) => {
    const path = address && appLinkPath(address)
    if (path && path !== router.currentRoute.value.fullPath) router.push(path)
  }
  App.addListener('appUrlOpen', ({ url }) => openAppLink(url))
  App.getLaunchUrl()
    .then((launch) => openAppLink(launch?.url))
    .catch(() => {})

  // Count the days the app is used (for when to ask for a rating).
  recordAppOpen()

  let backgroundedAt = 0
  App.addListener('appStateChange', ({ isActive }) => {
    if (!isActive) {
      backgroundedAt = Date.now()
      return
    }
    recordAppOpen()
    if (backgroundedAt && Date.now() - backgroundedAt > STALE_AFTER_MS) reloadIfRedeployed()
  })
}
