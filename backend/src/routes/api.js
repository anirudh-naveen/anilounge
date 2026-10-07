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
import friendController from '../controllers/friendController.js'
import messageController from '../controllers/messageController.js'
import forumController from '../controllers/forumController.js'
import inboxController from '../controllers/inboxController.js'
import emailPreferenceController from '../controllers/emailPreferenceController.js'
import watchlistImportController from '../controllers/watchlistImportController.js'
import connectionController from '../controllers/connectionController.js'
import securityController from '../controllers/securityController.js'
import * as authController from '../controllers/authController.js'
import adminOnly, { contentEditorOnly, creatorOnly } from '../middleware/adminOnly.js'
import adminController from '../controllers/adminController.js'
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
import { assertCleanLanguage } from '../utils/moderation.js'
import blockWhenMuted, { changesProfileText, changesUsername } from '../middleware/muteGuard.js'

const router = express.Router()

const WATCHLIST_STATUSES = ['plan_to_watch', 'watching', 'completed', 'on_hold', 'dropped']

/** 3-20 characters; letters, numbers, dot, dash, underscore (matches the DB length check). */
const USERNAME_PATTERN = /^[A-Za-z0-9_.-]{3,20}$/

/** Public credential routes (must stay above `authMiddleware`). Password rules match registration. */
router.post(
  '/auth/register',
  [
    body('username')
      .matches(USERNAME_PATTERN)
      .withMessage('Username must be 3-20 letters, numbers, dots, dashes, or underscores')
      .bail()
      .custom(assertCleanLanguage)
      .withMessage("Username contains language that isn't allowed on AniLounge."),
    body('email').isEmail().withMessage('Valid email is required'),
    body('password')
      .isLength({ min: 8, max: 128 })
      .withMessage('Password must be 8-128 characters')
      .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/)
      .withMessage(
        'Password must contain at least one uppercase letter, one lowercase letter, one number, and one special character',
      )
      .bail()
      .custom(assertCleanLanguage)
      .withMessage("Password contains language that isn't allowed on AniLounge."),
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
router.get('/home/forum', optionalAuthenticate, forumController.getHomeHighlights)

/** Forum reads (public; signed-in viewers also get their likes and edit rights). */
router.get('/forum/posts', optionalAuthenticate, forumController.listPosts)
router.get('/forum/posts/:id', validateObjectId, optionalAuthenticate, forumController.getPost)
router.get('/forum/tags', forumController.searchTags)
router.get('/forum/tags/:id/characters', validateObjectId, forumController.contentCharacters)
router.get('/forum/highlights/:id', validateObjectId, optionalAuthenticate, forumController.getHighlights)

/** Gemini-backed search and chat. Optional auth personalizes from watchlist/preferences. */
router.post(
  '/ai-search',
  optionalAuthenticate,
  [
    body('query')
      .notEmpty()
      .withMessage('Search query is required')
      .bail()
      .custom(assertCleanLanguage)
      .withMessage("Search contains language that isn't allowed on AniLounge."),
  ],
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
      .withMessage('Message must be 2000 characters or fewer')
      .bail()
      .custom(assertCleanLanguage)
      .withMessage("Message contains language that isn't allowed on AniLounge."),
    body('history').optional().isArray({ max: 20 }),
    body('history.*.role').optional().isIn(['user', 'model', 'bot']),
    body('history.*.text').optional().isString().isLength({ max: 2000 }),
  ],
  contentController.aiChat,
)

/** Profile pictures (stored in Postgres); public so avatars load for visitors. */
router.get('/avatars/:id', validateObjectId, profileController.getAvatarImage)

/** Shareable user profile; optional auth lets owners see private profiles and hidden tabs. */
router.get('/users/:username', optionalAuthenticate, profileController.getPublicProfile)

/** Accounts with badges, and the emblem each shows next to their name. */
router.get('/badges', profileController.listBadges)

/** Anyone can submit beta feedback (stored and emailed); only admins can list it (it holds emails). */
router.post('/feedback', optionalAuthenticate, feedbackController.submitFeedback)
router.get('/feedback', authMiddleware, adminOnly, feedbackController.getFeedback)

/** All routes below require a valid Bearer access token. */
router.use(authMiddleware)

