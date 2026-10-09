/**
 * router/index.ts — client-side routing (router).
 *
 * Declares catalog, auth, and protected account routes. Detail pages take an optional
 * readable `:slug` before the id (`/tv-show/the-simpsons/<id>`, utils/slug.ts); only the
 * id picks the page. Guards
 * `meta.requiresAuth` pages and clears catalog scroll positions when
 * navigating between top-level sections.
 */
import { createRouter, createWebHistory, type RouteRecordRaw } from 'vue-router'
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

/**
 * Catalog and post ids (Postgres UUID, or a legacy 24-hex Mongo id). Detail URLs are
 * `/<kind>/<slug>/<id>`; the id pattern is what lets the optional slug come first.
 */
const CATALOG_ID =
  '[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}|[0-9a-fA-F]{24}'

/** Detail pages: path prefix and route name. */
const DETAIL_ROUTES: Array<[string, string]> = [
  ['/forum/post', 'forumPost'],
  ['/movie', 'MovieDetails'],
  ['/tv-show', 'TVShowDetails'],
  ['/character', 'CharacterDetails'],
  ['/voice-actor', 'VoiceActorDetails'],
  ['/franchise', 'FranchiseDetails'],
  ['/studio', 'StudioDetails'],
]

/** Older `/<kind>/<id>/<slug>` links open the same page at its `/<kind>/<slug>/<id>` URL. */
const legacySlugRoutes: RouteRecordRaw[] = DETAIL_ROUTES.map(([prefix, name]) => ({
  path: `${prefix}/:id(${CATALOG_ID})/:legacySlug`,
  redirect: (to) => ({ name, params: { id: to.params.id }, query: to.query, hash: to.hash }),
}))

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
      path: `/forum/post/:slug?/:id(${CATALOG_ID})`,
      name: 'forumPost',
      component: () => import('@/views/ForumPost.vue'),
    },
    {
      path: '/movies',
      name: 'movies',
      component: () => import('@/views/CatalogPage.vue'),
      props: { kind: 'movie' },
    },
    {
      path: '/tv',
      name: 'tv',
      component: () => import('@/views/CatalogPage.vue'),
      props: { kind: 'tv' },
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
      path: '/inbox',
      name: 'inbox',
      component: () => import('@/views/Inbox.vue'),
      meta: { requiresAuth: true },
    },
    {
      // Messages live in the Friends page's Messages tab.
      path: '/messages',
      redirect: (to) => ({ name: 'friends', query: to.query }),
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
      path: '/connections',
      name: 'connections',
      component: () => import('@/views/Connections.vue'),
      meta: { requiresAuth: true },
    },
    // Old Import page; keeps bookmarks and in-flight returns working.
    { path: '/import', redirect: (to) => ({ path: '/connections', query: to.query }) },
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
      path: `/movie/:slug?/:id(${CATALOG_ID})`,
      name: 'MovieDetails',
      component: () => import('@/views/MovieDetails.vue'),
    },
    {
      path: `/tv-show/:slug?/:id(${CATALOG_ID})`,
      name: 'TVShowDetails',
      component: () => import('@/views/TVShowDetails.vue'),
    },
    {
      path: `/character/:slug?/:id(${CATALOG_ID})`,
      name: 'CharacterDetails',
      component: () => import('@/views/CharacterDetails.vue'),
    },
    {
      path: `/voice-actor/:slug?/:id(${CATALOG_ID})`,
      name: 'VoiceActorDetails',
      component: () => import('@/views/VoiceActorDetails.vue'),
    },
    {
      path: `/franchise/:slug?/:id(${CATALOG_ID})`,
      name: 'FranchiseDetails',
      component: () => import('@/views/FranchiseDetails.vue'),
    },
    {
      path: `/studio/:slug?/:id(${CATALOG_ID})`,
      name: 'StudioDetails',
      component: () => import('@/views/StudioDetails.vue'),
    },
    ...legacySlugRoutes,
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
