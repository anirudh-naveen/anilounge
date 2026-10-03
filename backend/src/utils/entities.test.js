import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  compareCharactersForContent,
  appearanceRoleRank,
  canonicalCharacterName,
  canonicalCharacterNameKey,
  characterNamesEqual,
  characterPortraitPath,
  characterUpsertFilter,
  cleanCharacterName,
  displayStudioName,
  entityNamesEqual,
  entityToSearchHit,
  foldEntityName,
  groupCharactersByCanonicalName,
  highlightedCharacters,
  isCharacterPortrait,
  isUsableCharacterName,
  mapJikanCharacterRow,
  mapJikanPersonVoiceRow,
  mapJikanProducer,
  mapTmdbCharacterCredits,
  mapVoiceActorFromCredit,
  matchCharacterByName,
  pickJikanProducer,
  pickPrimaryCharacter,
  pickTmdbCompany,
  serializeEntity,
  studioNameKey,
  studioNamesEqual,
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
    assert.equal(
      matchCharacterByName('Natsuki, Subaru', [{ _id: 's', name: 'Subaru Natsuki' }])?._id,
      's',
    )
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

  it('maps a voice credit onto a searchable voice-actor payload', () => {
    const mapped = mapVoiceActorFromCredit(
      {
        name: 'Tanaka, Mayumi',
        language: 'Japanese',
        malId: 8,
        imagePath: 'https://cdn.myanimelist.net/images/voiceactors/mayumi.jpg',
      },
      { contentId: 'content-1', characterName: 'Monkey D. Luffy', role: 'Main', characterId: 'char-1' },
    )
    assert.equal(mapped.name, 'Mayumi Tanaka')
    assert.equal(mapped.malId, 8)
    assert.equal(mapped.appearance.characterName, 'Monkey D. Luffy')
    assert.equal(mapped.appearance.character, 'char-1')
    assert.equal(mapped.appearance.language, 'Japanese')
    assert.equal(mapped.imagePath.includes('voiceactors'), true)
  })

  it('maps Jikan people-voices rows onto voiced characters', () => {
    const mapped = mapJikanPersonVoiceRow({
      role: 'Main',
      anime: { mal_id: 21, title: 'One Piece' },
      character: {
        mal_id: 40,
        name: 'Monkey D. Luffy',
        images: { jpg: { image_url: 'https://cdn.myanimelist.net/images/characters/9/luffy.jpg' } },
      },
    })
    assert.equal(mapped.name, 'Monkey D. Luffy')
    assert.equal(mapped.malId, 40)
    assert.equal(mapped.role, 'Main')
    assert.equal(mapped.animeMalId, 21)
    assert.equal(mapped.imagePath.includes('characters'), true)
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
    assert.equal(
      serializeEntity({
        _id: 'va-1',
        entityType: 'voice_actor',
        name: 'Tanaka, Mayumi',
        imagePath: 'https://cdn.myanimelist.net/images/voiceactors/1/mayumi.jpg',
        appearances: [],
      }).imagePath.includes('voiceactors'),
      true,
    )
    assert.equal(
      serializeEntity({
        _id: 'va-1',
        entityType: 'voice_actor',
        name: 'Tanaka, Mayumi',
        imagePath: 'https://cdn.myanimelist.net/images/voiceactors/1/mayumi.jpg',
        appearances: [],
      }).name,
      'Mayumi Tanaka',
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
    assert.equal(
      serializeEntity({
        _id: 's1',
        entityType: 'character',
        name: 'Natsuki, Subaru',
        imagePath: 'https://cdn.example/subaru.jpg',
        appearances: [],
      }).name,
      'Subaru Natsuki',
    )
  })

  it('keeps populated character portraits on voice-actor appearances', () => {
    const serialized = serializeEntity({
      _id: 'va-1',
      entityType: 'voice_actor',
      name: 'Mayumi Tanaka',
      imagePath: 'https://cdn.myanimelist.net/images/voiceactors/1/mayumi.jpg',
      appearances: [
        {
          role: 'Main',
          characterName: 'Monkey D. Luffy',
          character: {
            _id: 'char-1',
            name: 'Monkey D. Luffy',
            imagePath: 'https://cdn.myanimelist.net/images/characters/9/luffy.jpg',
          },
        },
      ],
    })
    assert.equal(serialized.appearances[0].character.name, 'Monkey D. Luffy')
    assert.equal(
      serialized.appearances[0].character.imagePath.includes('characters'),
      true,
    )
  })

  it('keeps studio names and logos as-is and trims studio search hits', () => {
    const serialized = serializeEntity({
      _id: 'st-1',
      entityType: 'studio',
      name: 'Sunrise, Inc.',
      imagePath: '/pixar-logo.png',
      appearances: [{ content: 'w1' }, { content: 'w2' }],
    })
    assert.equal(serialized.name, 'Sunrise, Inc.')
    assert.equal(serialized.imagePath, '/pixar-logo.png')
    assert.equal(serialized.appearances.length, 2)
    const hit = entityToSearchHit(serialized)
    assert.equal(hit.contentType, 'studio')
    assert.deepEqual(hit.appearances, [])
  })
})