/** Authenticated profile, password, and avatar. */
router.get('/auth/profile', authController.getProfile)
router.put(
  '/auth/profile',
  blockWhenMuted(changesUsername),
  [
    body('preferences').optional().isObject(),
    body('username')
      .optional()
      .matches(USERNAME_PATTERN)
      .withMessage('Username must be 3-20 letters, numbers, dots, dashes, or underscores')
      .bail()
      .custom(assertCleanLanguage)
      .withMessage("Username contains language that isn't allowed on AniLounge."),
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
      .withMessage('New password must be 8-128 characters')
      .bail()
      .custom(assertCleanLanguage)
      .withMessage("Password contains language that isn't allowed on AniLounge."),
  ],
  authController.changePassword,
)
router.post(
  '/auth/upload-profile-picture',
  blockWhenMuted(),
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
    body('status').optional().isIn(WATCHLIST_STATUSES),
    body('rating').optional().isFloat({ min: 0, max: 10 }),
    body('currentEpisode').optional().isInt({ min: 0 }),
    body('currentSeason').optional().isInt({ min: 1 }),
    body('totalEpisodes').optional().isInt({ min: 0 }),
    body('totalSeasons').optional().isInt({ min: 1 }),
    body('notes').optional().isString(),
    body('startedOn').optional({ values: 'null' }).isISO8601({ strict: true }),
    body('completedOn').optional({ values: 'null' }).isISO8601({ strict: true }),
    body('rewatchCount').optional().isInt({ min: 0, max: 999 }),
  ],
  contentController.addToWatchlist,
)

router.get('/watchlist', contentController.getWatchlist)
router.delete('/watchlist/:contentId', validateObjectId, contentController.removeFromWatchlist)
router.put(
  '/watchlist/:contentId',
  [
    validateObjectId,
    body('status').optional().isIn(WATCHLIST_STATUSES),
    body('rating').optional().isFloat({ min: 0, max: 10 }),
    body('currentEpisode').optional().isInt({ min: 0 }),
    body('currentSeason').optional().isInt({ min: 1 }),
    body('totalEpisodes').optional().isInt({ min: 0 }),
    body('totalSeasons').optional().isInt({ min: 1 }),
    body('notes').optional().isString(),
    body('startedOn').optional({ values: 'null' }).isISO8601({ strict: true }),
    body('completedOn').optional({ values: 'null' }).isISO8601({ strict: true }),
    body('rewatchCount').optional().isInt({ min: 0, max: 999 }),
  ],
  contentController.updateWatchlistItem,
)

/**
 * Import from connected AniList / MyAnimeList / TMDB accounts, or AniList and MyAnimeList
 * by username or export file, in one polled job; titles the sources disagree on wait in
 * /conflicts for the user to pick.
 */
router.get('/watchlist/import', watchlistImportController.getImport)
router.post(
  '/watchlist/import',
  [
    body('sources').isArray({ min: 1, max: 3 }).withMessage('Enter at least one username to import'),
    body('sources.*.source')
      .isIn(['anilist', 'mal', 'mal_file', 'tmdb'])
      .withMessage('Choose AniList, MyAnimeList, or TMDB'),
    body('sources.*.connected').optional().isBoolean(),
    body('sources.*.username').optional().isString().isLength({ max: 30 }),
    body('sources.*.file').optional().isObject(),
    body('addMissing').optional().isBoolean(),
  ],
  watchlistImportController.startImport,
)
router.get('/watchlist/import/conflicts', watchlistImportController.getConflicts)
router.post(
  '/watchlist/import/conflicts',
  [
    body('choices').isArray({ min: 1, max: 5000 }).withMessage('Choose a version for a title'),
    body('choices.*.contentId').custom((value) => isCatalogId(value)),
    body('choices.*.choice').isString().isLength({ max: 40 }),
  ],
  watchlistImportController.resolveConflicts,
)

/**
 * Connections: link AniList / MyAnimeList / TMDB accounts. Linked accounts receive
 * watchlist changes, and AniList / MyAnimeList changes are pulled back.
 */
router.get('/connections', connectionController.list)
router.post(
  '/connections/:provider(anilist|mal|tmdb)/start',
  [body('redirectTo').optional().isString().isLength({ max: 500 })],
  connectionController.start,
)
router.post(
  '/connections/:provider(anilist|mal|tmdb)/callback',
  [
    body('code').optional().isString().isLength({ max: 4000 }),
    body('state').optional().isString().isLength({ max: 200 }),
    body('requestToken').optional().isString().isLength({ max: 200 }),
  ],
  connectionController.callback,
)
router.post('/connections/:provider(anilist|mal)/sync', connectionController.sync)
router.delete('/connections/:provider(anilist|mal|tmdb)', connectionController.remove)

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
router.delete('/account/profile-picture', authController.removeProfilePicture)
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

/** Optional email categories (announcements, friend requests); account emails always send. */
router.get('/account/email-preferences', emailPreferenceController.getPreferences)
router.put(
  '/account/email-preferences',
  [body('announcements').optional().isBoolean(), body('friend_requests').optional().isBoolean()],
  emailPreferenceController.updatePreferences,
)

/** Profile customization; kept off `/auth` so it is not throttled by the login limiter. */
router.put(
  '/profile/settings',
  blockWhenMuted(changesProfileText),
  [body('settings').optional().isObject(), body('bio').optional().isString()],
  profileController.updateProfileSettings,
)

/** Which badge shows as the emblem next to your name (null = your highest, 'none'). */
router.put('/profile/featured-badge', profileController.updateFeaturedBadge)

