/**
 * bcrypt hashing on worker threads.
 *
 * Layer: utils. `bcryptjs` is pure JavaScript: one cost-12 hash takes ~400 ms of CPU,
 * and on the main thread every other request waits behind it. A small pool of workers
 * (PASSWORD_HASH_THREADS, default 2) does the work instead, so sign-ins only queue
 * behind each other. Hashes stay standard bcrypt, compatible with every stored one.
 */

import { Worker } from 'node:worker_threads'
import os from 'node:os'

export const PASSWORD_HASH_COST = 12

const WORKER_URL = new URL('./passwordHashWorker.js', import.meta.url)

/** @type {Array<{ worker: Worker, busy: number }>} */
const pool = []
/** @type {Map<number, { resolve: Function, reject: Function, slot: object }>} */
const pending = new Map()
let nextId = 1

function poolSize() {
  const configured = parseInt(process.env.PASSWORD_HASH_THREADS, 10)
  if (Number.isFinite(configured) && configured > 0) return configured
  return Math.max(1, Math.min(2, os.availableParallelism?.() ?? os.cpus().length))
}

/**
 * Start a worker. Idle workers are unref'd so they never keep the process (or a test
 * run) alive; a crashed worker fails its pending calls and is replaced on next use.
 * @returns {{ worker: Worker, busy: number }}
 */
function spawn() {
  const slot = { worker: new Worker(WORKER_URL), busy: 0 }
  slot.worker.unref()
  slot.worker.on('message', ({ id, result, error }) => {
    const call = pending.get(id)
    if (!call) return
    pending.delete(id)
    release(call.slot)
    if (error) call.reject(new Error(error))
    else call.resolve(result)
  })
  const fail = (error) => {
    const index = pool.indexOf(slot)
    if (index >= 0) pool.splice(index, 1)
    for (const [id, call] of pending) {
      if (call.slot !== slot) continue
      pending.delete(id)
      call.reject(error instanceof Error ? error : new Error('Password worker exited'))
    }
  }
  slot.worker.on('error', fail)
  slot.worker.on('exit', (code) => {
    if (code !== 0) fail(new Error(`Password worker exited with code ${code}`))
  })
  return slot
}

function release(slot) {
  slot.busy -= 1
  if (slot.busy === 0) slot.worker.unref()
}

/** Least-busy worker, starting new ones up to the pool size. */
function pickSlot() {
  if (pool.length < poolSize()) {
    const idle = pool.find((slot) => slot.busy === 0)
    if (idle) return idle
    const slot = spawn()
    pool.push(slot)
    return slot
  }
  return pool.reduce((best, slot) => (slot.busy < best.busy ? slot : best))
}

function run(message) {
  return new Promise((resolve, reject) => {
    const slot = pickSlot()
    const id = nextId++
    pending.set(id, { resolve, reject, slot })
    if (slot.busy === 0) slot.worker.ref()
    slot.busy += 1
    slot.worker.postMessage({ id, ...message })
  })
}

/**
 * bcrypt-hash a password.
 * @param {string} password
 * @param {number} [cost=PASSWORD_HASH_COST]
 * @returns {Promise<string>}
 */
export function hashPassword(password, cost = PASSWORD_HASH_COST) {
  return run({ op: 'hash', password: String(password), cost })
}

/**
 * Check a password against a bcrypt hash.
 * @param {string} password
 * @param {string} hash
 * @returns {Promise<boolean>}
 */
export function comparePassword(password, hash) {
  if (typeof hash !== 'string' || !hash) return Promise.resolve(false)
  return run({ op: 'compare', password: String(password), hash })
}

/**
 * Stop the workers (scripts and tests).
 * @returns {Promise<void>}
 */
export async function closePasswordWorkers() {
  const slots = pool.splice(0)
  await Promise.all(slots.map((slot) => slot.worker.terminate()))
}
