export function normalizeTitle(value) {
  if (typeof value !== 'string') return ''
  return value.trim()
}

export function titlesEqual(left, right) {
  const a = normalizeTitle(left).toLowerCase()
  const b = normalizeTitle(right).toLowerCase()
  return Boolean(a) && a === b
}

export function uniqueTitles(...groups) {
  const seen = new Set()
  const result = []

  for (const group of groups) {
    const values = Array.isArray(group) ? group : [group]
    for (const value of values) {
      const title = normalizeTitle(value)
      if (!title) continue
      const key = title.toLowerCase()
      if (seen.has(key)) continue
      seen.add(key)
      result.push(title)
    }
  }

  return result
}

export function collectContentTitles(content = {}) {
  return uniqueTitles(
    content.englishTitle,
    content.title,
    content.nativeTitle,
    content.originalTitle,
    content.alternativeTitles,
  )
}

export function buildTitleFields({
  englishTitle,
  nativeTitle,
  fallbackTitle,
  alternativeTitles = [],
} = {}) {
  const english = normalizeTitle(englishTitle)
  const native = normalizeTitle(nativeTitle)
  const fallback = normalizeTitle(fallbackTitle)
  const title = english || fallback || native
  const alternatives = uniqueTitles(fallback, alternativeTitles).filter(
    (candidate) =>
      !titlesEqual(candidate, title) &&
      !titlesEqual(candidate, english) &&
      !titlesEqual(candidate, native),
  )

  return {
    title: title || 'Unknown Title',
    englishTitle: english || undefined,
    nativeTitle: native || undefined,
    originalTitle: native || undefined,
    alternativeTitles: alternatives,
  }
}

export function applyTitleFields(existing = {}, incoming = {}, options = {}) {
  const preferIncomingEnglish = options.preferIncomingEnglish === true
  const preferIncomingNative = options.preferIncomingNative === true

  const englishTitle = preferIncomingEnglish
    ? incoming.englishTitle || existing.englishTitle
    : existing.englishTitle || incoming.englishTitle
  const nativeTitle = preferIncomingNative
    ? incoming.nativeTitle || existing.nativeTitle
    : existing.nativeTitle || incoming.nativeTitle

  return buildTitleFields({
    englishTitle,
    nativeTitle,
    fallbackTitle: englishTitle || existing.title || incoming.title,
    alternativeTitles: [
      existing.title,
      incoming.title,
      existing.englishTitle,
      incoming.englishTitle,
      existing.nativeTitle,
      incoming.nativeTitle,
      existing.originalTitle,
      incoming.originalTitle,
      ...(existing.alternativeTitles || []),
      ...(incoming.alternativeTitles || []),
    ],
  })
}

export function contentTitleMatchOr(matcher) {
  return [
    { title: matcher },
    { englishTitle: matcher },
    { nativeTitle: matcher },
    { originalTitle: matcher },
    { alternativeTitles: matcher },
  ]
}
