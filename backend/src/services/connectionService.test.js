import assert from 'node:assert/strict'
import { afterEach, describe, it } from 'node:test'
import {
  ConnectionError,
  connectionsRedirectUri,
  finishConnection,
  isProviderConfigured,
  resetPendingConnections,
  startConnection,
} from './connectionService.js'

const ENV_KEYS = ['ANILIST_CLIENT_ID', 'ANILIST_CLIENT_SECRET', 'MAL_CLIENT_ID', 'CONNECTIONS_REDIRECT_URL']
const saved = Object.fromEntries(ENV_KEYS.map((key) => [key, process.env[key]]))

afterEach(() => {
  for (const key of ENV_KEYS) {
    if (saved[key] === undefined) delete process.env[key]
    else process.env[key] = saved[key]
  }
  resetPendingConnections()
})

describe('connection setup', () => {
  it('knows which sites the server has keys for', () => {
    assert.equal(isProviderConfigured('anilist', { ANILIST_CLIENT_ID: '1' }), false)
    assert.equal(isProviderConfigured('anilist', { ANILIST_CLIENT_ID: '1', ANILIST_CLIENT_SECRET: 's' }), true)
    assert.equal(isProviderConfigured('mal', { MAL_CLIENT_ID: 'x' }), true)
    assert.equal(isProviderConfigured('tmdb', {}), false)
    assert.equal(isProviderConfigured('kitsu', { TMDB_API_KEY: 'k' }), false)
  })

  it('sends sites back to the Connections page', () => {
    assert.equal(connectionsRedirectUri({ CONNECTIONS_REDIRECT_URL: 'http://localhost:5173/connections' }), 'http://localhost:5173/connections')
    assert.equal(connectionsRedirectUri({ PUBLIC_APP_URL: 'https://www.anilounge.net/' }), 'https://www.anilounge.net/connections')
    assert.equal(connectionsRedirectUri({ FRONTEND_URL: 'https://a.example,https://b.example' }), 'https://a.example/connections')
  })
})

describe('sign-in flow', () => {
  it('builds AniList and MyAnimeList authorize links with a provider-tagged state', async () => {
    Object.assign(process.env, {
      ANILIST_CLIENT_ID: '42',
      ANILIST_CLIENT_SECRET: 's',
      MAL_CLIENT_ID: 'mal-id',
      CONNECTIONS_REDIRECT_URL: 'https://www.anilounge.net/connections',
    })
    const anilist = new URL((await startConnection('u1', 'anilist')).authorizeUrl)
    assert.equal(anilist.origin + anilist.pathname, 'https://anilist.co/api/v2/oauth/authorize')
    assert.equal(anilist.searchParams.get('client_id'), '42')
    assert.equal(anilist.searchParams.get('redirect_uri'), 'https://www.anilounge.net/connections')
    assert.match(anilist.searchParams.get('state'), /^anilist\./)

    const mal = new URL((await startConnection('u1', 'mal')).authorizeUrl)
    assert.equal(mal.searchParams.get('code_challenge_method'), 'plain')
    assert.ok(mal.searchParams.get('code_challenge').length >= 43)
    assert.match(mal.searchParams.get('state'), /^mal\./)
  })

  it("refuses a state another user started, or that doesn't exist", async () => {
    Object.assign(process.env, { ANILIST_CLIENT_ID: '42', ANILIST_CLIENT_SECRET: 's' })
    const state = new URL((await startConnection('u1', 'anilist')).authorizeUrl).searchParams.get('state')
    await assert.rejects(finishConnection('u2', 'anilist', { code: 'c', state }), ConnectionError)
    await assert.rejects(finishConnection('u1', 'anilist', { code: 'c', state: 'anilist.nope' }), ConnectionError)
  })

  it('refuses sites the server has no keys for', async () => {
    delete process.env.ANILIST_CLIENT_ID
    await assert.rejects(startConnection('u1', 'anilist'), (error) => error.status === 503)
  })
})
