/**
 * staleBuild.ts — recover a tab left open across a deploy.
 *
 * Pages are lazy-loaded chunks with hashed names. After a deploy the old chunks are gone,
 * so a tab still running the previous build fails to load any page it has not opened yet,
 * and the click does nothing. A full page load picks up the new build.
 */

const RELOAD_KEY = 'anilounge-stale-build-reload'
/** Skip reloading again this soon after the last one, so a real outage cannot loop. */
const RELOAD_COOLDOWN_MS = 10_000

/** True for the errors browsers throw when a dynamic import() cannot be fetched. */
export const isChunkLoadError = (error: unknown) => {
  const message = error instanceof Error ? error.message : String(error ?? '')
  return /Failed to fetch dynamically imported module|error loading dynamically imported module|Importing a module script failed|Unable to preload CSS/i.test(
    message,
  )
}

/**
 * Load `url` (default: the current page) from the server.
 * @returns False when a reload just happened, so the caller should surface the error instead.
 */
export const reloadForNewBuild = (url?: string) => {
  try {
    const last = Number(sessionStorage.getItem(RELOAD_KEY) || 0)
    if (Date.now() - last < RELOAD_COOLDOWN_MS) return false
    sessionStorage.setItem(RELOAD_KEY, String(Date.now()))
  } catch {
    // Storage blocked: still reload; the cooldown is only a safety net.
  }
  if (url) window.location.assign(url)
  else window.location.reload()
  return true
}
