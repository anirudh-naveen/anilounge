import { describe, expect, it } from 'vitest'
import { appGateRedirect } from '@/utils/appGate'

const app = { isNativeApp: true, isAuthenticated: false }
const to = (name: string, fullPath = '/') => ({ name, fullPath })

describe('appGateRedirect', () => {
  it('sends signed-out app visitors to the welcome screen, remembering the page', () => {
    expect(appGateRedirect(to('home', '/'), app)).toEqual({ name: 'appWelcome', query: {} })
    expect(appGateRedirect(to('forumPost', '/forum/post/x/1#c2'), app)).toEqual({
      name: 'appWelcome',
      query: { redirect: '/forum/post/x/1#c2' },
    })
  })

  it('keeps sign-in, sign-up, privacy, and support open in the app', () => {
    for (const name of [
      'login',
      'register',
      'verifyEmail',
      'unlockAccount',
      'privacy',
      'support',
    ]) {
      expect(appGateRedirect(to(name), app)).toBeNull()
    }
    expect(appGateRedirect(to('appWelcome'), app)).toBeNull()
  })

  it('lets signed-in app users and every browser visitor through', () => {
    expect(appGateRedirect(to('home'), { ...app, isAuthenticated: true })).toBeNull()
    expect(appGateRedirect(to('home'), { ...app, isNativeApp: false })).toBeNull()
  })

  it('sends anyone who should not see the welcome screen home', () => {
    expect(appGateRedirect(to('appWelcome'), { ...app, isAuthenticated: true })).toBe('/')
    expect(appGateRedirect(to('appWelcome'), { ...app, isNativeApp: false })).toBe('/')
  })
})
