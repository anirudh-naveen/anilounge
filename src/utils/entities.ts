/**
 * entities.ts — helpers for character (and later VA/studio) appearance rows.
 */

import type { CatalogEntity, EntityAppearance, EntityVoiceCredit } from '@/types/content'

export const HIGHLIGHTED_CHARACTERS_PER_TITLE = 10

const fold = (value?: string) =>
  String(value || '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()

/**
 * Strip TMDB suffixes such as "(voice)" from a character name.
 */
export function cleanCharacterName(value?: string) {
  return String(value || '')
    .replace(
      /\s*\((?:voice|voices|voice acting|uncredited|archive footage|archive sound)s?\)/gi,
      '',
    )
    .replace(/\(\s*\)/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * First N characters for title/episode slides.
 */
export function highlightedCharacters<T>(
  items: T[] | undefined,
  limit = HIGHLIGHTED_CHARACTERS_PER_TITLE,
): T[] {
  return (items || []).slice(0, limit)
}

/**
 * Appearance row for a specific title, if this character is in it.
 */
export function appearanceForContent(entity: CatalogEntity, contentId?: string): EntityAppearance | undefined {
  if (!contentId || !entity.appearances?.length) return entity.appearances?.[0]
  return entity.appearances.find((row) => {
    const id = typeof row.content === 'object' && row.content ? row.content._id : row.content
    return String(id) === String(contentId)
  })
}

/**
 * Japanese credit first, then any remaining voice actor.
 */
export function primaryVoiceCredit(appearance?: EntityAppearance): EntityVoiceCredit | undefined {
  const credits = appearance?.voiceActors || []
  return credits.find((credit) => /japanese/i.test(credit.language || '')) || credits[0]
}

/**
 * MAL people names are often `"Last, First"`.
 */
export function displayPersonName(name?: string) {
  const value = String(name || '').trim()
  if (!value.includes(',')) return value
  const [last, first] = value.split(',').map((part) => part.trim())
  if (first && last) return `${first} ${last}`
  return value
}

/**
 * Unique voice credits for a character, Japanese first.
 */
export function collectVoiceActors(entity?: CatalogEntity | null): EntityVoiceCredit[] {
  const seen = new Set<string>()
  const credits: EntityVoiceCredit[] = []
  for (const appearance of entity?.appearances || []) {
    for (const credit of appearance.voiceActors || []) {
      const key = fold(credit.name)
      if (!key || seen.has(key)) continue
      seen.add(key)
      credits.push(credit)
    }
  }
  return credits.sort((left, right) => {
    const leftJa = /japanese/i.test(left.language || '') ? 0 : 1
    const rightJa = /japanese/i.test(right.language || '') ? 0 : 1
    return leftJa - rightJa || displayPersonName(left.name).localeCompare(displayPersonName(right.name))
  })
}

/**
 * Match an episode-cast character name onto persisted characters.
 */
export function matchCharacterByName(
  characterName: string,
  characters: CatalogEntity[],
): CatalogEntity | undefined {
  const target = fold(cleanCharacterName(characterName) || characterName)
  if (!target) return undefined
  return characters.find((entity) => {
    const names = [entity.name, entity.englishName, entity.nativeName, ...(entity.alternativeNames || [])]
    return names.some((name) => fold(name) === target)
  })
}

export interface VoicedCharacterCard {
  id: string
  name: string
  imagePath: string
  role: string
  content?: EntityAppearance['content']
}

/**
 * Unique characters a voice actor has played, Main roles first. No 10-card cap.
 */
export function collectVoicedCharacters(entity?: CatalogEntity | null): VoicedCharacterCard[] {
  const seen = new Set<string>()
  const rows: VoicedCharacterCard[] = []
  for (const appearance of entity?.appearances || []) {
    const populated =
      appearance.character && typeof appearance.character === 'object' ? appearance.character : null
    const id =
      populated?._id || (typeof appearance.character === 'string' ? appearance.character : '')
    const name =
      cleanCharacterName(populated?.name || appearance.characterName) ||
      populated?.name ||
      appearance.characterName ||
      ''
    const key = id || fold(name)
    if (!key || !name || seen.has(key)) continue
    seen.add(key)
    rows.push({
      id,
      name,
      imagePath: populated?.imagePath || '',
      role: appearance.role || '',
      content: appearance.content,
    })
  }
  return rows.sort((left, right) => {
    const leftMain = left.role === 'Main' ? 0 : 1
    const rightMain = right.role === 'Main' ? 0 : 1
    return leftMain - rightMain || left.name.localeCompare(right.name)
  })
}
