/**
 * personalRecommendations.js — Rank "Recommended for you" picks from a user's ratings.
 *
 * Utils layer: services/recommendationService.js gathers, for each title the user rated
 * highly (a seed), the community links to titles they haven't touched. This adds them
 * up: a pick ranks higher the more seeds point to it, the higher those seeds are rated,
 * and the stronger each link. No single seed may fill more than a third of the picks.
 */

/** Ratings a user needs before picks are any good. */
export const MIN_RATED = 5
/** Ratings at or above this are seeds. */
export const SEED_RATING = 7.5
/** Harsh raters (fewer than MIN_RATED seeds) use their this-many best ratings instead. */
export const FALLBACK_SEEDS = 10
/** Catalog score's share of a pick's score: enough to break ties, not to outrank a link. */
const QUALITY_WEIGHT = 0.05

/**
 * Lowest rating that counts as a seed: SEED_RATING, or for users with fewer than
 * MIN_RATED ratings that high, their FALLBACK_SEEDS-th best rating.
 * @param {number[]} scores - The user's ratings
 * @returns {number | null} null when the user has fewer than MIN_RATED ratings
 */
export function seedThreshold(scores) {
  const sorted = (scores || [])
    .map(Number)
    .filter(Number.isFinite)
    .sort((a, b) => b - a)
  if (sorted.length < MIN_RATED) return null
  if (sorted.filter((score) => score >= SEED_RATING).length >= MIN_RATED) return SEED_RATING
  return sorted[Math.min(FALLBACK_SEEDS, sorted.length) - 1]
}

/**
 * How much a seed's links count: 1 at 7.5, 2.5 at 9, 3.5 at 10 (never below 0.5,
 * for a harsh rater's fallback seeds).
 * @param {number} rating
 * @returns {number}
 */
export function seedWeight(rating) {
  return Math.max(0.5, Number(rating) - 6.5)
}

/**
 * Rank picks from seed → target links.
 * @param {{ seedId: string, seedRating: number, targetId: string, weight: number,
 *   targetScore?: number | null }[]} links - One row per seed and target
 * @param {{ limit?: number }} [options]
 * @returns {{ id: string, score: number,
 *   because: { seedId: string, rating: number }[] }[]} Best first; `because` strongest first
 */
export function rankRecommendations(links, { limit = 20 } = {}) {
  const targets = new Map()
  for (const link of links || []) {
    const weight = Number(link.weight)
    if (!link.targetId || !(weight > 0)) continue
    let target = targets.get(link.targetId)
    if (!target) {
      const quality = Number(link.targetScore)
      target = {
        id: link.targetId,
        score: Number.isFinite(quality) && quality > 0 ? (quality / 10) * QUALITY_WEIGHT : 0,
        because: [],
      }
      targets.set(link.targetId, target)
    }
    const contribution = seedWeight(link.seedRating) * weight
    target.score += contribution
    target.because.push({ seedId: link.seedId, rating: Number(link.seedRating), contribution })
  }

  const ranked = [...targets.values()].sort((a, b) => b.score - a.score || (a.id < b.id ? -1 : 1))
  for (const target of ranked) target.because.sort((a, b) => b.contribution - a.contribution)

  // One seed's picks fill at most a third of the list; the rest follow if picks run short.
  const cap = Math.max(2, Math.ceil(limit / 3))
  const perSeed = new Map()
  const picked = []
  const held = []
  for (const target of ranked) {
    const lead = target.because[0].seedId
    const count = perSeed.get(lead) || 0
    if (count >= cap) {
      held.push(target)
      continue
    }
    perSeed.set(lead, count + 1)
    picked.push(target)
    if (picked.length >= limit) break
  }
  return [...picked, ...held].slice(0, limit).map(({ id, score, because }) => ({
    id,
    score: Math.round(score * 1000) / 1000,
    because: because.map(({ seedId, rating }) => ({ seedId, rating })),
  }))
}

function formatRating(rating) {
  return Number.isInteger(rating) ? String(rating) : rating.toFixed(1)
}

/**
 * "Because you rated Frieren 9/10", plus "and 2 more" when other seeds point there too.
 * @param {{ title: string, rating: number }[]} because - Strongest first
 * @returns {string}
 */
export function becauseText(because) {
  const [first, ...rest] = (because || []).filter((seed) => seed?.title)
  if (!first) return ''
  const more = rest.length ? ` and ${rest.length} more` : ''
  return `Because you rated ${first.title} ${formatRating(first.rating)}/10${more}`
}
