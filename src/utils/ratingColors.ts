// Utility function to get rating color based on score (0-10 scale)
export const getRatingColor = (rating: number | null | undefined): string => {
  if (!rating || rating === 0) {
    return '#ff4444' // Red for 0 or no rating
  }

  // Clamp rating between 0 and 10
  const clampedRating = Math.max(0, Math.min(10, rating))

  // Convert to 0-1 scale
  const normalizedRating = clampedRating / 10

  // Create color gradient from red (0) -> yellow (0.5) -> green (1)
  if (normalizedRating <= 0.5) {
    // Red to Yellow (0 to 0.5)
    const intensity = normalizedRating * 2 // 0 to 1
    const red = 255
    const green = Math.round(255 * intensity)
    const blue = 0
    return `rgb(${red}, ${green}, ${blue})`
  } else {
    // Yellow to Green (0.5 to 1)
    const intensity = (normalizedRating - 0.5) * 2 // 0 to 1
    const red = Math.round(255 * (1 - intensity))
    const green = 255
    const blue = 0
    return `rgb(${red}, ${green}, ${blue})`
  }
}

// Brighter HSL-based approach for text colors
export const getRatingColorHSL = (rating: number | null | undefined): string => {
  if (!rating || rating === 0) {
    return 'hsl(0, 100%, 50%)' // Bright red for 0 or no rating
  }

  // Clamp rating between 0 and 10
  const clampedRating = Math.max(0, Math.min(10, rating))

  // Convert to 0-1 scale
  const normalizedRating = clampedRating / 10

  // HSL: Red (0°) -> Yellow (60°) -> Green (120°)
  const hue = normalizedRating * 120 // 0 to 120 degrees
  const saturation = 100 // Full saturation for bright colors
  const lightness = 50 // Medium lightness for bright colors

  return `hsl(${hue}, ${saturation}%, ${lightness}%)`
}

// Darker HSL-based approach for background colors
export const getRatingColorHSLBackground = (rating: number | null | undefined): string => {
  if (!rating || rating === 0) {
    return 'hsl(0, 70%, 40%)' // Darker red for 0 or no rating
  }

  // Clamp rating between 0 and 10
  const clampedRating = Math.max(0, Math.min(10, rating))

  // Convert to 0-1 scale
  const normalizedRating = clampedRating / 10

  // HSL: Red (0°) -> Yellow (60°) -> Green (120°)
  const hue = normalizedRating * 120 // 0 to 120 degrees
  const saturation = 70 // Reduced saturation for less brightness
  const lightness = 40 // Reduced lightness for darker colors

  return `hsl(${hue}, ${saturation}%, ${lightness}%)`
}

// Get rating text style with deep purple outline
export const getRatingTextStyle = (rating: number | null | undefined) => {
  const color = getRatingColorHSLBackground(rating)
  return {
    backgroundColor: color,
    color: 'white',
    fontWeight: 'bold',
    borderRadius: '4px',
  }
}
