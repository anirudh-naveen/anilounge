import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  appearanceRoleRank,
  characterPortraitPath,
  characterUpsertFilter,
  cleanCharacterName,
  entityNamesEqual,
  entityToSearchHit,
  foldEntityName,
  highlightedCharacters,
  isCharacterPortrait,
  isUsableCharacterName,
  mapJikanCharacterRow,
  mapTmdbCharacterCredits,
  matchCharacterByName,
  serializeEntity,
  uniqueEntityNames,
} from './entities.js'

describe('entity name matching', () => {
  it('folds punctuation so episode cast can match catalog characters', () => {
    assert.equal(foldEntityName('Monkey D. Luffy'), 'monkey d luffy')
    assert.equal(entityNamesEqual('Monkey D. Luffy', 'monkey d luffy'), true)
    assert.equal(entityNamesEqual('Nami', 'Nico Robin'), false)
    assert.deepEqual(uniqueEntityNames('Luffy', 'luffy', '  Nami  '), ['Luffy', 'Nami'])
  })

  it('matches a TMDB character name onto a persisted entity', () => {
    const characters = [
      { _id: '1', name: 'Monkey D. Luffy', alternativeNames: ['Luffy'] },
      { _id: '2', name: 'Roronoa Zoro' },
    ]
    assert.equal(matchCharacterByName('Luffy', characters)?._id, '1')
    assert.equal(matchCharacterByName('Roronoa Zoro', characters)?._id, '2')
    assert.equal(matchCharacterByName('Sanji', characters), null)
  })
})

describe('Jikan / TMDB mappers', () => {
  it('maps a Jikan character row with Japanese voice credits and a picture', () => {
    const mapped = mapJikanCharacterRow(
      {
        role: 'Main',
        favorites: 42000,
        character: {
          mal_id: 40,
          name: 'Monkey D. Luffy',
          name_kanji: 'モンキー・D・ルフィ',
          nicknames: ['Straw Hat'],
          images: { jpg: { image_url: 'https://cdn.myanimelist.net/images/characters/luffy.jpg' } },
        },
        voice_actors: [
          {
            language: 'Japanese',
            person: {
              mal_id: 8,
              name: 'Tanaka, Mayumi',
              images: { jpg: { image_url: 'https://cdn.myanimelist.net/images/voiceactors/mayumi.jpg' } },
            },
          },
        ],
      },
      'content-1',
    )
    assert.equal(mapped.malId, 40)
    assert.equal(mapped.name, 'Monkey D. Luffy')
    assert.equal(mapped.nativeName, 'モンキー・D・ルフィ')
    assert.equal(mapped.appearance.role, 'Main')
    assert.equal(mapped.appearance.content, 'content-1')
    assert.equal(mapped.appearance.importance > 1_000_000, true)
    assert.equal(mapped.imagePath.includes('luffy.jpg'), true)
    assert.equal(mapped.appearance.voiceActors[0].name, 'Tanaka, Mayumi')
  })

  it('drops Jikan rows without a character name or mal id', () => {
    assert.equal(mapJikanCharacterRow({ character: { name: 'X' } }, 'c1'), null)
    assert.equal(mapJikanCharacterRow(null, 'c1'), null)
  })

  it('groups TMDB credits by character name', () => {
    const mapped = mapTmdbCharacterCredits(
      [
        { id: 1, name: 'Mayumi Tanaka', character: 'Monkey D. Luffy (voice)', profile_path: '/a.jpg', order: 0 },
        { id: 2, name: 'Colleen Clinkenbeard', character: 'Monkey D. Luffy (voice)', profile_path: '/b.jpg' },
        { id: 3, name: 'Extra', character: 'Self' },
        { id: 4, name: 'Crowd', character: 'Additional Voices (voice)' },
        { id: 5, name: 'Nobody', character: '(voice)' },
      ],
      'content-1',
    )
    assert.equal(mapped.length, 1)
    assert.equal(mapped[0].name, 'Monkey D. Luffy')
    assert.equal(mapped[0].imagePath, '')
    assert.equal(mapped[0].appearance.voiceActors.length, 2)
    assert.equal(mapped[0].appearance.voiceActors[0].imagePath, '/a.jpg')
  })
})

