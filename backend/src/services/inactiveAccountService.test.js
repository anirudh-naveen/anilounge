import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { planInactivityAction } from './inactiveAccountService.js'

const DAY = 24 * 60 * 60 * 1000
const now = new Date('2026-09-28T09:00:00Z')
/** Last activity such that deletion is `daysLeft` days from `now`. */
const activeAt = (daysLeft) => new Date(now.getTime() - (365 - daysLeft) * DAY)

describe('planInactivityAction', () => {
  it('does nothing before the three-month warning', () => {
    assert.deepEqual(planInactivityAction(activeAt(120), null, now), { action: 'none' })
  })

  it('sends each warning once, at 90, 30, 14, 7, and 1 days', () => {
    const sequence = [
      [90, null, 90],
      [60, 90, null],
      [30, 90, 30],
      [14, 30, 14],
      [7, 14, 7],
      [3, 7, null],
      [1, 7, 1],
      [1, 1, null],
    ]
    for (const [daysLeft, warned, expectedStage] of sequence) {
      const plan = planInactivityAction(activeAt(daysLeft), warned, now)
      if (expectedStage === null) assert.equal(plan.action, 'none', `day ${daysLeft}`)
      else {
        assert.equal(plan.action, 'warn', `day ${daysLeft}`)
        assert.equal(plan.stage, expectedStage)
        assert.equal(plan.daysLeft, daysLeft)
      }
    }
  })

  it('after downtime sends only the current warning', () => {
    const plan = planInactivityAction(activeAt(5), null, now)
    assert.equal(plan.action, 'warn')
    assert.equal(plan.stage, 7)
  })

  it('deletes on the one-year mark', () => {
    assert.deepEqual(planInactivityAction(activeAt(0), 1, now), { action: 'delete' })
    assert.deepEqual(planInactivityAction(activeAt(-10), null, now), { action: 'delete' })
  })
})
