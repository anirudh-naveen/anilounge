import { afterEach, describe, expect, it } from 'vitest'
import type { AxiosAdapter, InternalAxiosRequestConfig } from 'axios'
import api, { setAccessToken } from '@/services/api'

type Handler = (config: InternalAxiosRequestConfig) => { status: number; data: unknown }

const originalAdapter = api.defaults.adapter

/** Route requests to `handler` and record them. */
const useFakeServer = (handler: Handler) => {
  const calls: InternalAxiosRequestConfig[] = []
  const adapter: AxiosAdapter = async (config) => {
    calls.push(config)
    const { status, data } = handler(config)
    const response = { data, status, statusText: '', headers: {}, config }
    if (status >= 400) {
      throw Object.assign(new Error(`HTTP ${status}`), { config, response, isAxiosError: true })
    }
    return response
  }
  api.defaults.adapter = adapter
  return calls
}

describe('session refresh interceptor', () => {
  afterEach(() => {
    api.defaults.adapter = originalAdapter
    setAccessToken(null)
  })

  it('renews an expired access token from the cookie and replays the request once', async () => {
    setAccessToken('expired')
    const calls = useFakeServer((config) => {
      if (config.url === '/auth/refresh') {
        return { status: 200, data: { data: { accessToken: 'fresh', user: { id: 'u1' } } } }
      }
      const auth = String(config.headers?.Authorization || '')
      return auth === 'Bearer fresh'
        ? { status: 200, data: { ok: true } }
        : { status: 401, data: { message: 'expired' } }
    })

    const response = await api.get('/watchlist')

    expect(response.data).toEqual({ ok: true })
    expect(calls.map((config) => config.url)).toEqual(['/watchlist', '/auth/refresh', '/watchlist'])
    expect(calls[1]?.headers?.['X-Requested-With']).toBe('XMLHttpRequest')
  })

  it('does not try to refresh when a wrong password gets a 401', async () => {
    const calls = useFakeServer(() => ({ status: 401, data: { message: 'Invalid credentials.' } }))

    await expect(api.post('/auth/login', { email: 'a@b.co', password: 'x' })).rejects.toThrow()
    expect(calls.map((config) => config.url)).toEqual(['/auth/login'])
  })

  it('shares one refresh between concurrent 401s', async () => {
    setAccessToken('expired')
    let refreshes = 0
    useFakeServer((config) => {
      if (config.url === '/auth/refresh') {
        refreshes += 1
        return { status: 200, data: { data: { accessToken: 'fresh', user: { id: 'u1' } } } }
      }
      return String(config.headers?.Authorization) === 'Bearer fresh'
        ? { status: 200, data: {} }
        : { status: 401, data: {} }
    })

    await Promise.all([api.get('/a'), api.get('/b'), api.get('/c')])
    expect(refreshes).toBe(1)
  })
})
