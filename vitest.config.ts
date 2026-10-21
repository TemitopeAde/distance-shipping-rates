import { defineConfig } from 'vitest/config';

// Standalone config: tests run without the Astro/Wix integrations.
export default defineConfig({
  esbuild: { jsx: 'automatic' },
  test: {
    include: ['src/**/*.test.{ts,tsx}', 'tests/**/*.test.{ts,tsx}'],
    environment: 'node',
    restoreMocks: true,
  },
});
