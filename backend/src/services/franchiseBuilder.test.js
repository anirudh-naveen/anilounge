import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { planFranchises, seasonlessName } from './franchiseBuilder.js'

const work = (id, name, extra = {}) => ({ id, name, kind: 'series', year: 2000, ...extra })
const cast = (workId, ...characterIds) => characterIds.map((characterId) => ({ workId, characterId }))

describe('planFranchises', () => {
  it('groups titles linked by relations and names the group after the first series', () => {
    const plan = planFranchises({
      works: [
        work('naruto', 'Naruto', { year: 2002 }),
        work('shippuden', 'Naruto Shippūden', { year: 2007 }),
        work('movie', 'The Last: Naruto the Movie', { kind: 'movie', year: 2014 }),
      ],
      relations: [
        { fromId: 'naruto', toId: 'shippuden' },
        { fromId: 'shippuden', toId: 'movie' },
      ],
      mainCast: [],
      franchises: [],
    })
    assert.deepEqual(plan.create, [
      {
        name: 'Naruto',
        memberIds: ['naruto', 'shippuden', 'movie'],
        titles: ['Naruto', 'Naruto Shippūden', 'The Last: Naruto the Movie'],
      },
    ])
  })

  it('groups titles with no relations that share most of their main cast', () => {
    const plan = planFranchises({
      works: [
        work('atla', 'Avatar: The Last Airbender', { year: 2005 }),
        work('film', 'Avatar Aang: The Last Airbender', { kind: 'movie', year: 2026 }),
      ],
      relations: [],
      mainCast: [...cast('atla', 'aang', 'katara', 'sokka', 'zuko'), ...cast('film', 'aang', 'katara', 'sokka')],
      franchises: [],
    })
    assert.equal(plan.create.length, 1)
    assert.equal(plan.create[0].name, 'Avatar: The Last Airbender')
  })

  it('does not chain shows through a crossover that borrows a few of their leads', () => {
    const plan = planFranchises({
      works: [work('a', 'Show A'), work('b', 'Show B'), work('x', 'Crossover')],
      relations: [],
      mainCast: [
        ...cast('a', 'a1', 'a2'),
        ...cast('b', 'b1', 'b2'),
        ...cast('x', 'a1', 'a2', 'b1', 'b2', 'x1', 'x2'),
      ],
      franchises: [],
    })
    assert.deepEqual(plan.create, [])
  })

  it('needs more than one shared lead', () => {
    const plan = planFranchises({
      works: [work('glt', "Girls' Last Tour"), work('mb', 'MEGALOBOX')],
      relations: [],
      mainCast: [...cast('glt', 'chito', 'yuuri'), ...cast('mb', 'joe', 'yuuri')],
      franchises: [],
    })
    assert.deepEqual(plan.create, [])
  })

  it('notes shared-universe links without merging the franchises', () => {
    const plan = planFranchises({
      works: [
        work('sg', 'Steins;Gate', { year: 2011 }),
        work('sg0', 'Steins;Gate 0', { year: 2018 }),
        work('rn', 'Robotics;Notes', { year: 2012 }),
      ],
      relations: [{ fromId: 'sg', toId: 'sg0' }],
      sharedUniverse: [
        { fromId: 'rn', toId: 'sg' },
        { fromId: 'rn', toId: 'sg0' },
      ],
      mainCast: [],
      franchises: [],
    })
    assert.deepEqual(plan.create.map((group) => group.name), ['Steins;Gate'])
    assert.deepEqual(plan.sharedUniverse, [['Robotics;Notes', 'Steins;Gate']])
  })

  it('adds loose titles to the one franchise their group already has', () => {
    const plan = planFranchises({
      works: [
        work('s1', 'Chainsaw Man', { franchiseId: 'csm' }),
        work('arc', 'Chainsaw Man: Assassins Arc'),
      ],
      relations: [{ fromId: 'arc', toId: 's1' }],
      mainCast: [],
      franchises: [{ id: 'csm', name: 'Chainsaw Man' }],
    })
    assert.deepEqual(plan.join, [
      { franchiseId: 'csm', name: 'Chainsaw Man', memberIds: ['arc'], titles: ['Chainsaw Man: Assassins Arc'] },
    ])
    assert.deepEqual(plan.create, [])
  })

  it('leaves groups that span two franchises alone', () => {
    const plan = planFranchises({
      works: [work('a', 'A', { franchiseId: 'f1' }), work('b', 'B', { franchiseId: 'f2' }), work('c', 'C')],
      relations: [
        { fromId: 'a', toId: 'c' },
        { fromId: 'c', toId: 'b' },
      ],
      mainCast: [],
      franchises: [
        { id: 'f1', name: 'One' },
        { id: 'f2', name: 'Two' },
      ],
    })
    assert.deepEqual(plan.conflicts, [{ franchises: ['One', 'Two'], titles: ['A', 'B', 'C'] }])
    assert.deepEqual(plan.join, [])
  })

})

describe('seasonlessName', () => {
  it('drops trailing season and part markers', () => {
    assert.equal(seasonlessName('Dandadan 2nd Season'), 'Dandadan')
    assert.equal(seasonlessName('Major S1'), 'Major')
    assert.equal(seasonlessName('Attack on Titan Season 3 Part 2'), 'Attack on Titan')
    assert.equal(seasonlessName('Naruto'), 'Naruto')
    assert.equal(seasonlessName('86'), '86')
  })
})