describe('character portraits', () => {
  it('keeps MAL character images and drops actor/TMDB headshots', () => {
    assert.equal(
      isCharacterPortrait('https://cdn.myanimelist.net/images/characters/9/luffy.jpg'),
      true,
    )
    assert.equal(
      isCharacterPortrait('https://cdn.myanimelist.net/images/voiceactors/1/mayumi.jpg'),
      false,
    )
    assert.equal(isCharacterPortrait('/tmdb-profile.jpg'), false)
    assert.equal(isCharacterPortrait('https://cdn.myanimelist.net/images/questionmark_white.gif'), false)
    assert.equal(characterPortraitPath('/tmdb-profile.jpg'), '')
    assert.equal(
      serializeEntity({
        _id: 'c1',
        entityType: 'character',
        name: 'Luffy',
        imagePath: '/actor.jpg',
        appearances: [],
      }).imagePath,
      '',
    )
  })
})

describe('character names and ranking', () => {
  it('strips (voice) labels and drops unnamed credits', () => {
    assert.equal(cleanCharacterName('Nami (voice)'), 'Nami')
    assert.equal(isUsableCharacterName('(voice)'), false)
    assert.equal(isUsableCharacterName('Additional Voices (voice)'), false)
    assert.equal(isUsableCharacterName('Monkey D. Luffy (voice)'), true)
  })

  it('orders Main characters first and keeps the top 10', () => {
    const docs = Array.from({ length: 12 }, (_, index) => ({
      _id: `c${index}`,
      name: `Char ${index}`,
      appearances: [
        {
          content: 'show-1',
          role: index < 3 ? 'Main' : 'Supporting',
          importance: 100 - index,
        },
      ],
    }))
    const highlighted = highlightedCharacters(docs, 'show-1')
    assert.equal(highlighted.length, 10)
    assert.equal(highlighted[0].name, 'Char 0')
    assert.equal(highlighted[2].name, 'Char 2')
    assert.equal(highlighted[3].name, 'Char 3')
    assert.equal(
      highlighted.some((row) => row.name === 'Char 11'),
      false,
    )
  })
})

describe('characterUpsertFilter', () => {
  it('uses malId when present and omits it for TMDB-only names', () => {
    assert.deepEqual(characterUpsertFilter({ malId: 40, name: 'Luffy' }), {
      entityType: 'character',
      malId: 40,
    })
    assert.deepEqual(characterUpsertFilter({ name: 'Hero' }), {
      entityType: 'character',
      name: 'Hero',
      $or: [{ malId: { $exists: false } }, { malId: null }],
    })
  })
})

describe('serializeEntity', () => {
  it('sorts Main appearances first and builds a search hit', () => {
    const serialized = serializeEntity({
      _id: 'char-1',
      entityType: 'character',
      name: 'Nami (voice)',
      about: 'Navigator',
      imagePath: 'https://cdn.example/nami.jpg',
      appearances: [
        { content: 'c2', role: 'Supporting' },
        { content: 'c1', role: 'Main' },
      ],
    })
    assert.equal(serialized.appearances[0].role, 'Main')
    assert.equal(serialized.name, 'Nami')
    assert.equal(appearanceRoleRank('Main') < appearanceRoleRank('Supporting'), true)
    const hit = entityToSearchHit(serialized)
    assert.equal(hit.contentType, 'character')
    assert.equal(hit.entityType, 'character')
    assert.equal(hit.title, 'Nami')
    assert.equal(hit.posterPath, 'https://cdn.example/nami.jpg')
  })
})
