import swc from 'unplugin-swc';
import { resolve } from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [swc.vite()],
  resolve: {
    alias: {
      '@api': resolve(process.cwd(), 'src'),
    },
  },
  test: {
    clearMocks: true,
    environment: 'node',
    globals: true,
    include: ['test/e2e/**/*.e2e-spec.ts', 'test/integration/**/*.postgres.spec.ts'],
    mockReset: true,
    restoreMocks: true,
    setupFiles: ['./test/support/setup.ts'],
    testTimeout: 10_000,
  },
});
