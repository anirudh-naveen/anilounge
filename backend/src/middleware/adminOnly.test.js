import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import adminOnly, { isAdminUser, parseAdminEmails } from './adminOnly.js'

const admins = parseAdminEmails(' Owner@AniLounge.net , ops@anilounge.net,, ')
const user = (overrides = {}) => ({
  email: 'owner@anilounge.net',
  emailVerified: true,
  isDemo: () => false,
  ...overrides,
})

describe('isAdminUser', () => {
  it('matches verified allowlisted emails case-insensitively', () => {
    assert.deepEqual([...admins], ['owner@anilounge.net', 'ops@anilounge.net'])
    assert.equal(isAdminUser(user(), admins), true)
    assert.equal(isAdminUser(user({ email: 'OPS@anilounge.net' }), admins), true)
  })

  it('rejects everyone else', () => {
    assert.equal(isAdminUser(user({ email: 'fan@example.com' }), admins), false)
    assert.equal(isAdminUser(user({ emailVerified: false }), admins), false)
    assert.equal(isAdminUser(user({ isDemo: () => true }), admins), false)
    assert.equal(isAdminUser(undefined, admins), false)
    assert.equal(isAdminUser(user(), parseAdminEmails('')), false)
  })

  it('accepts the admin role without an allowlist entry', () => {
    const none = parseAdminEmails('')
    assert.equal(isAdminUser(user({ email: 'mod@example.com', role: 'admin' }), none), true)
    assert.equal(isAdminUser(user({ email: 'mod@example.com', role: 'user' }), none), false)
    assert.equal(isAdminUser(user({ role: 'admin', emailVerified: false }), none), false)
    assert.equal(isAdminUser(user({ role: 'admin', isDemo: () => true }), none), false)
  })
})

describe('adminOnly', () => {
  const run = (req) => {
    const res = {
      statusCode: 200,
      status(code) {
        this.statusCode = code
        return this
      },
      json() {
        return this
      },
    }
    let passed = false
    adminOnly(req, res, () => {
      passed = true
    })
    return { passed, status: res.statusCode }
  }

  it('returns 403 for signed-in non-admins and when no allowlist is set', () => {
    const saved = process.env.ADMIN_EMAILS
    try {
      process.env.ADMIN_EMAILS = 'owner@anilounge.net'
      assert.deepEqual(run({ user: user() }), { passed: true, status: 200 })
      assert.deepEqual(run({ user: user({ email: 'fan@example.com' }) }), {
        passed: false,
        status: 403,
      })
      delete process.env.ADMIN_EMAILS
      assert.deepEqual(run({ user: user() }), { passed: false, status: 403 })
    } finally {
      if (saved === undefined) delete process.env.ADMIN_EMAILS
      else process.env.ADMIN_EMAILS = saved
    }
  })
})
