import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { blockedByViewerSql, blockedEitherWaySql } from './blockService.js'

const squash = (sql) => sql.replace(/\s+/g, ' ').trim()

describe('blockedByViewerSql', () => {
  it('checks only blocks made by the viewer', () => {
    assert.equal(
      squash(blockedByViewerSql('$1', 'p.user_id')),
      'EXISTS (SELECT 1 FROM user_blocks ub WHERE ub.blocker_id = $1::uuid AND ub.blocked_id = p.user_id)',
    )
  })
})

describe('blockedEitherWaySql', () => {
  it('checks blocks in both directions', () => {
    assert.equal(
      squash(blockedEitherWaySql('$1::uuid', 'u.id')),
      'EXISTS (SELECT 1 FROM user_blocks ub WHERE (ub.blocker_id = $1::uuid AND ub.blocked_id = u.id) OR (ub.blocker_id = u.id AND ub.blocked_id = $1::uuid))',
    )
  })
})
