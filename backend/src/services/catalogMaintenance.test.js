import assert from 'node:assert/strict'
import { afterEach, beforeEach, describe, it, mock } from 'node:test'
import { createDebouncedTrigger } from './catalogMaintenance.js'

describe('createDebouncedTrigger', () => {
  beforeEach(() => mock.timers.enable({ apis: ['setTimeout'] }))
  afterEach(() => mock.timers.reset())

  it('runs once after a burst of requests settles', () => {
    const runs = []
    const trigger = createDebouncedTrigger({ run: (reason) => runs.push(reason), delayMs: 1000 })
    for (let i = 0; i < 500; i += 1) trigger.request('title added')
    mock.timers.tick(999)
    assert.deepEqual(runs, [])
    mock.timers.tick(1)
    assert.deepEqual(runs, ['title added'])
  })

  it('names every reason that asked for the run', () => {
    const runs = []
    const trigger = createDebouncedTrigger({ run: (reason) => runs.push(reason), delayMs: 1000 })
    trigger.request('title added')
    trigger.request('import')
    mock.timers.tick(1000)
    assert.deepEqual(runs, ['title added, import'])
  })

  it('starts a fresh window after running', () => {
    const runs = []
    const trigger = createDebouncedTrigger({ run: (reason) => runs.push(reason), delayMs: 1000 })
    trigger.request('a')
    mock.timers.tick(1000)
    trigger.request('b')
    mock.timers.tick(1000)
    assert.deepEqual(runs, ['a', 'b'])
  })

  it('cancel drops a pending run', () => {
    const runs = []
    const trigger = createDebouncedTrigger({ run: (reason) => runs.push(reason), delayMs: 1000 })
    trigger.request('a')
    trigger.cancel()
    mock.timers.tick(5000)
    assert.deepEqual(runs, [])
  })
})
