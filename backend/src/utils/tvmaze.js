/**
 * Pairing TVmaze's cast with characters from TMDB credits: TVmaze has character
 * images (and actor photos) that TMDB doesn't. A character matches by name, else by
 * its voice actor when TVmaze credits that actor with one character whose name shares
 * a word with ours ("Homer" / "Homer Simpson").
 *
 * Utils layer: pure. Used by services/entityService.js.
 */
import { cleanCharacterName, foldEntityName } from './entities.js'

/**
 * @param {unknown} image - TVmaze `{ medium, original }`
 * @returns {string}
 */
const imageUrl = (image) => String(image?.original || image?.medium || '').trim()

/**
 * Fill missing character images and voice actor photos on TMDB character payloads.
 * @param {Array<{ name: string, imagePath?: string, appearance?: { voiceActors?: object[] } }>} payloads
 *   From `mapTmdbCharacterCredits` (mutated).
 * @param {Array<{ person?: object, character?: object }>} cast - TVmaze `/shows/{id}/cast`
 * @returns {number} Character images filled
 */
export function applyTvmazeImages(payloads, cast) {
  const byCharacter = new Map()
  const byActor = new Map()
  const actorPhotos = new Map()
  for (const row of cast || []) {
    const character = foldEntityName(cleanCharacterName(row?.character?.name))
    const actor = foldEntityName(row?.person?.name)
    const image = imageUrl(row?.character?.image)
    if (character && image && !byCharacter.has(character)) byCharacter.set(character, image)
    if (actor) {
      if (!byActor.has(actor)) byActor.set(actor, [])
      byActor.get(actor).push({ character, image })
      const photo = imageUrl(row?.person?.image)
      if (photo && !actorPhotos.has(actor)) actorPhotos.set(actor, photo)
    }
  }

  let filled = 0
  for (const payload of payloads || []) {
    const name = foldEntityName(payload?.name)
    const actors = payload?.appearance?.voiceActors || []
    if (!payload.imagePath && name) {
      let image = byCharacter.get(name)
      if (!image) {
        const words = new Set(name.split(' '))
        for (const actor of actors) {
          const roles = byActor.get(foldEntityName(actor?.name)) || []
          const sharing = roles.filter(
            (role) => role.image && role.character.split(' ').some((word) => words.has(word)),
          )
          if (sharing.length === 1) {
            image = sharing[0].image
            break
          }
        }
      }
      if (image) {
        payload.imagePath = image
        filled += 1
      }
    }
    for (const actor of actors) {
      const photo = actorPhotos.get(foldEntityName(actor?.name))
      if (!actor.imagePath && photo) actor.imagePath = photo
    }
  }
  return filled
}
