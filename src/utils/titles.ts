export interface TitledContent {
  title?: string
  englishTitle?: string
  nativeTitle?: string
  originalTitle?: string
  alternativeTitles?: string[]
}

const normalize = (value?: string | null) => (typeof value === 'string' ? value.trim() : '')

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

export function getNativeTitle(content?: TitledContent | null) {
  if (!content) return ''
  const native = normalize(content.nativeTitle) || normalize(content.originalTitle)
  const display = getDisplayTitle(content)
  if (!native || native.toLowerCase() === display.toLowerCase()) return ''
  return native
}

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

export function getAlternativeTitles(content?: TitledContent | null) {
  if (!content) return []

  const excluded = new Set(
    [getDisplayTitle(content), content.englishTitle, content.nativeTitle, content.originalTitle]
      .map((value) => normalize(value))
      .filter(Boolean)
      .map((value) => value.toLowerCase()),
  )

  return (content.alternativeTitles || []).filter((title) => {
    const normalized = normalize(title)
    return Boolean(normalized) && !excluded.has(normalized.toLowerCase())
  })
}
