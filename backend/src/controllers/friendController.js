/**
 * HTTP handlers for friends and friend requests.
 *
 * Layer: controller. All routes require auth. Business rules live in
 * `services/friendService.js`; the demo account can read but not send or accept.
 */

import friendService from '../services/friendService.js'
import { assertNotDemo, sendError } from '../utils/httpError.js'

/**
 * The viewer's friends and open requests.
 *
 * @param {import('express').Request} req - `req.user`.
 * @param {import('express').Response} res - 200 `{ data: { friends, incoming, outgoing } }` or 500.
 * @returns {Promise<void>}
 */
export const getFriends = async (req, res) => {
  try {
    const data = await friendService.listFriends(req.user._id)
    res.json({ success: true, data })
  } catch (error) {
    sendError(res, error, 'Error loading friends')
  }
}

/**
 * Username search for adding friends.
 *
 * @param {import('express').Request} req - `query.q` (2+ characters).
 * @param {import('express').Response} res - 200 `{ data: users[] }` with each user's `relationship`, or 500.
 * @returns {Promise<void>}
 */
export const searchUsers = async (req, res) => {
  try {
    const data = await friendService.searchUsers(req.user._id, req.query.q, {
      limit: req.query.limit,
    })
    res.json({ success: true, data })
  } catch (error) {
    sendError(res, error, 'Error searching users')
  }
}

/**
 * Send a friend request (or accept theirs when they already asked).
 *
 * @param {import('express').Request} req - `body.userId`, optional `body.message` note.
 * @param {import('express').Response} res - 201 `{ data: { relationship, user } }`, 400, 403 demo, 404, 409, or 500.
 * @returns {Promise<void>}
 */
export const sendRequest = async (req, res) => {
  try {
    assertNotDemo(req.user)
    const data = await friendService.sendFriendRequest(
      req.user._id,
      String(req.body?.userId || ''),
      req.body?.message,
    )
    res.status(201).json({
      success: true,
      message: data.relationship === 'friends' ? "You're now friends." : 'Friend request sent.',
      data,
    })
  } catch (error) {
    sendError(res, error, 'Error sending friend request')
  }
}

/**
 * Accept the request `params.id` sent to the viewer.
 *
 * @param {import('express').Request} req - `params.id` is the requester's user id.
 * @param {import('express').Response} res - 200 `{ data: { relationship: 'friends' } }`, 403 demo, 404, or 500.
 * @returns {Promise<void>}
 */
export const acceptRequest = async (req, res) => {
  try {
    assertNotDemo(req.user)
    await friendService.acceptFriendRequest(req.user._id, req.params.id)
    res.json({ success: true, message: "You're now friends.", data: { relationship: 'friends' } })
  } catch (error) {
    sendError(res, error, 'Error accepting friend request')
  }
}

/**
 * Decline, cancel, or unfriend, depending on the current relationship.
 *
 * @param {import('express').Request} req - `params.id` is the other user's id.
 * @param {import('express').Response} res - 200 `{ data: { result, relationship: 'none' } }`, 404, or 500.
 * @returns {Promise<void>}
 */
export const removeFriend = async (req, res) => {
  try {
    const result = await friendService.removeFriendship(req.user._id, req.params.id)
    const messages = {
      declined: 'Friend request declined.',
      cancelled: 'Friend request cancelled.',
      removed: 'Friend removed.',
    }
    res.json({ success: true, message: messages[result], data: { result, relationship: 'none' } })
  } catch (error) {
    sendError(res, error, 'Error updating friendship')
  }
}

export default { getFriends, searchUsers, sendRequest, acceptRequest, removeFriend }
