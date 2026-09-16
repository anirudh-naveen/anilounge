/**
 * ratings.ts — rating aggregation helpers.
 *
 * Combines MAL, TMDB, and Find Animation scores into a vote-weighted average
 * used by catalog filters, sort, and rating badges.
 */

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

/**
 * Vote-weighted average of MAL, TMDB, and user ratings.
 * Falls back to `unifiedScore` when no source has both a score and a vote count.
 * @param content - Rating fields from a catalog item.
 * @returns Weighted average, or `null` if no usable score exists.
 */
export function getWeightedAverage(content: ContentRatingFields): number | null {
  const contributions = getContributions(content)
  if (contributions.length === 0) {
    return isValidScore(content.unifiedScore) ? content.unifiedScore : null
  }

  const totalVotes = contributions.reduce((sum, source) => sum + source.count, 0)
  return contributions.reduce((sum, source) => sum + source.score * source.count, 0) / totalVotes
}

/**
 * Sum of vote counts from sources that also have a valid score.
 * @param content - Rating fields from a catalog item.
 * @returns Combined voter count across MAL, TMDB, and Find Animation.
 */
export function getTotalVoteCount(content: ContentRatingFields): number {
  return getContributions(content).reduce((sum, source) => sum + source.count, 0)
}

/**
 * Score shown in the UI, rounded to one decimal place.
 * @param score - Raw average or unified score.
 * @returns Rounded score, or `0` when missing/invalid.
 */
export function displayedRating(score: number | null | undefined): number {
  if (!isValidScore(score)) return 0
  return Number(score.toFixed(1))
}

/**
 * Whether the displayed (rounded) rating falls in the filter range.
 * Uses the rounded value so a 7.96 shown as 8.0 is not treated as 7.x.
 * @param content - Rating fields from a catalog item.
 * @param min - Inclusive lower bound of the filter (0–10).
 * @param max - Inclusive upper bound of the filter (0–10).
 * @returns True when the shown rating is inside `[min, max]`.
 */
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
