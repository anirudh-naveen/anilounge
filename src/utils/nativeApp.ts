/**
 * nativeApp.ts — behaviour for the iOS app, which loads this site in a native shell
 * (capacitor.config.ts). In browsers `isNativeApp` is false and `startNativeApp` does
 * nothing, so plugin code is only downloaded inside the app.
 */

import { Capacitor } from '@capacitor/core'
import type { Router } from 'vue-router'

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

/** Set up the native shell. Call once after the app mounts. */
export async function startNativeApp(router: Router): Promise<void> {
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

  handleLinks(router, (url) => {
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
