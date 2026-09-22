import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node', // pure-logic modules under test touch no DOM/canvas
    // Vitest 3 requires this to be set explicitly for spies to reset
    // between tests instead of silently accumulating call history.
    restoreMocks: true,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
    },
  },
})
