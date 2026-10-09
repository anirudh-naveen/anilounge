import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { releaseKey, watchOrder } from './franchiseOrder.js'

const ids = (works) => works.map((work) => work._id)

describe('franchise watch order', () => {
  it('orders by release date, falling back to start year, undated last', () => {
    const works = [
      { _id: 'c' },
      { _id: 'b', startSeasonYear: 2016 },
      { _id: 'a', releaseDate: '2014-04-06' },
    ]
    assert.deepEqual(ids(watchOrder(works, [])), ['a', 'b', 'c'])
    assert.equal(releaseKey({}), Number.POSITIVE_INFINITY)
  })

  it('puts a title after its prequels even when released earlier', () => {
    const works = [
      { _id: 's1', releaseDate: '2016-04-03' },
      { _id: 'movie', releaseDate: '2016-01-01' },
      { _id: 's2', releaseDate: '2017-04-01' },
    ]
    const edges = [
      { from_id: 's1', to_id: 'movie', kind: 'sequel' },
      { from_id: 's2', to_id: 'movie', kind: 'prequel' },
    ]
    assert.deepEqual(ids(watchOrder(works, edges)), ['s1', 'movie', 's2'])
  })

  it('ignores edges outside the set and survives relation loops', () => {
    const works = [
      { _id: 'a', releaseDate: '2010-01-01' },
      { _id: 'b', releaseDate: '2011-01-01' },
    ]
    const edges = [
      { from_id: 'a', to_id: 'b', kind: 'prequel' },
      { from_id: 'b', to_id: 'a', kind: 'prequel' },
      { from_id: 'a', to_id: 'zzz', kind: 'sequel' },
    ]
    assert.deepEqual(ids(watchOrder(works, edges)), ['a', 'b'])
  })
})
