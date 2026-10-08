/**
 * `fetch` with a timeout that never throws: network failures come back as status 0.
 * Shared by the watchlist import and linked-account (connections) services.
 */

const FETCH_TIMEOUT_MS = 20000

/**
 * @param {string} url
 * @param {RequestInit} [init]
 * @returns {Promise<{ status: number, body: any }>}
 */
export async function fetchJson(url, init = {}) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
  try {
    const response = await fetch(url, { ...init, signal: controller.signal })
    const body = await response.json().catch(() => null)
    return { status: response.status, body }
  } catch {
    return { status: 0, body: null }
  } finally {
    clearTimeout(timer)
  }
}
