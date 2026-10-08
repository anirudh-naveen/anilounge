/**
 * titles.ts — title-resolution helpers.
 *
 * Picks English vs native display names, builds searchable title lists, and
 * filters leftover alternative titles. Detail views show English + native only;
 * alternatives stay searchable.
 */

export interface TitledContent {
  title?: string
  englishTitle?: string
  nativeTitle?: string
  originalTitle?: string
  alternativeTitles?: string[]
}

const normalize = (value?: string | null) => (typeof value === 'string' ? value.trim() : '')

/**
 * Resolves the title shown on cards and detail views, preferring English.
 * @param content - Title fields from a catalog item (or null).
 * @returns English, default, native, or original title; `"Unknown Title"` if none.
 */
export function getDisplayTitle(content?: TitledContent | null) {
  if (!content) return 'Unknown Title'
  return (
    normalize(content.englishTitle) ||
    normalize(content.title) ||
    normalize(content.nativeTitle) ||
    normalize(content.originalTitle) ||
    'Unknown Title'
  )
}

/**
 * Native/original title for secondary display when it differs from the English title.
 * @param content - Title fields from a catalog item (or null).
 * @returns Native title, or `""` if missing or identical to the display title.
 */
export function getNativeTitle(content?: TitledContent | null) {
  if (!content) return ''
  const native = normalize(content.nativeTitle) || normalize(content.originalTitle)
  const display = getDisplayTitle(content)
  if (!native || native.toLowerCase() === display.toLowerCase()) return ''
  return native
}

/**
 * Deduplicated title list used by client-side search matching.
 * @param content - Title fields from a catalog item (or null).
 * @returns Unique titles including alternatives, in source order.
 */
export function getSearchableTitles(content?: TitledContent | null) {
  if (!content) return []

  const seen = new Set<string>()
  const titles: string[] = []
  const values = [
    content.englishTitle,
    content.title,
    content.nativeTitle,
    content.originalTitle,
    ...(content.alternativeTitles || []),
  ]

  for (const value of values) {
    const title = normalize(value)
    if (!title) continue
    const key = title.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    titles.push(title)
  }

  return titles
}
