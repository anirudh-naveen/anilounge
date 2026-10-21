import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { runCatalogRefresh } from './catalogRefresh.js'

describe('runCatalogRefresh', () => {
  it('works through claimed batches until the queue is empty', async () => {
    const batches = [[{ kind: 'unknown', id: 'a' }], [{ kind: 'unknown', id: 'b' }], []]
    const claimed = []
    const result = await runCatalogRefresh({
      claim: async (limit) => {
        claimed.push(limit)
        return batches.shift()
      },
    })
    assert.deepEqual(result, { done: 2, failed: 0 })
    assert.equal(claimed.length, 3)
  })

  it('stops claiming once the run budget is spent', async () => {
    let claims = 0
    await runCatalogRefresh({
      budgetMs: 0,
      claim: async () => {
        claims += 1
        return [{ kind: 'unknown', id: 'a' }]
      },
    })
    assert.equal(claims, 0)
  })
})
