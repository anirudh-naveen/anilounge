/**
 * ratingColors.ts — rating color helpers.
 *
 * Maps 0–10 scores onto a red → yellow → green gradient for badges and text.
 */

/**
 * RGB gradient color for a 0–10 rating (red at 0, yellow at 5, green at 10).
 * @param rating - Score on a 0–10 scale.
 * @returns CSS `rgb()` color, or red when missing/zero.
 */
export const getRatingColor = (rating: number | null | undefined): string => {
  if (!rating || rating === 0) {
    return '#ff4444'
  }

  const clampedRating = Math.max(0, Math.min(10, rating))
  const normalizedRating = clampedRating / 10

  if (normalizedRating <= 0.5) {
    const intensity = normalizedRating * 2
    const red = 255
    const green = Math.round(255 * intensity)
    const blue = 0
    return `rgb(${red}, ${green}, ${blue})`
  } else {
    const intensity = (normalizedRating - 0.5) * 2
    const red = Math.round(255 * (1 - intensity))
    const green = 255
    const blue = 0
    return `rgb(${red}, ${green}, ${blue})`
  }
}

/**
 * HSL color for rating text: hue 0° (red) through 120° (green).
 * @param rating - Score on a 0–10 scale.
 * @returns CSS `hsl()` color, or bright red when missing/zero.
 */
export const getRatingColorHSL = (rating: number | null | undefined): string => {
  if (!rating || rating === 0) {
    return 'hsl(0, 100%, 50%)'
  }

  const clampedRating = Math.max(0, Math.min(10, rating))
  const normalizedRating = clampedRating / 10

  const hue = normalizedRating * 120
  const saturation = 100
  const lightness = 50

  return `hsl(${hue}, ${saturation}%, ${lightness}%)`
}

/**
 * Darker HSL color for rating badge backgrounds (lower saturation/lightness).
 * @param rating - Score on a 0–10 scale.
 * @param alpha - Optional opacity from 0–1.
 * @returns CSS `hsla()` color, or darker red when missing/zero.
 */
export const getRatingColorHSLBackground = (
  rating: number | null | undefined,
  alpha = 1,
): string => {
  if (!rating || rating === 0) {
    return `hsla(0, 70%, 40%, ${alpha})`
  }

  const clampedRating = Math.max(0, Math.min(10, rating))
  const normalizedRating = clampedRating / 10

  const hue = normalizedRating * 120
  const saturation = 70
  const lightness = 40

  return `hsla(${hue}, ${saturation}%, ${lightness}%, ${alpha})`
}

/**
 * Inline styles for a rating badge (colored background, white bold text).
 * @param rating - Score on a 0–10 scale.
 * @returns Style object for a rating label.
 */
export const getRatingTextStyle = (rating: number | null | undefined) => {
  const color = getRatingColorHSLBackground(rating)
  return {
    backgroundColor: color,
    color: 'white',
    fontWeight: 'bold',
    borderRadius: '4px',
  }
}

/**
 * 1–10 CSS gradient using the same HSL badge colors as content preview ratings.
 * @param alpha - Optional opacity for unselected slider tracks.
 */
export const getRatingScaleGradient = (alpha = 1): string => {
  const stops = Array.from({ length: 10 }, (_, index) => {
    const rating = index + 1
    const position = (index / 9) * 100
    return `${getRatingColorHSLBackground(rating, alpha)} ${position}%`
  })
  return `linear-gradient(90deg, ${stops.join(', ')})`
}
