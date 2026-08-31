import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [swc.vite()],
  test: {
    clearMocks: true,
    globals: true,
    coverage: {
      exclude: ['**/*.d.ts', '**/*.spec.ts', '**/*.test.ts', 'dist/**', 'test/**'],
      provider: 'v8',
      reporter: ['text', 'json-summary', 'lcov', 'html'],
      reportsDirectory: 'coverage',
      thresholds: {
        branches: 80,
        functions: 80,
        lines: 80,
        statements: 80,
      },
    },
    environment: 'node',
    include: ['test/**/*.spec.ts', 'test/**/*.e2e-spec.ts'],
    mockReset: true,
    restoreMocks: true,
    setupFiles: ['./test/setup.ts'],
    testTimeout: 10_000,
  },
});
