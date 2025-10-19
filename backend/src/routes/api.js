import express from 'express'
import { body } from 'express-validator'
import { authenticateToken } from '../middleware/auth.js'
import * as authController from '../controllers/authController.js'
import * as contentController from '../controllers/contentController.js'

const router = express.Router()

// User registration
router.post(
  '/auth/register',
  [
    body('username')
      .isLength({ min: 3, max: 30 })
      .withMessage('Username must be between 3 and 30 characters')
      .matches(/^[a-zA-Z0-9_]+$/)
      .withMessage('Username can only contain letters, numbers, and underscores'),
    body('email').isEmail().withMessage('Please provide a valid email').normalizeEmail(),
    body('password')
      .isLength({ min: 6 })
      .withMessage('Password must be at least 6 characters long'),
  ],
  authController.register,
)

// User login
router.post(
  '/auth/login',
  [
    body('email').isEmail().withMessage('Please provide a valid email').normalizeEmail(),
    body('password').notEmpty().withMessage('Password is required'),
  ],
  authController.login,
)

router.get('/auth/profile', authenticateToken, authController.getProfile)
router.put('/auth/profile', authenticateToken, authController.updateProfile)

// Obtaining user content routes (public)
router.get('/content/movies', contentController.getAnimatedMovies)
router.get('/content/tv', contentController.getAnimatedTVShows)
router.get('/content/search', contentController.searchContent)
router.get('/content/:id', contentController.getContentDetails)

// User-specific content routes (require authentication)
router.post('/user/watchlist', authenticateToken, contentController.addToWatchlist)
router.put('/user/watchlist/:contentId', authenticateToken, contentController.updateWatchlistItem)
router.delete(
  '/user/watchlist/:contentId',
  authenticateToken,
  contentController.removeFromWatchlist,
)
router.post(
  '/user/rate',
  authenticateToken,
  [
    body('contentId').isMongoId().withMessage('Valid content ID is required'),
    body('rating').isInt({ min: 1, max: 10 }).withMessage('Rating must be between 1 and 10'),
    body('review')
      .optional()
      .isLength({ max: 500 })
      .withMessage('Review cannot exceed 500 characters'),
  ],
  contentController.rateContent,
)

export default router
