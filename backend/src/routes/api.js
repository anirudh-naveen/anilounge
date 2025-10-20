import express from 'express'
import { body } from 'express-validator'
import contentController from '../controllers/contentController.js'
import * as authController from '../controllers/authController.js'
import authMiddleware, { refreshAccessToken, revokeRefreshToken } from '../middleware/auth.js'
import upload, { handleUploadError } from '../middleware/upload.js'
import { bruteForceProtection, apiProtection } from '../middleware/antiBot.js'

const router = express.Router()

// Auth routes (public - must be before authMiddleware)
router.post(
  '/auth/register',
  [
    body('username').isLength({ min: 3 }).withMessage('Username must be at least 3 characters'),
    body('email').isEmail().withMessage('Valid email is required'),
    body('password')
      .isLength({ min: 8 })
      .withMessage('Password must be at least 8 characters')
      .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/)
      .withMessage(
        'Password must contain at least one uppercase letter, one lowercase letter, one number, and one special character',
      ),
    body('confirmPassword').custom((value, { req }) => {
      if (value !== req.body.password) {
        throw new Error('Password confirmation does not match password')
      }
      return true
    }),
  ],
  bruteForceProtection.prevent,
  authController.register,
)

router.post(
  '/auth/login',
  [
    body('email').isEmail().withMessage('Valid email is required'),
    body('password').notEmpty().withMessage('Password is required'),
  ],
  bruteForceProtection.prevent,
  authController.login,
)

// Token refresh routes (public)
router.post('/auth/refresh', refreshAccessToken)
router.post('/auth/revoke', revokeRefreshToken)

// Public routes
router.get('/content', contentController.getContent)
router.get('/popular', contentController.getPopularContent)
router.get('/search', contentController.searchContent)
router.get('/stats', contentController.getDatabaseStats)
router.get('/content/:id', contentController.getContentById)
router.get('/content/external/:id', contentController.getContentByExternalId)
router.get('/content/:id/similar', contentController.getSimilarContent)
router.get('/content/:contentId/related', contentController.getRelatedContent)
router.get('/franchise/:franchiseName', contentController.getFranchiseContent)

// AI search route
router.post(
  '/ai-search',
  [body('query').notEmpty().withMessage('Search query is required')],
  contentController.aiSearch,
)

// AI chat route
router.post(
  '/ai/chat',
  [body('message').notEmpty().withMessage('Message is required')],
  contentController.aiChat,
)

// Protected routes (require authentication)
router.use(authMiddleware)

// Auth profile routes
router.get('/auth/profile', authController.getProfile)
router.put(
  '/auth/profile',
  [body('preferences').optional().isObject()],
  authController.updateProfile,
)
router.put(
  '/auth/change-password',
  [
    body('currentPassword').notEmpty().withMessage('Current password is required'),
    body('newPassword')
      .isLength({ min: 6 })
      .withMessage('New password must be at least 6 characters'),
  ],
  authController.changePassword,
)
router.post(
  '/auth/upload-profile-picture',
  upload.single('profilePicture'),
  handleUploadError,
  authController.uploadProfilePicture,
)

// Watchlist routes
router.post(
  '/watchlist',
  [
    body('contentId').isMongoId().withMessage('Valid content ID is required'),
    body('status').optional().isIn(['plan_to_watch', 'watching', 'completed', 'dropped']),
    body('rating').optional().isFloat({ min: 0, max: 10 }),
    body('currentEpisode').optional().isInt({ min: 0 }),
    body('currentSeason').optional().isInt({ min: 1 }),
    body('totalEpisodes').optional().isInt({ min: 0 }),
    body('totalSeasons').optional().isInt({ min: 1 }),
    body('notes').optional().isString(),
  ],
  contentController.addToWatchlist,
)

router.get('/watchlist', contentController.getWatchlist)
router.delete('/watchlist/:contentId', contentController.removeFromWatchlist)
router.put(
  '/watchlist/:contentId',
  [
    body('status').optional().isIn(['plan_to_watch', 'watching', 'completed', 'dropped']),
    body('rating').optional().isFloat({ min: 0, max: 10 }),
    body('currentEpisode').optional().isInt({ min: 0 }),
    body('currentSeason').optional().isInt({ min: 1 }),
    body('totalEpisodes').optional().isInt({ min: 0 }),
    body('totalSeasons').optional().isInt({ min: 1 }),
    body('notes').optional().isString(),
  ],
  contentController.updateWatchlistItem,
)

export default router
