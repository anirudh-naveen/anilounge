/**
 * nativeApp.ts — behaviour for the iOS app, which loads this site in a native shell
 * (capacitor.config.ts). In browsers `isNativeApp` is false and `startNativeApp` does
 * nothing, so plugin code is only downloaded inside the app.
 */

import { Capacitor } from '@capacitor/core'

export const isNativeApp = Capacitor.isNativePlatform()

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

/** Off-site links open in an in-app browser sheet instead of leaving the app. */
const openExternalLinksInSheet = (openUrl: (url: string) => void) => {
  document.addEventListener(
    'click',
    (event) => {
      if (event.defaultPrevented || event.button !== 0) return
      const link = (event.target as Element | null)?.closest?.('a[href]')
      if (!(link instanceof HTMLAnchorElement)) return
      const url = new URL(link.href, window.location.href)
      if (!/^https?:$/.test(url.protocol) || url.origin === window.location.origin) return
      event.preventDefault()
      openUrl(url.href)
    },
    true,
  )
}

/** Set up the native shell. Call once after the app mounts. */
export async function startNativeApp(): Promise<void> {
  if (!isNativeApp) return
  const [{ App }, { Browser }, { SplashScreen }, { StatusBar, Style }] = await Promise.all([
    import('@capacitor/app'),
    import('@capacitor/browser'),
    import('@capacitor/splash-screen'),
    import('@capacitor/status-bar'),
  ])

  // Every theme has a dark navbar, so the status bar text stays light.
  StatusBar.setStyle({ style: Style.Dark }).catch(() => {})
  SplashScreen.hide().catch(() => {})

  openExternalLinksInSheet((url) => {
    Browser.open({ url }).catch(() => {})
  })

  let backgroundedAt = 0
  App.addListener('appStateChange', ({ isActive }) => {
    if (!isActive) {
      backgroundedAt = Date.now()
      return
    }
    if (backgroundedAt && Date.now() - backgroundedAt > STALE_AFTER_MS) reloadIfRedeployed()
  })
}
