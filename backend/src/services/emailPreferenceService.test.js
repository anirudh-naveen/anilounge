import assert from 'node:assert/strict'
import { afterEach, beforeEach, describe, it } from 'node:test'
import {
  isEmailCategory,
  unsubscribeToken,
  unsubscribeUrl,
  verifyUnsubscribeToken,
} from './emailPreferenceService.js'

const USER_ID = '6f1c2a4e-8b3d-4c5e-9f70-1a2b3c4d5e6f'
const env = { ...process.env }

beforeEach(() => {
  process.env.JWT_SECRET = 'test-secret'
  process.env.PUBLIC_APP_URL = 'https://anilounge.net'
})

afterEach(() => {
  process.env = { ...env }
})

describe('category unsubscribe links', () => {
  it('signs each category separately', () => {
    const token = unsubscribeToken(USER_ID, 'friend_requests')
    assert.equal(verifyUnsubscribeToken(USER_ID, token, 'friend_requests'), true)
    assert.equal(verifyUnsubscribeToken(USER_ID, token, 'announcements'), false)
    assert.equal(verifyUnsubscribeToken(USER_ID, token, 'passwords'), false)
  })

  it('keeps announcement links in their original format', () => {
    assert.equal(unsubscribeToken(USER_ID), unsubscribeToken(USER_ID, 'announcements'))
    assert.equal(new URL(unsubscribeUrl(USER_ID)).searchParams.has('c'), false)
    const url = new URL(unsubscribeUrl(USER_ID, 'friend_requests'))
    assert.equal(url.searchParams.get('c'), 'friend_requests')
    assert.equal(url.pathname, '/api/email/unsubscribe')
  })

  it('only knows the optional categories', () => {
    assert.equal(isEmailCategory('friend_requests'), true)
    assert.equal(isEmailCategory('toString'), false)
    assert.equal(isEmailCategory(undefined), false)
  })
})
