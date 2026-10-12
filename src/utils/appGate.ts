/**
 * appGate.ts — the iOS app's sign-in wall (utils).
 *
 * The app is built around an account, so signed-out visitors are sent to the welcome
 * screen (AppWelcome.vue), which explains why and offers sign-up and log-in. Sign-in
 * pages and the privacy and support pages stay open (App Review checks those links).
 * Browsers are never gated.
 */

import type { RouteLocationNormalized, RouteLocationRaw } from 'vue-router'

/** Routes a signed-out visitor can open in the app. */
export const APP_PUBLIC_ROUTES = new Set([
  'appWelcome',
  'login',
  'register',
  'verifyEmail',
  'unlockAccount',
  'privacy',
  'support',
])

/**
 * Where to send a navigation instead, or null to let it through.
 * @param to - The route being opened.
 * @param state - Whether this is the iOS app and whether someone is signed in.
 */
export function appGateRedirect(
  to: Pick<RouteLocationNormalized, 'name' | 'fullPath'>,
  { isNativeApp, isAuthenticated }: { isNativeApp: boolean; isAuthenticated: boolean },
): RouteLocationRaw | null {
  const name = String(to.name ?? '')
  // The welcome screen is only for signed-out app visitors.
  if (name === 'appWelcome') return isNativeApp && !isAuthenticated ? null : '/'
  if (!isNativeApp || isAuthenticated || APP_PUBLIC_ROUTES.has(name)) return null
  return { name: 'appWelcome', query: to.fullPath === '/' ? {} : { redirect: to.fullPath } }
}
