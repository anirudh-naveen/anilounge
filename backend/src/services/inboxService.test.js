import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { inboxEntry } from './inboxService.js'

const at = new Date('2026-10-06T12:00:00Z')

describe('inboxEntry', () => {
  it('shapes site news', () => {
    assert.deepEqual(
      inboxEntry({
        source: 'news',
        id: 'a1',
        kind: 'announcement',
        created_at: at,
        read_at: null,
        title: 'Forums are live',
        body: 'Come say hi.',
      }),
      {
        id: 'a1',
        kind: 'announcement',
        createdAt: at,
        read: false,
        news: { title: 'Forums are live', body: 'Come say hi.' },
      },
    )
  })

  it('shapes a comment notification with its actor, post, and a comment preview', () => {
    const entry = inboxEntry({
      source: 'notification',
      id: 'n1',
      kind: 'post_comment',
      created_at: at,
      read_at: at,
      actor_id: 'u2',
      actor_username: 'kai',
      actor_picture: null,
      post_id: 'p1',
      post_title: 'Episode 5',
      comment_id: 'c1',
      comment_body: `${'word '.repeat(60)}end`,
      detail: null,
    })
    assert.equal(entry.read, true)
    assert.deepEqual(entry.actor, { id: 'u2', username: 'kai', profilePicture: null })
    assert.deepEqual(entry.post, { id: 'p1', title: 'Episode 5' })
    assert.ok(entry.comment.excerpt.length <= 161)
    assert.equal(entry.requestStatus, undefined)
  })

  it('reports whether a friend request is still open', () => {
    const entry = inboxEntry({
      source: 'notification',
      id: 'n2',
      kind: 'friend_request',
      created_at: at,
      read_at: null,
      actor_id: 'u3',
      actor_username: 'rei',
      request_status: 'pending',
    })
    assert.equal(entry.requestStatus, 'pending')
    assert.equal(entry.post, null)
    assert.equal(entry.comment, null)
  })
})
