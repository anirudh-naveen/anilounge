/**
 * metrics.ts — page-view and click tracking for the admin Metrics tab.
 *
 * Views come from the router (`trackPageView`); clicks from one document listener
 * that records links, buttons, and anything marked `data-track="label"` (mark an area
 * `data-no-track` to skip it). Events are batched and sent to `POST /api/metrics/events`
 * with a random visitor id kept in localStorage. Admin pages are not tracked.
 */

import { API_BASE_URL, getAccessToken } from './api'

type SiteEvent = { type: 'view' | 'click'; path: string; target?: string; referrer?: string }

const VISITOR_KEY = 'al_visitor_id'
const FLUSH_DELAY_MS = 5000
const MAX_QUEUE = 20
const LABEL_MAX = 60

let queue: SiteEvent[] = []
let flushTimer: ReturnType<typeof setTimeout> | undefined
let visitorId: string | null = null
let firstView = true

/** Random id for this browser; falls back to one per page load without storage. */
function getVisitorId(): string {
  if (visitorId) return visitorId
  const fresh = () =>
    globalThis.crypto?.randomUUID?.() ??
    `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`
  try {
    visitorId = localStorage.getItem(VISITOR_KEY)
    if (!visitorId) {
      visitorId = fresh()
      localStorage.setItem(VISITOR_KEY, visitorId)
    }
  } catch {
    visitorId = fresh()
  }
  return visitorId
}

const isTrackedPath = (path: string) => !path.startsWith('/admin')

/** Send queued events. `keepalive` lets the request finish while the page closes. */
function flush() {
  clearTimeout(flushTimer)
  flushTimer = undefined
  if (!queue.length) return
  const events = queue
  queue = []
  const token = getAccessToken()
  fetch(`${API_BASE_URL}/metrics/events`, {
    method: 'POST',
    keepalive: true,
    credentials: 'same-origin',
    headers: {
      'Content-Type': 'application/json',
      'X-Requested-With': 'XMLHttpRequest',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ visitorId: getVisitorId(), events }),
  }).catch(() => {})
}

function enqueue(event: SiteEvent) {
  if (import.meta.env.MODE === 'test') return
  queue.push(event)
  if (queue.length >= MAX_QUEUE) flush()
  else if (!flushTimer) flushTimer = setTimeout(flush, FLUSH_DELAY_MS)
}

/** Record a page view. The first view of a visit carries the external referrer. */
export function trackPageView(path: string) {
  if (!isTrackedPath(path)) return
  enqueue({ type: 'view', path, referrer: firstView ? document.referrer : undefined })
  firstView = false
}

/** A short, readable name for what was clicked, or null to skip it. */
export function clickLabel(element: Element): string | null {
  const marked = element.closest('[data-track]')
  if (marked) return marked.getAttribute('data-track')?.trim().slice(0, LABEL_MAX) || null

  const anchor = element.closest('a[href]') as HTMLAnchorElement | null
  if (anchor) {
    try {
      const url = new URL(anchor.href, location.href)
      if (url.protocol === 'mailto:') return 'mailto'
      if (url.origin !== location.origin) return `out:${url.hostname.replace(/^www\./, '')}`
      return `link:${url.pathname}`
    } catch {
      return null
    }
  }

  const button = element.closest('button, [role="button"], [role="tab"]')
  if (button) {
    const text = (button.getAttribute('aria-label') || button.textContent || '')
      .replace(/\s+/g, ' ')
      .trim()
    return text ? `button:${text.slice(0, LABEL_MAX)}` : null
  }
  return null
}

function onClick(event: MouseEvent) {
  const element = event.target as Element | null
  if (!element?.closest || element.closest('[data-no-track]')) return
  if (!isTrackedPath(location.pathname)) return
  const target = clickLabel(element)
  if (target) enqueue({ type: 'click', path: location.pathname, target })
}

/** Start the click listener and flush on tab hide. Call once at startup. */
export function startMetrics() {
  if (typeof document === 'undefined') return
  document.addEventListener('click', onClick, { capture: true, passive: true })
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flush()
  })
  window.addEventListener('pagehide', flush)
}
