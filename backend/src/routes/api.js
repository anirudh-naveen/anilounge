import express from 'express'
import { body } from 'express-validator'
import contentController from '../controllers/contentController.js'
import * as authController from '../controllers/authController.js'
import authMiddleware from '../middleware/auth.js'

const router = express.Router()

// Public routes
router.get('/content', contentController.getContent)
router.get('/content/:id', contentController.getContentById)
router.get('/content/external/:id', contentController.getContentByExternalId)
router.get('/search', contentController.searchContent)
router.get('/popular', contentController.getPopularContent)
router.get('/content/:id/similar', contentController.getSimilarContent)
router.get('/stats', contentController.getDatabaseStats)

// AI search route
router.post('/ai-search', [
  body('query').notEmpty().withMessage('Search query is required')
], contentController.aiSearch)

// Protected routes (require authentication)
router.use(authMiddleware)

// Watchlist routes
router.post('/watchlist', [
  body('contentId').isMongoId().withMessage('Valid content ID is required'),
  body('status').optional().isIn(['plan_to_watch', 'watching', 'completed', 'dropped']),
  body('rating').optional().isFloat({ min: 0, max: 10 }),
  body('currentEpisode').optional().isInt({ min: 0 }),
  body('totalEpisodes').optional().isInt({ min: 0 }),
  body('notes').optional().isString()
], contentController.addToWatchlist)

router.get('/watchlist', contentController.getWatchlist)
router.delete('/watchlist/:contentId', contentController.removeFromWatchlist)
router.put('/watchlist/:contentId', [
  body('status').optional().isIn(['plan_to_watch', 'watching', 'completed', 'dropped']),
  body('rating').optional().isFloat({ min: 0, max: 10 }),
  body('currentEpisode').optional().isInt({ min: 0 }),
  body('totalEpisodes').optional().isInt({ min: 0 }),
  body('notes').optional().isString()
], contentController.updateWatchlistItem)

export default router