/**
 * Public and authenticated REST routes for catalog, auth, watchlist, and feedback.
 *
 * Layer: router. Validators and middleware are stacked here; handlers live in
 * controllers. `authMiddleware` applies to every route declared after it.
 */

import express from 'express'
import { body } from 'express-validator'
import contentController from '../controllers/contentController.js'
import entityController from '../controllers/entityController.js'
import homeController from '../controllers/homeController.js'
import profileController from '../controllers/profileController.js'
import securityController from '../controllers/securityController.js'
import * as authController from '../controllers/authController.js'
import * as feedbackController from '../controllers/feedbackController.js'
import authMiddleware, {
  optionalAuthenticate,
  refreshAccessToken,
  revokeRefreshToken,
} from '../middleware/auth.js'
import upload, { handleUploadError } from '../middleware/upload.js'
import { bruteForceProtection } from '../middleware/antiBot.js'
import { validateObjectId } from '../middleware/security.js'
import { isCatalogId } from '../db/ids.js'

const router = express.Router()

/** 3-20 characters; letters, numbers, dot, dash, underscore (matches the DB length check). */
const USERNAME_PATTERN = /^[A-Za-z0-9_.-]{3,20}$/

/** Public credential routes (must stay above `authMiddleware`). Password rules match registration. */
router.post(
  '/auth/register',
  [
    body('username')
      .matches(USERNAME_PATTERN)
      .withMessage('Username must be 3-20 letters, numbers, dots, dashes, or underscores'),
    body('email').isEmail().withMessage('Valid email is required'),
    body('password')
      .isLength({ min: 8, max: 128 })
      .withMessage('Password must be 8-128 characters')
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

/** Email verification, lockout unlock, and the 2FA login step (public; codes are attempt-limited). */
router.post(
  '/auth/verify-email',
  [body('email').isEmail(), body('code').isString()],
  authController.verifyEmail,
)
router.post('/auth/resend-verification', [body('email').isEmail()], authController.resendVerification)
router.post('/auth/unlock', [body('email').isEmail(), body('code').isString()], authController.unlockAccount)
router.post(
  '/auth/2fa/verify',
  [body('challengeToken').isString(), body('code').isString()],
  authController.verifyTwoFactorLogin,
)

/** Session cookie refresh and logout; no access JWT required (cookie + X-Requested-With). */
router.post('/auth/refresh', refreshAccessToken)
router.post('/auth/revoke', revokeRefreshToken)

/** Catalog reads: list, search, stats, episodes, and relationship lookups. */
router.get('/content', contentController.getContent)
router.get('/popular', contentController.getPopularContent)
router.get('/search', contentController.searchContent)
router.get('/stats', contentController.getDatabaseStats)
router.get('/content/:id', validateObjectId, contentController.getContentById)
router.get('/content/:id/episodes', validateObjectId, contentController.getContentEpisodes)
router.get('/content/:id/characters', validateObjectId, entityController.getContentCharacters)
router.get('/content/:id/voice-actors', validateObjectId, entityController.getContentVoiceActors)
router.get('/entities', entityController.searchCatalogEntities)
router.get(
  '/entities/:id',
  validateObjectId,
  optionalAuthenticate,
  entityController.getEntityById,
)
router.get('/content/external/:id', contentController.getContentByExternalId)
router.get('/content/:id/similar', validateObjectId, contentController.getSimilarContent)
router.get('/content/:contentId/related', validateObjectId, contentController.getRelatedContent)
router.get('/franchise/:franchiseName', contentController.getFranchiseContent)

/** Homepage sections. Release updates use the watchlist when a token is present. */
router.get('/home/updates', optionalAuthenticate, homeController.getUpdates)
router.get('/home/character-of-the-day', homeController.getCharacterOfTheDay)

/** Gemini-backed search and chat. Optional auth personalizes from watchlist/preferences. */
router.post(
  '/ai-search',
  optionalAuthenticate,
  [body('query').notEmpty().withMessage('Search query is required')],
  contentController.aiSearch,
)

router.post(
  '/ai/chat',
  optionalAuthenticate,
  [
    body('message')
      .isString()
      .trim()
      .notEmpty()
      .withMessage('Message is required')
      .isLength({ max: 2000 })
      .withMessage('Message must be 2000 characters or fewer'),
    body('history').optional().isArray({ max: 20 }),
    body('history.*.role').optional().isIn(['user', 'model', 'bot']),
    body('history.*.text').optional().isString().isLength({ max: 2000 }),
  ],
  contentController.aiChat,
)

/** Shareable user profile; optional auth lets owners see private profiles and hidden tabs. */
router.get('/users/:username', optionalAuthenticate, profileController.getPublicProfile)

/** Beta feedback is public and stored in-process (see feedbackController). */
router.post('/feedback', feedbackController.submitFeedback)
router.get('/feedback', feedbackController.getFeedback)

/** All routes below require a valid Bearer access token. */
router.use(authMiddleware)

/** Authenticated profile, password, and avatar. */
router.get('/auth/profile', authController.getProfile)
router.put(
  '/auth/profile',
  [
    body('preferences').optional().isObject(),
    body('username')
      .optional()
      .matches(USERNAME_PATTERN)
      .withMessage('Username must be 3-20 letters, numbers, dots, dashes, or underscores'),
    body('email').optional().isEmail().withMessage('Valid email is required'),
  ],
  authController.updateProfile,
)
router.put(
  '/auth/change-password',
  [
    body('currentPassword').notEmpty().withMessage('Current password is required'),
    body('newPassword')
      .isLength({ min: 8, max: 128 })
      .withMessage('New password must be 8-128 characters'),
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
    body('contentId')
      .custom((value) => isCatalogId(value))
      .withMessage('Valid content ID is required'),
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

/** Entity favorites (characters, voice actors, and studios). */
router.get('/favorites', entityController.getFavoriteEntities)
router.post('/entities/:id/favorite', validateObjectId, entityController.favoriteEntity)
router.delete('/entities/:id/favorite', validateObjectId, entityController.unfavoriteEntity)

/** Permanent self-service account deletion (password re-check; demo account refused). Off `/auth` for the same reason. */
router.delete(
  '/account',
  [body('password').isString().notEmpty().withMessage('Password is required')],
  authController.deleteAccount,
)

/** Account security status and authenticator-app 2FA management. */
router.get('/account/security', securityController.getSecurityStatus)
router.post('/account/sessions/revoke-all', securityController.signOutEverywhere)
router.post('/account/2fa/setup', securityController.startTwoFactorSetup)
router.post('/account/2fa/enable', [body('code').isString()], securityController.enableTwoFactor)
router.post(
  '/account/2fa/disable',
  [body('password').isString(), body('code').isString()],
  securityController.turnOffTwoFactor,
)
router.post('/account/2fa/backup-codes', [body('code').isString()], securityController.newBackupCodes)

/** Profile customization; kept off `/auth` so it is not throttled by the login limiter. */
router.put(
  '/profile/settings',
  [body('settings').optional().isObject(), body('bio').optional().isString()],
  profileController.updateProfileSettings,
)

/** Title favorites (movies, series, and specials) behind the card heart. */
router.get('/favorites/content', profileController.getFavoriteContentIds)
router.post('/content/:id/favorite', validateObjectId, profileController.toggleContentFavorite)
router.delete('/content/:id/favorite', validateObjectId, profileController.toggleContentFavorite)

/** Homepage status feed: the viewer's and accepted friends' watchlist changes. */
router.get('/home/activity', homeController.getActivity)

export default router