describe('studio lookups', () => {
  it('matches studio names across corporate suffixes and punctuation', () => {
    assert.equal(studioNameKey('Kyoto Animation Co., Ltd.'), 'kyoto animation')
    assert.equal(studioNamesEqual('Kyoto Animation Co., Ltd.', 'Kyoto Animation'), true)
    assert.equal(studioNamesEqual('Production I.G', 'production i g'), true)
    assert.equal(studioNamesEqual('Pixar', 'Pixar Canada'), false)
    assert.equal(displayStudioName('  Studio   Ghibli '), 'Studio Ghibli')
  })

  it('maps a Jikan producer and picks the matching search hit', () => {
    const rows = [
      {
        mal_id: 99,
        titles: [{ type: 'Default', title: 'Kyoto Animation Tokyo' }],
      },
      {
        mal_id: 2,
        titles: [
          { type: 'Default', title: 'Kyoto Animation' },
          { type: 'Japanese', title: '京都アニメーション' },
          { type: 'Synonym', title: 'KyoAni' },
        ],
        images: { jpg: { image_url: 'https://cdn.myanimelist.net/images/company/2.png' } },
        about: 'Studio in Uji.',
      },
    ]
    const picked = pickJikanProducer(rows, 'Kyoto Animation Co., Ltd.')
    assert.equal(picked.mal_id, 2)
    assert.deepEqual(mapJikanProducer(picked), {
      malId: 2,
      name: 'Kyoto Animation',
      nativeName: '京都アニメーション',
      alternativeNames: ['京都アニメーション', 'KyoAni'],
      imagePath: 'https://cdn.myanimelist.net/images/company/2.png',
      about: 'Studio in Uji.',
    })
    assert.equal(mapJikanProducer({ mal_id: 0, titles: [] }), null)
    assert.equal(pickJikanProducer(rows, 'MAPPA'), null)
  })

  it('prefers the TMDB company with a logo among exact name matches', () => {
    const results = [
      { id: 1, name: 'Pixar', logo_path: null },
      { id: 3, name: 'Pixar', logo_path: '/logo.png' },
      { id: 219390, name: 'Pixar Canada', logo_path: '/ca.png' },
    ]
    assert.equal(pickTmdbCompany(results, 'Pixar').id, 3)
    assert.equal(pickTmdbCompany(results, 'DreamWorks'), null)
  })
})

describe('franchise character name merge keys', () => {
  it('treats swapped first/last names as the same character', () => {
    assert.equal(canonicalCharacterName('Natsuki, Subaru'), 'Subaru Natsuki')
    assert.equal(canonicalCharacterNameKey('Natsuki, Subaru'), 'natsuki subaru')
    assert.equal(canonicalCharacterNameKey('Subaru Natsuki'), 'natsuki subaru')
    assert.equal(characterNamesEqual('Natsuki, Subaru', 'Subaru Natsuki'), true)
    assert.equal(characterNamesEqual('Luffy D. Monkey', 'Monkey D. Luffy'), true)
    assert.equal(characterNamesEqual('Luffy Monkey D.', 'Monkey D. Luffy'), true)
    assert.equal(characterNamesEqual('Luffy Monkey', 'Monkey D. Luffy'), false)
    assert.equal(characterNamesEqual('Rem', 'Ram'), false)
  })

  it('groups swapped-order duplicates and keeps the portrait row', () => {
    const groups = groupCharactersByCanonicalName([
      {
        _id: 'a',
        name: 'Natsuki, Subaru',
        appearances: [{ content: 's1' }],
      },
      {
        _id: 'b',
        name: 'Subaru Natsuki',
        imagePath: 'https://cdn.myanimelist.net/images/characters/9/subaru.jpg',
        malId: 118735,
        appearances: [{ content: 's1' }, { content: 's2' }],
      },
      { _id: 'c', name: 'Emilia', appearances: [{ content: 's1' }] },
    ])
    const subaru = groups.find((group) => group.length === 2)
    const emilia = groups.find((group) => group.length === 1)
    assert.equal(subaru.length, 2)
    assert.equal(emilia[0]._id, 'c')
    assert.equal(pickPrimaryCharacter(subaru)._id, 'b')
    assert.equal(
      pickPrimaryCharacter([
        { _id: 'x', name: 'Rem', appearanceCount: 1 },
        { _id: 'y', name: 'Rem', imagePath: 'https://cdn.example/rem.jpg', appearanceCount: 4 },
      ])._id,
      'y',
    )
    const mixed = groupCharactersByCanonicalName([
      { _id: 'a', name: 'Subaru Natsuki', alternativeNames: ['Andrew Stanton'] },
      { _id: 'b', name: 'Andrew Stanton' },
    ])
    assert.equal(mixed.length, 2)
  })
})

describe('compareCharactersForContent admin order', () => {
  const character = (name, appearance) => ({ name, appearances: [{ content: 'w1', ...appearance }] })

  it('puts admin-ordered characters first, in their order, ahead of role', () => {
    const list = [
      character('Main A', { role: 'Main', importance: 9 }),
      character('Second', { role: 'Supporting', position: 2 }),
      character('First', { role: 'Supporting', position: 1 }),
    ].sort((left, right) => compareCharactersForContent(left, right, 'w1'))
    assert.deepEqual(
      list.map((entry) => entry.name),
      ['First', 'Second', 'Main A'],
    )
  })
})

describe('serializeEntity character names', () => {
  it('shows the English name set on the row over the source name', () => {
    const out = serializeEntity({
      _id: 'c1',
      entityType: 'character',
      name: 'Luffy D. Monkey',
      englishName: 'Monkey D. Luffy',
    })
    assert.equal(out.name, 'Monkey D. Luffy')
  })

  it('falls back to the source name without an English name', () => {
    assert.equal(
      serializeEntity({ _id: 'c2', entityType: 'character', name: 'Natsuki, Subaru' }).name,
      'Subaru Natsuki',
    )
  })
})
