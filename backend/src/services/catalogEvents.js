/**
 * In-process catalog events, so models can announce changes without importing
 * the services that react to them.
 *
 * - `title-added` (workId): a movie, series, or special row was inserted.
 */
import { EventEmitter } from 'node:events'

const catalogEvents = new EventEmitter()

export default catalogEvents
