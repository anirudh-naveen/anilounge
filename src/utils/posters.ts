/**
 * posters.ts — the poster placeholder and the `<img>` error fallback that uses it.
 */

/** Shown when a title has no poster or its poster fails to load. */
export const POSTER_PLACEHOLDER = '/placeholder-poster.svg'

/**
 * `@error` handler for poster images: swap in the placeholder once. If the placeholder
 * itself fails, it stops there instead of re-triggering `error` forever.
 * @param event - The image's error event.
 */
export function showPosterPlaceholder(event: Event) {
  const img = event.target as HTMLImageElement | null
  if (!img || img.dataset.fallback) return
  img.dataset.fallback = 'true'
  img.src = POSTER_PLACEHOLDER
}
