/**
 * social.ts — shared helpers for friends, messages, inbox, and forum views.
 */

type ApiError = { response?: { status?: number; data?: { message?: string; code?: string } } }

/**
 * User-facing message from a failed API call.
 * @param error - Caught Axios error.
 * @param fallback - Message when the server sent none.
 */
export function apiErrorMessage(error: unknown, fallback: string) {
  return (error as ApiError)?.response?.data?.message || fallback
}

/** Route to a user's public profile. */
export const profileRoute = (username: string) => ({
  name: 'publicProfile',
  params: { username },
})

/**
 * An in-site path to return to after signing in (`?redirect=`), else Home. Only
 * `/path` values are kept, so the parameter can't send anyone to another site.
 */
export function safeRedirect(value: unknown) {
  return typeof value === 'string' && /^\/(?![/\\])/.test(value) ? value : '/'
}
