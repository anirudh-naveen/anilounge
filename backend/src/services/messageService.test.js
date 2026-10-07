import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  cleanMessageBody,
  maskLanguage,
  MESSAGE_MAX,
  messageEntry,
  pairSql,
} from './messageService.js'

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

  it('leaves language to maskLanguage', () => {
    assert.equal(cleanMessageBody('what the fuck'), 'what the fuck')
  })
})

describe('maskLanguage', () => {
  it('passes clean text through', () => {
    assert.deepEqual(maskLanguage('see you at the screening'), {
      body: 'see you at the screening',
      term: null,
      clean: true,
    })
  })

  it('masks blocked words and reports the term', () => {
    assert.deepEqual(maskLanguage('what the fuck'), {
      body: 'what the f***',
      term: 'fuck',
      clean: true,
    })
  })

  it('masks spelled-out words', () => {
    assert.equal(maskLanguage('f u c k this').body, 'f * * * this')
    assert.equal(maskLanguage('f u c k this').clean, true)
  })
})
