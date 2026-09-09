/**
 * Vote-count weighted average of MAL, TMDB, and Find Animation ratings.
 * Sources without a score or with zero voters are omitted from the average.
 */
export function calculateUnifiedScore(
  tmdbScore,
  tmdbVotes,
  malScore,
  malVotes,
  userRatingAverage,
  userRatingCount,
) {
  const sources = []

  if (isValidScore(tmdbScore) && hasVotes(tmdbVotes)) {
    sources.push({ score: Number(tmdbScore), votes: Number(tmdbVotes) })
  }
  if (isValidScore(malScore) && hasVotes(malVotes)) {
    sources.push({ score: Number(malScore), votes: Number(malVotes) })
  }
  if (isValidScore(userRatingAverage) && hasVotes(userRatingCount)) {
    sources.push({ score: Number(userRatingAverage), votes: Number(userRatingCount) })
  }

  if (sources.length === 0) {
    if (isValidScore(malScore)) return Number(malScore)
    if (isValidScore(tmdbScore)) return Number(tmdbScore)
    if (isValidScore(userRatingAverage)) return Number(userRatingAverage)
    return null
  }

  const totalVotes = sources.reduce((sum, source) => sum + source.votes, 0)
  if (totalVotes === 0) {
    return sources.reduce((sum, source) => sum + source.score, 0) / sources.length
  }

  const weightedSum = sources.reduce((sum, source) => sum + source.score * source.votes, 0)
  return weightedSum / totalVotes
}

export function isValidUserRating(rating) {
  return typeof rating === 'number' && Number.isFinite(rating) && rating >= 1 && rating <= 10
}

/**
 * O(1) update of Find Animation rating stats on a content document.
 * oldRating/newRating are this user's previous and next scores (or null if none).
 * Stores a running sum so we never rescan all users on each change.
 */
export function applyUserRatingDelta(content, oldRating, newRating) {
  const previous = isValidUserRating(oldRating) ? oldRating : null
  const next = isValidUserRating(newRating) ? newRating : null

  if (previous === next) {
    refreshUnifiedScore(content)
    return
  }

  let count = Number(content.userRatingCount) || 0
  let sum = Number(content.userRatingSum)
  if (!Number.isFinite(sum)) {
    sum = (Number(content.userRatingAverage) || 0) * count
  }

  if (previous != null) {
    sum -= previous
    count -= 1
  }
  if (next != null) {
    sum += next
    count += 1
  }

  if (count <= 0) {
    content.userRatingCount = 0
    content.userRatingSum = 0
    content.userRatingAverage = null
  } else {
    content.userRatingCount = count
    content.userRatingSum = sum
    content.userRatingAverage = sum / count
  }

  refreshUnifiedScore(content)
}

function refreshUnifiedScore(content) {
  content.unifiedScore = calculateUnifiedScore(
    content.voteAverage,
    content.voteCount,
    content.malScore,
    content.malScoredBy,
    content.userRatingAverage,
    content.userRatingCount,
  )
}

function isValidScore(score) {
  return typeof score === 'number' && Number.isFinite(score) && score > 0
}

function hasVotes(count) {
  return typeof count === 'number' && Number.isFinite(count) && count > 0
}
