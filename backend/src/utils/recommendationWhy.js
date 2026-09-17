/**
 * recommendationWhy.js — Short catalog-grounded reasons for chat picks.
 *
 * Utils layer: turn Mongo fields plus the user's filters into a clause the
 * assistant can cite. Never invents titles; only describes the given row.
 */

import {
  catalogGenreNames,
  catalogRatingScore,
  catalogStudioNames,
  resolveRecommendationContext,
} from './recommendationRank.js'

function matchedFavoriteGenre(genres, context = {}) {
  const favorites = (context.favoriteGenres || []).map((name) => String(name).toLowerCase())
  return genres.find((genre) => favorites.includes(genre.toLowerCase()))
}

function matchedFavoriteStudio(studios, context = {}) {
  const favorites = (context.favoriteStudios || []).map((name) => String(name).toLowerCase())
  return studios.find((studio) =>
    favorites.some((favorite) => studio.toLowerCase().includes(favorite) || favorite.includes(studio.toLowerCase())),
  )
}

/**
 * One-line reason a catalog row was picked for a chat request.
 * Reasons follow the chat ranking hierarchy: genre, studio, then rating.
 * @param {object} doc
 * @param {object} [context]
 * @returns {string}
 */
export function recommendationWhy(doc, context = {}) {
  if (!doc) return ''
  const reasons = []
  const genres = catalogGenreNames(doc)
  const studios = catalogStudioNames(doc)
  const askedGenre = String(context.genre || '').trim()
  const askedStudio = String(context.studio || '').trim()
  const similarTo = String(context.similarTo || '').trim()
  const query = String(context.query || context.lookupTitle || '').trim()

  if (similarTo) reasons.push(`shares genres with ${similarTo}`)

  if (askedGenre && genres.some((genre) => genre.toLowerCase() === askedGenre.toLowerCase())) {
    reasons.push(`matches the ${askedGenre} genre you asked for`)
  } else {
    const favoriteGenre = matchedFavoriteGenre(genres, context)
    if (favoriteGenre) {
      reasons.push(`matches your ${favoriteGenre} taste`)
    } else if (genres.length && !similarTo) {
      reasons.push(`${genres.slice(0, 2).join(' and ')}`)
    }
  }

  if (askedStudio) {
    const studio = studios.find((name) => name.toLowerCase().includes(askedStudio.toLowerCase()))
    if (studio) reasons.push(`from ${studio}`)
  } else {
    const favoriteStudio = matchedFavoriteStudio(studios, context)
    if (favoriteStudio) {
      reasons.push(`from ${favoriteStudio}`)
    } else if (studios[0]) {
      reasons.push(`from ${studios[0]}`)
    }
  }

  const score = catalogRatingScore(doc)
  if (score != null && score >= 7.5) {
    reasons.push(`strongly rated (${score.toFixed(1)})`)
  }

  if (doc.malStatus === 'currently_airing') {
    reasons.push('currently airing')
  } else if (doc.malStatus === 'not_yet_aired') {
    reasons.push('upcoming')
  }

  if (query && !askedGenre && !askedStudio && !similarTo) {
    reasons.push('title/overview match for your search')
  }

  const unique = [...new Set(reasons)].slice(0, 3)
  return unique.join(', ') || 'A catalog match for your request'
}

/**
 * Attach `why` onto catalog rows using the active chat filters.
 * @param {object[]} docs
 * @param {object} [context]
 * @returns {object[]}
 */
export function withRecommendationWhy(docs, context = {}) {
  const resolved = resolveRecommendationContext(docs, context)
  return (docs || []).map((doc) => ({
    ...doc,
    why: doc.why || recommendationWhy(doc, resolved),
  }))
}
