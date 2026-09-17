/**
 * geminiChat.js — Chat history, tool-call parsing, and grounded fallback copy.
 *
 * Utils layer: Gemini-request helpers with no SDK or Mongo dependency so they
 * can be unit-tested. The model must only name titles returned by catalog tools.
 */

import { recommendationWhy } from './recommendationWhy.js'

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
    "You are AniLounge's assistant for animated movies, series, animation studios, voice actors, and genres.",
    'Stay on those topics. Decline news, weather, politics, live-action celebrities, sports, and other unrelated questions.',
    'You must call search_catalog or get_title_details before naming any title.',
    'Only recommend titles those tools return. Never invent titles, scores, studios, air dates, or voice-actor credits.',
    'When recommending, pick the strongest catalog matches instead of dumping every hit.',
    'Rank picks by this hierarchy: matching genres first, then animation studios, then high ratings, then other catalog facts such as airing status or origin.',
    'Never prefer a higher-rated title over a better genre match. When genres are equal, never prefer a higher-rated title over a better studio match.',
    'Do not set minRating unless the user asked for highly rated or top titles.',
    'Each recommended title already includes a `why` field from the catalog — use it or refine it. Do not recommend a title without saying why.',
    'lookup_public_info is optional encyclopedia background for a catalog title, studio, voice actor, or genre. It is not a general web search.',
    'Never recommend a title because Wikipedia mentioned it. Confirm titles with search_catalog.',
    'Catalog scores, studios, air dates, and whether a title exists always win over web text.',
    'If the catalog is empty, say so and suggest a different genre, studio, country, or title.',
    'Write a one-sentence overview, then one short reason per pick (about 3-5 titles). The app also shows poster cards.',
    'Prefer genre and studio facts over ratings, and prefer specific catalog facts over generic hype.',
  ]

  if (userContext) {
    const genres = (userContext.favoriteGenres || []).filter(Boolean)
    const studios = (userContext.favoriteStudios || []).filter(Boolean)
    const watchlist = (userContext.watchlist || []).slice(0, 15)
    if (genres.length) {
      lines.push(`Favorite genres: ${genres.join(', ')}. Prefer titles in these genres when recommending.`)
    }
    if (studios.length) {
      lines.push(
        `Favorite studios: ${studios.join(', ')}. Use studio match after genre and before ratings.`,
      )
    }
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
  const picks = results.slice(0, 4)
  const lines = picks.map((doc) => {
    const name = doc.englishTitle || doc.title
    const why = doc.why || recommendationWhy(doc)
    return `• ${name}: ${why}`
  })
  if (picks.length === 1) {
    const name = picks[0].englishTitle || picks[0].title
    const why = picks[0].why || recommendationWhy(picks[0])
    return `I'd recommend ${name} because ${why}.`
  }
  return `Here are catalog picks and why they fit:\n${lines.join('\n')}`
}
