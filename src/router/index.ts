import { createRouter, createWebHistory } from 'vue-router'
import Home from '@/views/Home.vue'
import { useAuthStore } from '@/stores/auth'

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/',
      name: 'home',
      component: Home,
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
      path: '/settings',
      name: 'settings',
      component: () => import('@/views/Settings.vue'),
      meta: { requiresAuth: true },
    },
    {
      path: '/login',
      name: 'login',
      component: () => import('@/views/Login.vue'),
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
      path: '/tv/:id',
      name: 'TVDetails',
      component: () => import('@/views/TVShowDetails.vue'),
    },
  ],
})

// Navigation guard for protected routes
router.beforeEach((to, from, next) => {
  const startTime = Date.now()
  console.log(`🧭 [${new Date().toISOString()}] Router navigation: ${from.path} → ${to.path}`)

  const authStore = useAuthStore()

  // Initialize auth if not already done
  if (!authStore.user && localStorage.getItem('token')) {
    console.log(`🔐 [${new Date().toISOString()}] Initializing auth from localStorage`)
    authStore.initAuth()
  }

  if (to.meta.requiresAuth && !authStore.isAuthenticated) {
    console.log(`🚫 [${new Date().toISOString()}] Route requires auth, redirecting to login`)
    next('/login')
  } else {
    console.log(`✅ [${new Date().toISOString()}] Route access granted`)
    next()
  }
})

router.afterEach((to, from) => {
  const endTime = Date.now()
  console.log(
    `🏁 [${new Date().toISOString()}] Router navigation completed: ${from.path} → ${to.path}`,
  )
})

export default router
