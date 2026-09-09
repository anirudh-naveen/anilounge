export interface ContentRatingFields {
  voteAverage?: number | null
  voteCount?: number | null
  malScore?: number | null
  malScoredBy?: number | null
  userRatingAverage?: number | null
  userRatingCount?: number | null
  unifiedScore?: number | null
}

interface RatingContribution {
  score: number
  count: number
}

function isValidScore(score: number | null | undefined): score is number {
  return typeof score === 'number' && Number.isFinite(score) && score > 0
}

function toCount(count: number | null | undefined): number {
  return typeof count === 'number' && Number.isFinite(count) && count > 0 ? count : 0
}

function getContributions(content: ContentRatingFields): RatingContribution[] {
  const contributions: RatingContribution[] = []
  const sources: Array<[number | null | undefined, number | null | undefined]> = [
    [content.malScore, content.malScoredBy],
    [content.voteAverage, content.voteCount],
    [content.userRatingAverage, content.userRatingCount],
  ]

  for (const [score, count] of sources) {
    if (isValidScore(score) && toCount(count) > 0) {
      contributions.push({ score, count: toCount(count) })
    }
  }

  return contributions
}

export function getWeightedAverage(content: ContentRatingFields): number | null {
  const contributions = getContributions(content)
  if (contributions.length === 0) {
    return isValidScore(content.unifiedScore) ? content.unifiedScore : null
  }

  const totalVotes = contributions.reduce((sum, source) => sum + source.count, 0)
  return contributions.reduce((sum, source) => sum + source.score * source.count, 0) / totalVotes
}

export function getTotalVoteCount(content: ContentRatingFields): number {
  return getContributions(content).reduce((sum, source) => sum + source.count, 0)
}

export function displayedRating(score: number | null | undefined): number {
  if (!isValidScore(score)) return 0
  return Number(score.toFixed(1))
}

export function ratingMatchesFilter(
  content: ContentRatingFields,
  min: number,
  max: number,
): boolean {
  const average = getWeightedAverage(content)
  if (average == null) return false
  const shown = displayedRating(average)
  return shown >= min && shown <= max
}
