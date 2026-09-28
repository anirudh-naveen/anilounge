import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { planUnverifiedAction } from './unverifiedAccountService.js'

const HOUR = 60 * 60 * 1000
const now = new Date('2026-09-28T12:00:00Z')
const signedUp = (hoursAgo) => new Date(now.getTime() - hoursAgo * HOUR)

describe('planUnverifiedAction', () => {
  it('leaves sign-ups alone for the first two days', () => {
    assert.deepEqual(planUnverifiedAction(signedUp(47), null, now), { action: 'none' })
  })

  it('reminds once, one day before deletion', () => {
    const plan = planUnverifiedAction(signedUp(48), null, now)
    assert.equal(plan.action, 'remind')
    assert.equal(plan.deleteAt.toISOString(), '2026-09-29T12:00:00.000Z')
    assert.deepEqual(planUnverifiedAction(signedUp(60), signedUp(12), now), { action: 'none' })
  })

  it('deletes after three days, reminded or not', () => {
    assert.deepEqual(planUnverifiedAction(signedUp(72), signedUp(24), now), { action: 'delete' })
    assert.deepEqual(planUnverifiedAction(signedUp(100), null, now), { action: 'delete' })
  })
})
