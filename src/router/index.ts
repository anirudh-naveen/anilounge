/**
 * router/index.ts — client-side routing (router).
 *
 * Declares catalog, auth, and protected account routes. Guards
 * `meta.requiresAuth` pages and clears catalog scroll positions when
 * navigating between top-level sections.
 */
import { createRouter, createWebHistory } from 'vue-router'
import Home from '@/views/Home.vue'
import { useAuthStore } from '@/stores/auth'
import { useContentStore } from '@/stores/content'

/**
 * Wait (briefly) until the page is tall enough to scroll to `top`, so going
 * back to a list that is still rendering lands where the user left it.
 */
const whenScrollable = (top: number, timeoutMs = 1500) =>
  new Promise<void>((resolve) => {
    const started = Date.now()
    const check = () => {
      const reachable = document.documentElement.scrollHeight - window.innerHeight >= top
      if (reachable || Date.now() - started > timeoutMs) resolve()
      else requestAnimationFrame(check)
    }
    check()
  })

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  // Back/forward returns to the saved position; other navigations leave scrolling to each view.
  async scrollBehavior(_to, _from, savedPosition) {
    if (!savedPosition) return false
    await whenScrollable(savedPosition.top)
    return savedPosition
  },
  routes: [
    {
      path: '/',
      name: 'home',
      component: Home,
    },
    {
      path: '/forum',
      name: 'forum',
      component: () => import('@/views/Forum.vue'),
    },
    {
      path: '/movies',
      name: 'movies',
      component: () => import('@/views/Movies.vue'),
    },
    {
      path: '/tv',
      name: 'tv',
      component: () => import('@/views/TVShows.vue'),
    },
    {
      path: '/search',
      name: 'search',
      component: () => import('@/views/Search.vue'),
    },
    {
      path: '/feedback',
      name: 'feedback',
      component: () => import('@/views/Feedback.vue'),
    },
    {
      path: '/watchlist',
      name: 'watchlist',
      component: () => import('@/views/Watchlist.vue'),
      meta: { requiresAuth: true },
    },
    {
      path: '/profile',
      name: 'profile',
      component: () => import('@/views/Profile.vue'),
      meta: { requiresAuth: true },
    },
    {
      path: '/friends',
      name: 'friends',
      component: () => import('@/views/Friends.vue'),
      meta: { requiresAuth: true },
    },
    {
      path: '/messages',
      name: 'messages',
      component: () => import('@/views/Messages.vue'),
      meta: { requiresAuth: true },
    },
    {
      path: '/u/:username',
      name: 'publicProfile',
      component: () => import('@/views/Profile.vue'),
    },
    {
      path: '/settings',
      name: 'settings',
      component: () => import('@/views/Settings.vue'),
      meta: { requiresAuth: true },
    },
    {
      path: '/import',
      name: 'import',
      component: () => import('@/views/Import.vue'),
      meta: { requiresAuth: true },
    },
    {
      path: '/admin',
      name: 'admin',
      component: () => import('@/views/Admin.vue'),
      // Admins get every tab; developers only Content (the server enforces both).
      meta: { requiresAuth: true, requiresContentEditor: true },
    },
    {
      path: '/login',
      name: 'login',
      component: () => import('@/views/Login.vue'),
    },
    {
      path: '/verify-email',
      name: 'verifyEmail',
      component: () => import('@/views/VerifyEmail.vue'),
    },
    {
      path: '/unlock-account',
      name: 'unlockAccount',
      component: () => import('@/views/UnlockAccount.vue'),
    },
    {
      path: '/register',
      name: 'register',
      component: () => import('@/views/Register.vue'),
    },
    {
      path: '/movie/:id',
      name: 'MovieDetails',
      component: () => import('@/views/MovieDetails.vue'),
    },
    {
      path: '/tv-show/:id',
      name: 'TVShowDetails',
      component: () => import('@/views/TVShowDetails.vue'),
    },
    {
      path: '/character/:id',
      name: 'CharacterDetails',
      component: () => import('@/views/CharacterDetails.vue'),
    },
    {
      path: '/voice-actor/:id',
      name: 'VoiceActorDetails',
      component: () => import('@/views/VoiceActorDetails.vue'),
    },
    {
      path: '/studio/:id',
      name: 'StudioDetails',
      component: () => import('@/views/StudioDetails.vue'),
    },
  ],
})

/**
 * Route guard. Restores the session once, then redirects unauthenticated users away
 * from `meta.requiresAuth` routes.
 *
 * @param to - Target location
 */
router.beforeEach(async (to) => {
  const authStore = useAuthStore()

  // Wait for the session cookie check so a signed-in reload is not bounced to /login.
  await authStore.restoreSession()

  if (to.meta.requiresAuth && !authStore.isAuthenticated) {
    return '/login'
  }

  if (to.meta.requiresContentEditor && !authStore.canEditContent) {
    // Re-check with the server in case the role or badges changed since sign-in.
    await authStore.loadUser().catch(() => {})
    if (!authStore.canEditContent) return '/'
  }
})

router.afterEach((to, from) => {
  // Clear scroll positions when navigating to different main sections
  // This ensures scroll positions are only preserved for back navigation
  const mainSections = ['/', '/forum', '/movies', '/tv', '/search', '/watchlist', '/feedback']
  const isFromMainSection = mainSections.includes(from.path)
  const isToMainSection = mainSections.includes(to.path)

  if (isFromMainSection && isToMainSection && from.path !== to.path) {
    // User navigated directly between main sections, clear all scroll positions
    const contentStore = useContentStore()
    contentStore.clearAllScrollPositions()
  }
})

export default router
