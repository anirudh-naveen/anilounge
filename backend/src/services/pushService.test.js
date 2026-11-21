import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  describePush,
  fcmMessage,
  normalizeDeviceToken,
  normalizePushSettings,
  releaseLabel,
} from './pushService.js'

describe('describePush', () => {
  it('words social pushes and links to the right page', () => {
    assert.deepEqual(describePush('friend_request', { actor: 'mika' }), {
      title: 'Friend request',
      body: 'mika wants to be friends.',
      path: '/friends',
    })
    assert.equal(describePush('friend_accepted', { actor: 'mika' }).path, '/u/mika')
    const reply = describePush('comment_reply', {
      actor: 'mika',
      postId: 'p1',
      postTitle: 'Frieren finale',
      commentId: 'c9',
    })
    assert.equal(reply.title, 'Frieren finale')
    assert.equal(reply.body, 'mika replied to your comment.')
    assert.equal(reply.path, '/forum/post/frieren-finale/p1#comment-c9')
  })

  it('previews messages, shortening long ones', () => {
    const push = describePush('message', { actor: 'mika', actorId: 'u2', text: 'x'.repeat(300) })
    assert.equal(push.title, 'mika')
    assert.equal(push.body.length, 140)
    assert.ok(push.body.endsWith('…'))
    assert.equal(push.path, '/friends?user=u2')
  })

  it('names a single release and summarizes several', () => {
    const one = describePush('release', {
      releases: [{ name: 'Frieren', label: 'Season 2 Episode 3', path: '/tv-show/frieren/1' }],
    })
    assert.equal(one.body, 'Season 2 Episode 3 of Frieren is out.')
    assert.equal(one.path, '/tv-show/frieren/1')
    const movie = describePush('release', {
      releases: [{ name: 'Look Back', label: null, path: '/movie/look-back/2' }],
    })
    assert.deepEqual([movie.title, movie.body], ['Out now', 'Look Back is out.'])
    const many = describePush('release', {
      releases: ['A', 'B', 'C', 'D'].map((name) => ({ name, label: 'Episode 1', path: '/' })),
    })
    assert.equal(many.title, '4 new releases')
    assert.equal(many.body, 'New from your watchlist: A, B, and 2 more.')
    assert.equal(many.path, '/watchlist')
  })

  it('skips kinds that are not pushed', () => {
    assert.equal(describePush('language_warning', {}), null)
    assert.equal(describePush('release', { releases: [] }), null)
  })
})

describe('releaseLabel', () => {
  it('shows the season only when the show has more than one', () => {
    assert.equal(
      releaseLabel({ season_number: 1, episode_number: 4, season_count: 1 }),
      'Episode 4',
    )
    assert.equal(
      releaseLabel({ season_number: 1, episode_number: 4, season_count: 2 }),
      'Season 1 Episode 4',
    )
    assert.equal(releaseLabel({ season_number: null, episode_number: null }), null)
  })
})

describe('normalizePushSettings', () => {
  it('treats missing kinds as on', () => {
    assert.deepEqual(normalizePushSettings({ forum: false, junk: 1 }), {
      friends: true,
      forum: false,
      messages: true,
      releases: true,
    })
    assert.deepEqual(normalizePushSettings(null).releases, true)
  })
})

describe('normalizeDeviceToken', () => {
  const apns = 'AB'.repeat(32)
  const fcm = `dGVzdA:APA91b${'x_Y-z9'.repeat(25)}`

  it('lowercases APNs tokens and treats a missing platform as iOS', () => {
    assert.equal(normalizeDeviceToken(apns), apns.toLowerCase())
    assert.equal(normalizeDeviceToken(` ${apns} `, 'ios'), apns.toLowerCase())
  })

  it('keeps FCM tokens exactly as given', () => {
    assert.equal(normalizeDeviceToken(fcm, 'android'), fcm)
  })

  it('rejects tokens that do not fit the platform', () => {
    assert.equal(normalizeDeviceToken(fcm, 'ios'), null)
    assert.equal(normalizeDeviceToken('abc', 'android'), null)
    assert.equal(normalizeDeviceToken(apns, 'windows'), null)
    assert.equal(normalizeDeviceToken(42, 'ios'), null)
  })
})

describe('fcmMessage', () => {
  it('sends the path as data and uses the kind as the Android channel', () => {
    const message = fcmMessage(
      'tok',
      { title: 'New friend', body: 'Hi', path: '/u/mika' },
      'friends',
    )
    assert.deepEqual(message.message.notification, { title: 'New friend', body: 'Hi' })
    assert.deepEqual(message.message.data, { path: '/u/mika', kind: 'friends' })
    assert.equal(message.message.android.notification.channel_id, 'friends')
    assert.equal(message.message.token, 'tok')
  })
})
