/**
 * geminiChat.js — Chat history, tool-call parsing, and grounded fallback copy.
 *
 * Utils layer: Gemini-request helpers with no SDK or Mongo dependency so they
 * can be unit-tested. The model must only name titles returned by catalog tools.
 */

/**
 * Convert UI/API chat turns into Gemini `startChat` history.
 * Drops leading model turns (Gemini requires user-first history).
 * @param {unknown} history
 * @returns {Array<{ role: 'user'|'model', parts: Array<{ text: string }> }>}
 */
export function toGeminiHistory(history) {
  const mapped = (Array.isArray(history) ? history : [])
    .slice(-12)
    .map((turn) => {
      if (!turn || typeof turn !== 'object') return null
      const role = turn.role === 'user' ? 'user' : 'model'
      const text = String(turn.text || '').trim().slice(0, 2000)
      return text ? { role, parts: [{ text }] } : null
    })
    .filter(Boolean)

  while (mapped.length && mapped[0].role !== 'user') {
    mapped.shift()
  }
  return mapped
}

/**
 * Read function calls from a Gemini generateContent response.
 * @param {object} [response]
 * @returns {Array<{ name: string, args: object }>}
 */
export function getFunctionCalls(response) {
  if (!response) return []
  if (typeof response.functionCalls === 'function') {
    const calls = response.functionCalls() || []
    if (calls.length) {
      return calls.map((call) => ({
        name: call.name,
        args: call.args || {},
      }))
    }
  }
  const parts = response.candidates?.[0]?.content?.parts || []
  return parts
    .filter((part) => part.functionCall?.name)
    .map((part) => ({
      name: part.functionCall.name,
      args: part.functionCall.args || {},
    }))
}

/**
 * Safe text extraction when a response is mixed function-call / text.
 * @param {object} [response]
 * @returns {string}
 */
export function getResponseText(response) {
  if (!response) return ''
  try {
    if (typeof response.text === 'function') {
      return String(response.text() || '').trim()
    }
  } catch {
    // function-call-only responses throw from text()
  }
  const parts = response.candidates?.[0]?.content?.parts || []
  return parts
    .map((part) => part.text)
    .filter(Boolean)
    .join('\n')
    .trim()
}

/**
 * System instruction that forces catalog grounding and optional personalization.
 * @param {object|null} [userContext]
 * @returns {string}
 */
export function buildSystemInstruction(userContext) {
  const lines = [
    "You are AniLounge's assistant for finding animated movies, series, and specials.",
    'You must call search_catalog or get_title_details before naming any title.',
    'Only recommend titles those tools return. Never invent titles, scores, studios, or air dates.',
    'If the catalog is empty, say so and suggest a different genre, studio, country, or title.',
    'Keep replies to 2-4 sentences. The app shows poster cards for the returned titles.',
    'Prefer specific catalog facts (rating, studio, airing status, origin) over generic hype.',
  ]

  if (userContext) {
    const genres = (userContext.favoriteGenres || []).filter(Boolean)
    const studios = (userContext.favoriteStudios || []).filter(Boolean)
    const watchlist = (userContext.watchlist || []).slice(0, 15)
    if (genres.length) lines.push(`Favorite genres: ${genres.join(', ')}.`)
    if (studios.length) lines.push(`Favorite studios: ${studios.join(', ')}.`)
    if (watchlist.length) {
      lines.push(
        `Watchlist: ${watchlist
          .map((item) => `${item.title} (${item.status})`)
          .join('; ')}. Do not recommend completed or dropped titles unless asked.`,
      )
    }
  }

  return lines.join(' ')
}

/**
 * Reply used when Gemini is unavailable or returns no text.
 * @param {object[]} results
 * @returns {string}
 */
export function fallbackChatReply(results) {
  if (!results?.length) {
    return "I couldn't find matching titles in the AniLounge catalog. Try a different genre, studio, country, or title."
  }
  const names = results
    .slice(0, 5)
    .map((doc) => doc.englishTitle || doc.title)
    .filter(Boolean)
    .join(', ')
  return `Here are titles from the catalog that match that: ${names}.`
}
