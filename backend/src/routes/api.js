/**
 * Public and authenticated REST routes for catalog, auth, watchlist, and feedback.
 *
 * Layer: router. Validators and middleware are stacked here; handlers live in
 * controllers. `authMiddleware` applies to every route declared after it.
 */

import express from 'express'
import { body } from 'express-validator'
import contentController from '../controllers/contentController.js'
import * as authController from '../controllers/authController.js'
import * as feedbackController from '../controllers/feedbackController.js'
import authMiddleware, { refreshAccessToken, revokeRefreshToken } from '../middleware/auth.js'
import upload, { handleUploadError } from '../middleware/upload.js'
import { bruteForceProtection } from '../middleware/antiBot.js'
import { validateObjectId } from '../middleware/security.js'

const router = express.Router()

/** Public credential routes (must stay above `authMiddleware`). Password rules match registration. */
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
    body('confirmPassword').custom(
      /**
       * Reject registration when confirmPassword does not equal password.
       *
       * @param {string} value - `body.confirmPassword`.
       * @param {{ req: import('express').Request }} meta - Reads `req.body.password`.
       * @returns {true} When the two password fields match.
       */
      (value, { req }) => {
        if (value !== req.body.password) {
          throw new Error('Password confirmation does not match password')
        }
        return true
      },
    ),
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

/** Public token rotation; no access JWT required. */
router.post('/auth/refresh', refreshAccessToken)
router.post('/auth/revoke', revokeRefreshToken)

/** Catalog reads: list, search, stats, episodes, and relationship lookups. */
router.get('/content', contentController.getContent)
router.get('/popular', contentController.getPopularContent)
router.get('/search', contentController.searchContent)
router.get('/stats', contentController.getDatabaseStats)
router.get('/content/:id', validateObjectId, contentController.getContentById)
router.get('/content/:id/episodes', validateObjectId, contentController.getContentEpisodes)
router.get('/content/external/:id', contentController.getContentByExternalId)
router.get('/content/:id/similar', validateObjectId, contentController.getSimilarContent)
router.get('/content/:contentId/related', validateObjectId, contentController.getRelatedContent)
router.get('/franchise/:franchiseName', contentController.getFranchiseContent)

/** Gemini-backed search and chat. */
router.post(
  '/ai-search',
  [body('query').notEmpty().withMessage('Search query is required')],
  contentController.aiSearch,
)

router.post(
  '/ai/chat',
  [body('message').notEmpty().withMessage('Message is required')],
  contentController.aiChat,
)

/** Beta feedback is public and stored in-process (see feedbackController). */
router.post('/feedback', feedbackController.submitFeedback)
router.get('/feedback', feedbackController.getFeedback)

/** All routes below require a valid Bearer access token. */
router.use(authMiddleware)

/** Authenticated profile, password, and avatar. */
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

/** Watchlist CRUD; status/rating/episode fields are optional on write. */
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
router.delete('/watchlist/:contentId', validateObjectId, contentController.removeFromWatchlist)
router.put(
  '/watchlist/:contentId',
  [
    validateObjectId,
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

/** User rating writes (1–10) and the current user's stored rating. */
router.post(
  '/content/:contentId/vote',
  [
    validateObjectId,
    body('rating')
      .isFloat({ min: 1, max: 10 })
      .withMessage('Rating must be between 1 and 10'),
  ],
  contentController.voteContent,
)

router.get('/content/:contentId/my-rating', validateObjectId, contentController.getMyRating)

export default router
