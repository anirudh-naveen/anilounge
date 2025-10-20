import express from 'express'
import authMiddleware from '../middleware/auth.js'
import { manuallyBanIP, unbanIP, getBanStats, getActiveBans } from '../middleware/ipBan.js'

const router = express.Router()

// Admin-only routes for IP ban management
router.use(authMiddleware) // Require authentication

// Get ban statistics
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

// Get all active bans
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

// Manually ban an IP
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

// Unban an IP
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