/** Title favorites (movies, series, and specials) behind the card heart. */
router.get('/favorites/content', profileController.getFavoriteContentIds)
router.post('/content/:id/favorite', validateObjectId, profileController.toggleContentFavorite)
router.delete('/content/:id/favorite', validateObjectId, profileController.toggleContentFavorite)

/** Homepage status feed: the viewer's and accepted friends' watchlist changes. */
router.get('/home/activity', homeController.getActivity)

/** Friends and friend requests. `:id` is the other user's id. */
router.get('/friends', friendController.getFriends)
router.get('/friends/search', friendController.searchUsers)
router.post('/friends/requests', blockWhenMuted(), friendController.sendRequest)
router.post('/friends/requests/:id/accept', validateObjectId, friendController.acceptRequest)
router.delete('/friends/:id', validateObjectId, friendController.removeFriend)

/** Settings → Communication (allow profanity in private messages). */
router.get('/account/communication', messageController.getCommunicationSettings)
router.put('/account/communication', messageController.updateCommunicationSettings)

/** Direct messages between friends. `:id` is the other user's id. */
router.get('/messages', messageController.getConversations)
router.get('/messages/unread', messageController.getUnreadCount)
router.get('/messages/:id', validateObjectId, messageController.getThread)
router.post('/messages/:id', validateObjectId, blockWhenMuted(), messageController.sendMessage)

/** Profile-menu inbox: notifications, site news, and the import clash count. */
router.get('/inbox', inboxController.getInbox)
router.get('/inbox/unread', inboxController.getUnread)
router.post('/inbox/read', inboxController.markRead)

/** Forum writes. `:id` is a post id (or a comment id under /forum/comments). */
router.post('/forum/posts', blockWhenMuted(), forumController.createPost)
router.patch('/forum/posts/:id', validateObjectId, blockWhenMuted(), forumController.updatePost)
router.delete('/forum/posts/:id', validateObjectId, forumController.deletePost)
router.put('/forum/posts/:id/like', validateObjectId, forumController.likePost)
router.delete('/forum/posts/:id/like', validateObjectId, forumController.unlikePost)
router.post(
  '/forum/posts/:id/comments',
  validateObjectId,
  blockWhenMuted(),
  forumController.createComment,
)
router.patch('/forum/comments/:id', validateObjectId, blockWhenMuted(), forumController.updateComment)
router.delete('/forum/comments/:id', validateObjectId, forumController.deleteComment)
router.put('/forum/comments/:id/like', validateObjectId, forumController.likeComment)
router.delete('/forum/comments/:id/like', validateObjectId, forumController.unlikeComment)

/**
 * Admin page. Catalog content (edit rows, links, cast order): admins and developers.
 * Everything else: admins (mute, badges, log); creator only for admins and bans.
 */
router.get('/admin/content', contentEditorOnly, adminController.searchContent)
router.get('/admin/content/:id', contentEditorOnly, validateObjectId, adminController.getContent)
router.patch(
  '/admin/content/:id',
  contentEditorOnly,
  validateObjectId,
  [body('changes').optional().isObject(), body('unlock').optional().isArray({ max: 20 })],
  adminController.updateContent,
)
router.post(
  '/admin/links/:op(add|remove)',
  contentEditorOnly,
  [body('link').isObject(), body('editorId').isString()],
  adminController.changeLink,
)
router.put('/admin/links/role', contentEditorOnly, adminController.setAppearanceRole)
router.put(
  '/admin/content/:id/cast-order',
  contentEditorOnly,
  validateObjectId,
  [body('characterIds').isArray({ max: 500 })],
  adminController.reorderCast,
)
router.get('/admin/log', adminOnly, adminController.getLog)
router.get('/admin/sync-changes', adminOnly, adminController.listSyncChanges)
router.get('/admin/sync-changes/count', adminOnly, adminController.countSyncChanges)
router.post(
  '/admin/sync-changes/:action(revert|apply|dismiss)',
  adminOnly,
  [body('ids').isArray({ min: 1, max: 100 })],
  adminController.resolveSyncChanges,
)
router.get('/admin/users', adminOnly, adminController.listUsers)
router.put(
  '/admin/users/:id/role',
  creatorOnly,
  validateObjectId,
  [body('role').isIn(['user', 'admin'])],
  adminController.setUserRole,
)
router.put(
  '/admin/users/:id/cosmetic-roles',
  adminOnly,
  validateObjectId,
  [body('roles').isArray({ max: 3 })],
  adminController.setCosmeticRoles,
)
router.post(
  '/admin/users/:id/mute',
  adminOnly,
  validateObjectId,
  [body('duration').isString(), body('reason').optional().isString()],
  adminController.muteUser,
)
router.post(
  '/admin/users/:id/ban',
  creatorOnly,
  validateObjectId,
  [body('banned').isBoolean(), body('reason').optional().isString()],
  adminController.setBan,
)

export default router
