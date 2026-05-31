import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    exclude: ['web/**', 'node_modules/**', 'dist/**', 'test/web/e2e.test.ts'],
  },
})
