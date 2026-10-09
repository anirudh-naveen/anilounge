import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { isValidKofiToken, parseKofiPayload } from './donationService.js'

const body = (data) => ({ data: JSON.stringify(data) })

describe('parseKofiPayload', () => {
  it('reads a Ko-fi donation', () => {
    const payment = parseKofiPayload(
      body({
        verification_token: 'tok',
        message_id: 'm1',
        kofi_transaction_id: 'tx-1',
        type: 'Donation',
        amount: '3.00',
        currency: 'USD',
        email: ' Fan@Example.com ',
        timestamp: '2026-10-01T12:00:00Z',
      }),
    )
    assert.equal(payment.token, 'tok')
    assert.equal(payment.transactionId, 'tx-1')
    assert.equal(payment.kind, 'Donation')
    assert.equal(payment.amount, 3)
    assert.equal(payment.email, 'fan@example.com')
    assert.equal(payment.donatedAt.toISOString(), '2026-10-01T12:00:00.000Z')
  })

  it('rejects bodies that are not Ko-fi payments', () => {
    assert.equal(parseKofiPayload({}), null)
    assert.equal(parseKofiPayload({ data: '{not json' }), null)
    assert.equal(parseKofiPayload(body({ type: 'Donation' })), null)
  })

  it('drops an email that is not one', () => {
    const payment = parseKofiPayload(body({ message_id: 'm', type: 'Donation', email: 'nope' }))
    assert.equal(payment.email, null)
    assert.equal(payment.amount, null)
  })
})

describe('isValidKofiToken', () => {
  it('matches only the configured token', () => {
    assert.equal(isValidKofiToken('abc', 'abc'), true)
    assert.equal(isValidKofiToken('abd', 'abc'), false)
    assert.equal(isValidKofiToken(undefined, 'abc'), false)
    assert.equal(isValidKofiToken('abc', ''), false)
  })
})
