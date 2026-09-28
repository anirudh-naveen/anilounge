/**
 * vite.config.ts — Vue/Vite app config.
 *
 * Dev server is pinned to port 5174 (`strictPort: true`) so it does not
 * collide with the portfolio on 5173. `/api` and `/uploads` are proxied to the
 * backend (VITE_API_URL's origin, default http://localhost:5001) so the app and
 * API share one origin in development, as they do in production via vercel.json.
 * That keeps the httpOnly session cookie first-party in every browser.
 */

import { fileURLToPath, URL } from 'node:url'

import { defineConfig, loadEnv } from 'vite'
import vue from '@vitejs/plugin-vue'
import vueJsx from '@vitejs/plugin-vue-jsx'
import vueDevTools from 'vite-plugin-vue-devtools'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const apiOrigin = (env.VITE_API_URL || 'http://localhost:5001').replace(/\/api\/?$/, '')
  const proxyTarget = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?\/?$/.test(apiOrigin)
    ? apiOrigin.replace(/\/$/, '')
    : 'http://localhost:5001'

  return {
    plugins: [vue(), vueJsx(), vueDevTools()],
    resolve: {
      alias: {
        '@': fileURLToPath(new URL('./src', import.meta.url)),
      },
    },
    server: {
      port: 5174,
      strictPort: true,
      proxy: {
        '/api': { target: proxyTarget, changeOrigin: false },
        '/uploads': { target: proxyTarget, changeOrigin: false },
      },
    },
  }
})
