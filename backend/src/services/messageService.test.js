import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { cleanMessageBody, MESSAGE_MAX, messageEntry, pairSql } from './messageService.js'

describe('pairSql', () => {
  it('matches the pair in either direction', () => {
    const sql = pairSql('$1', '$2')
    assert.match(sql, /LEAST\(sender_id, recipient_id\) = LEAST\(\$1::uuid, \$2::uuid\)/)
    assert.match(sql, /GREATEST\(sender_id, recipient_id\) = GREATEST\(\$1::uuid, \$2::uuid\)/)
  })
})

describe('messageEntry', () => {
  const row = {
    id: 'm1',
    sender_id: 'a',
    body: 'hi',
    created_at: new Date('2026-10-01T00:00:00Z'),
    read_at: null,
  }

  it('marks the viewer’s own messages', () => {
    assert.equal(messageEntry(row, 'a').fromMe, true)
    assert.equal(messageEntry(row, 'b').fromMe, false)
  })

  it('keeps the read time', () => {
    assert.equal(messageEntry(row, 'a').readAt, null)
    const readAt = new Date('2026-10-02T00:00:00Z')
    assert.equal(messageEntry({ ...row, read_at: readAt }, 'a').readAt, readAt)
  })
})

describe('cleanMessageBody', () => {
  it('trims and decodes escaped text', () => {
    assert.equal(cleanMessageBody('  Tom &amp; Jerry  '), 'Tom & Jerry')
  })

  it('rejects empty and non-string bodies', () => {
    assert.throws(() => cleanMessageBody('   '), { status: 400 })
    assert.throws(() => cleanMessageBody(undefined), { status: 400 })
  })

  it('rejects bodies over the limit', () => {
    assert.equal(cleanMessageBody('a'.repeat(MESSAGE_MAX)).length, MESSAGE_MAX)
    assert.throws(() => cleanMessageBody('a'.repeat(MESSAGE_MAX + 1)), { status: 400 })
  })

  it('rejects blocked language', () => {
    assert.throws(() => cleanMessageBody('what the fuck'), { status: 400 })
  })
})
