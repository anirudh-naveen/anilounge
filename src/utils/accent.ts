/**
 * accent.ts — profile accent colors: the presets plus custom `#rrggbb` colors from
 * the color wheel, and a readable text color to put on top of an accent.
 */

import type { ProfileAccent, ProfilePresetAccent } from '@/types/profile'

export const ACCENT_PRESETS: Record<ProfilePresetAccent, string> = {
  coral: '#e07a5f',
  teal: '#2bbbad',
  violet: '#7b6bb0',
  gold: '#e8a317',
  rose: '#d9577a',
  sky: '#3d8bd9',
}

const HEX = /^#[0-9a-f]{6}$/i

/** True for a custom color-wheel accent rather than a preset. */
export const isCustomAccent = (accent: unknown): accent is `#${string}` =>
  typeof accent === 'string' && HEX.test(accent)

/** The CSS color for a stored accent (unknown values fall back to coral). */
export const accentColor = (accent?: ProfileAccent | null): string => {
  if (isCustomAccent(accent)) return accent
  return ACCENT_PRESETS[(accent as ProfilePresetAccent) || 'coral'] ?? ACCENT_PRESETS.coral
}

/**
 * Text color for on top of an accent. Presets are designed for white text. A custom
 * color keeps white unless it is lighter than the lightest preset (teal, about 2.4:1
 * against white), so pale picks like yellow or pastels get dark navy text instead.
 * @param accent - A stored accent (preset name or `#rrggbb`).
 */
export const readableOn = (accent?: ProfileAccent | null): string => {
  if (!isCustomAccent(accent)) return '#ffffff'
  const channel = (offset: number) => {
    const value = parseInt(accent.slice(offset, offset + 2), 16) / 255
    return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4
  }
  const luminance = 0.2126 * channel(1) + 0.7152 * channel(3) + 0.0722 * channel(5)
  return 1.05 / (luminance + 0.05) >= 2.3 ? '#ffffff' : '#152238'
}
