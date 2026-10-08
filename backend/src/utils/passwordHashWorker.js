/**
 * Worker thread for `utils/passwordHash.js`: runs bcrypt off the main event loop.
 *
 * Layer: utils. Receives `{ id, op: 'hash' | 'compare', password, hash?, cost? }` and
 * replies `{ id, result }` or `{ id, error }`.
 */

import { parentPort } from 'node:worker_threads'
import bcrypt from 'bcryptjs'

parentPort.on('message', ({ id, op, password, hash, cost }) => {
  try {
    const result =
      op === 'hash' ? bcrypt.hashSync(password, cost) : bcrypt.compareSync(password, hash)
    parentPort.postMessage({ id, result })
  } catch (error) {
    parentPort.postMessage({ id, error: error.message })
  }
})
