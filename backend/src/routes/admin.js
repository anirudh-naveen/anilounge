/**
 * Admin HTTP routes for IP-ban inspection and manual ban/unban.
 *
 * Layer: router. Every path requires `authMiddleware`. Handlers call helpers
 * from `ipBan` middleware rather than talking to Mongo directly.
 */

import express from 'express'
import authMiddleware from '../middleware/auth.js'
import { manuallyBanIP, unbanIP, getBanStats, getActiveBans } from '../middleware/ipBan.js'

const router = express.Router()

/** Every admin route requires a valid Bearer token. */
router.use(authMiddleware)

/**
 * Return aggregate IP-ban counts from the ban collection.
 *
 * @param {import('express').Request} req - Authenticated admin request (user unused).
 * @param {import('express').Response} res - 200 `{ data: { stats } }` or 500.
 * @returns {Promise<void>}
 */
router.get('/ban-stats', async (req, res) => {
  try {
    const stats = await getBanStats()
    res.json({
      success: true,
      data: { stats },
    })
  } catch (error) {
    console.error('Error getting ban stats:', error)
    res.status(500).json({
      success: false,
      message: 'Error retrieving ban statistics',
    })
  }
})

/**
 * List currently active, unexpired IP bans, newest first.
 *
 * @param {import('express').Request} req - Authenticated admin request (user unused).
 * @param {import('express').Response} res - 200 `{ data: { bans } }` or 500.
 * @returns {Promise<void>}
 */
router.get('/active-bans', async (req, res) => {
  try {
    const bans = await getActiveBans()
    res.json({
      success: true,
      data: { bans },
    })
  } catch (error) {
    console.error('Error getting active bans:', error)
    res.status(500).json({
      success: false,
      message: 'Error retrieving active bans',
    })
  }
})

/**
 * Ban an IP for `duration` ms (or the default manual window) with an optional reason.
 *
 * @param {import('express').Request} req - `body.ip` required; `body.reason`, `body.duration` optional.
 * @param {import('express').Response} res - 200 `{ data: { ban } }`, 400 if ip missing, or 500.
 * @returns {Promise<void>}
 */
router.post('/ban-ip', async (req, res) => {
  try {
    const { ip, reason = 'manual', duration } = req.body

    if (!ip) {
      return res.status(400).json({
        success: false,
        message: 'IP address is required',
      })
    }

    const ban = await manuallyBanIP(ip, reason, duration)

    res.json({
      success: true,
      message: `IP ${ip} has been banned`,
      data: { ban },
    })
  } catch (error) {
    console.error('Error manually banning IP:', error)
    res.status(500).json({
      success: false,
      message: 'Error banning IP address',
    })
  }
})

/**
 * Clear an active ban for the given IP.
 *
 * @param {import('express').Request} req - `body.ip` required.
 * @param {import('express').Response} res - 200 on success, 400 if ip missing, or 500.
 * @returns {Promise<void>}
 */
router.post('/unban-ip', async (req, res) => {
  try {
    const { ip } = req.body

    if (!ip) {
      return res.status(400).json({
        success: false,
        message: 'IP address is required',
      })
    }

    await unbanIP(ip)

    res.json({
      success: true,
      message: `IP ${ip} has been unbanned`,
    })
  } catch (error) {
    console.error('Error unbanning IP:', error)
    res.status(500).json({
      success: false,
      message: 'Error unbanning IP address',
    })
  }
})

export default router
