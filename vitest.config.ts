import { fileURLToPath } from 'node:url'
import { mergeConfig, defineConfig, configDefaults } from 'vitest/config'
import viteConfig from './vite.config'

export default mergeConfig(
  viteConfig,
  defineConfig({
    test: {
      environment: 'jsdom',
      // backend/ uses node:test; run it with `npm test` in backend/.
      exclude: [...configDefaults.exclude, 'e2e/**', 'backend/**'],
      root: fileURLToPath(new URL('./', import.meta.url)),
    },
  }),
)
