/**
 * Block muted users from actions other people see.
 *
 * Layer: middleware. Runs after `authenticateToken`. Pass a predicate when only some
 * requests to a route are public (e.g. a profile update that changes the username).
 */

import { isMuted, mutedMessage } from '../utils/accountStatus.js'

/**
 * @param {(req: import('express').Request) => boolean} [isPublicAction] - Defaults to every request.
 * @returns {import('express').RequestHandler} 403 `MUTED` when the user is muted and the action is public.
 */
export default function blockWhenMuted(isPublicAction = () => true) {
  return (req, res, next) => {
    if (!isMuted(req.user) || !isPublicAction(req)) return next()
    res.status(403).json({ success: false, code: 'MUTED', message: mutedMessage(req.user) })
  }
}

/** Username changes are public; email and preference changes are not. */
export const changesUsername = (req) => req.body?.username !== undefined

/** Bio and headline are shown on the public profile. */
export const changesProfileText = (req) =>
  req.body?.bio !== undefined || req.body?.settings?.headline !== undefined
