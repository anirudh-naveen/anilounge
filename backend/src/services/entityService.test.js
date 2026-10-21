import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  characterNeedsAbout,
  mergeAppearance,
  personIdsConflict,
  studioNeedsDetails,
  voiceActorNeedsSync,
} from './entityService.js'
import { characterSourceIdsConflict } from './characterMerge.js'
import { externalIdsConflict } from '../utils/titles.js'
import { pickPrimaryCharacter } from '../utils/entities.js'

describe('voice credits on a character appearance', () => {
  const character = (voiceActors) => ({
    entityType: 'character',
    appearances: [{ content: 'w1', role: 'Main', voiceActors }],
  })

  it('labels an unlabeled TMDB credit instead of adding the same actor again', () => {
    const doc = character([{ name: 'Bryn Apprill', language: 'Unknown' }])
    assert.equal(
      mergeAppearance(doc, {
        content: 'w1',
        voiceActors: [{ name: 'Bryn Apprill', language: 'English' }],
      }),
      true,
    )
    assert.deepEqual(doc.appearances[0].voiceActors, [
      { name: 'Bryn Apprill', language: 'English' },
    ])
  })

  it('skips unlabeled repeats but keeps other dub languages', () => {
    const doc = character([{ name: 'Yumi Uchiyama', language: 'Japanese' }])
    mergeAppearance(doc, { content: 'w1', voiceActors: [{ name: 'Yumi Uchiyama' }] })
    mergeAppearance(doc, {
      content: 'w1',
      voiceActors: [{ name: 'Madeleine Morris', language: 'English' }],
    })
    assert.deepEqual(
      doc.appearances[0].voiceActors.map((va) => `${va.name}:${va.language}`),
      ['Yumi Uchiyama:Japanese', 'Madeleine Morris:English'],
    )
  })
})

describe('cross-source identity', () => {
  it('treats different ids from the same source as different people', () => {
    assert.equal(personIdsConflict({ malId: 1 }, { malId: 2 }), true)
    assert.equal(personIdsConflict({ anilistId: 5 }, { anilistId: 6 }), true)
    assert.equal(personIdsConflict({ malId: 1 }, { anilistId: 6 }), false)
    assert.equal(personIdsConflict({ malId: 1, anilistId: 6 }, { malId: 1 }), false)
  })

  it('keeps same-name characters with different MAL or AniList ids apart', () => {
    assert.equal(characterSourceIdsConflict({ anilistId: 1 }, { anilistId: 2 }), true)
    assert.equal(characterSourceIdsConflict({ malId: 3 }, { anilistId: 2 }), false)
  })

  it('never merges titles with different AniList ids', () => {
    assert.equal(externalIdsConflict({ anilistId: 1 }, { anilistId: 2 }), true)
    assert.equal(externalIdsConflict({ anilistId: 1, malId: 5 }, { malId: 5 }), false)
  })

  it('keeps the MAL character, then the AniList one, when merging duplicates', () => {
    const portrait = 'https://cdn.myanimelist.net/images/characters/1.jpg'
    const primary = pickPrimaryCharacter([
      { _id: 'a', imagePath: portrait },
      { _id: 'b', imagePath: portrait, anilistId: 7 },
      { _id: 'c', imagePath: portrait, malId: 9 },
    ])
    assert.equal(primary._id, 'c')
    assert.equal(
      pickPrimaryCharacter([
        { _id: 'a', imagePath: portrait },
        { _id: 'b', imagePath: portrait, anilistId: 7 },
      ])._id,
      'b',
    )
  })
})

describe('what a page queues for the refresh job', () => {
  const portrait = 'https://s4.anilist.co/file/anilistcdn/character/large/b1.png'

  it('queues a character bio only when AniList can fill it', () => {
    const character = { entityType: 'character', anilistId: 1, imagePath: portrait }
    assert.equal(characterNeedsAbout({ ...character, about: '', nativeName: '' }), true)
    assert.equal(characterNeedsAbout({ ...character, about: 'Bio', nativeName: 'ナルト' }), false)
    assert.equal(characterNeedsAbout({ ...character, anilistId: null, about: '' }), false)
  })

  it('queues a voice actor with a missing bio or stale roles', () => {
    const linked = [{ content: 'w1', character: 'c1' }]
    const actor = {
      entityType: 'voice_actor',
      anilistId: 95185,
      about: 'Voice actress.',
      imagePath: 'https://s4.anilist.co/file/anilistcdn/staff/large/n95185.png',
      appearances: linked,
      voiceCreditsSyncedAt: new Date(),
    }
    assert.equal(voiceActorNeedsSync(actor), false)
    assert.equal(voiceActorNeedsSync({ ...actor, about: '' }), true)
    assert.equal(voiceActorNeedsSync({ ...actor, voiceCreditsSyncedAt: new Date(0) }), true)
    assert.equal(voiceActorNeedsSync({ ...actor, appearances: [] }), true)
  })

  it('queues a studio missing its logo or description', () => {
    assert.equal(studioNeedsDetails({ entityType: 'studio', imagePath: '', about: '' }), true)
    assert.equal(studioNeedsDetails({ entityType: 'character' }), false)
  })
})
