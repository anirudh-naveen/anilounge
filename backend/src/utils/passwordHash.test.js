import assert from 'node:assert/strict'
import { after, describe, it } from 'node:test'
import bcrypt from 'bcryptjs'
import { closePasswordWorkers, comparePassword, hashPassword } from './passwordHash.js'

describe('passwordHash', () => {
  after(closePasswordWorkers)

  it('hashes on a worker without blocking the event loop', async () => {
    let ticks = 0
    const timer = setInterval(() => ticks++, 5)
    const hash = await hashPassword('Correct-Horse-1', 10)
    clearInterval(timer)
    assert.match(hash, /^\$2[aby]\$10\$/)
    assert.ok(ticks > 0, 'timers kept firing while hashing')
  })

  it('verifies hashes, including ones made by bcryptjs directly', async () => {
    const legacy = bcrypt.hashSync('Old-Password-9', 4)
    assert.equal(await comparePassword('Old-Password-9', legacy), true)
    assert.equal(await comparePassword('wrong', legacy), false)
    assert.equal(await comparePassword('anything', ''), false)
  })

  it('handles concurrent calls', async () => {
    const hashes = await Promise.all(['a1!Aaaaa', 'b2!Bbbbb', 'c3!Ccccc'].map((pw) => hashPassword(pw, 4)))
    const checks = await Promise.all(
      hashes.map((hash, i) => comparePassword(['a1!Aaaaa', 'b2!Bbbbb', 'c3!Ccccc'][i], hash)),
    )
    assert.deepEqual(checks, [true, true, true])
  })
})
