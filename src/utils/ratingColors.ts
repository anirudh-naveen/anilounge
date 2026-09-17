/**
 * ratingColors.ts — rating color helpers.
 *
 * Maps 0–10 scores onto the Search slider palette: red (#ef4444) at 0,
 * yellow (#facc15) at 5, green (#22c55e) at 10.
 */

const RATING_RED = { r: 239, g: 68, b: 68 }
const RATING_YELLOW = { r: 250, g: 204, b: 21 }
const RATING_GREEN = { r: 34, g: 197, b: 94 }

type Rgb = { r: number; g: number; b: number }

const mixRgb = (from: Rgb, to: Rgb, t: number): Rgb => ({
  r: Math.round(from.r + (to.r - from.r) * t),
  g: Math.round(from.g + (to.g - from.g) * t),
  b: Math.round(from.b + (to.b - from.b) * t),
})

const toCss = ({ r, g, b }: Rgb): string => `rgb(${r}, ${g}, ${b})`

const ratingRgb = (rating: number | null | undefined): Rgb => {
  if (!rating || rating === 0) {
    return RATING_RED
  }

  const clampedRating = Math.max(0, Math.min(10, rating))
  if (clampedRating <= 5) {
    return mixRgb(RATING_RED, RATING_YELLOW, clampedRating / 5)
  }
  return mixRgb(RATING_YELLOW, RATING_GREEN, (clampedRating - 5) / 5)
}

/**
 * RGB gradient color for a 0–10 rating (red at 0, yellow at 5, green at 10).
 * @param rating - Score on a 0–10 scale.
 * @returns CSS `rgb()` color, or red when missing/zero.
 */
export const getRatingColor = (rating: number | null | undefined): string => {
  return toCss(ratingRgb(rating))
}

/**
 * Same slider palette, used for rating text on light backgrounds.
 * @param rating - Score on a 0–10 scale.
 * @returns CSS `rgb()` color, or red when missing/zero.
 */
export const getRatingColorHSL = (rating: number | null | undefined): string => {
  return getRatingColor(rating)
}

/**
 * Same slider palette, used for rating badge backgrounds.
 * @param rating - Score on a 0–10 scale.
 * @returns CSS `rgb()` color, or red when missing/zero.
 */
export const getRatingColorHSLBackground = (rating: number | null | undefined): string => {
  return getRatingColor(rating)
}

/**
 * Inline styles for a rating badge (colored background, contrast text).
 * @param rating - Score on a 0–10 scale.
 * @returns Style object for a rating label.
 */
export const getRatingTextStyle = (rating: number | null | undefined) => {
  const { r, g, b } = ratingRgb(rating)
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255
  return {
    backgroundColor: toCss({ r, g, b }),
    color: luminance > 0.6 ? '#152238' : '#fff',
    fontWeight: 'bold',
    borderRadius: '4px',
  }
}
