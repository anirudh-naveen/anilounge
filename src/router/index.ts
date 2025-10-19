import { createRouter, createWebHistory } from 'vue-router'
import Home from '@/views/Home.vue'

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
      name: 'movie-details',
      component: () => import('@/views/MovieDetails.vue'),
    },
    {
      path: '/tv/:id',
      name: 'tv-details',
      component: () => import('@/views/TVDetails.vue'),
    },
  ],
})

// Navigation guard for protected routes
router.beforeEach((to, from, next) => {
  const token = localStorage.getItem('token')

  if (to.meta.requiresAuth && !token) {
    next('/login')
  } else {
    next()
  }
})

export default router
