import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [swc.vite()],
  test: {
    clearMocks: true,
    globals: true,
    coverage: {
      exclude: [
        '**/*.d.ts',
        '**/*.decorator.ts',
        '**/*.dto.ts',
        '**/*.entity.ts',
        '**/*.module.ts',
        '**/*.spec.ts',
        '**/*.test.ts',
        'dist/**',
        'src/database/data-source.ts',
        'src/database/migrations/**',
        'src/database/run-migrations.ts',
        'src/main.ts',
        'test/**',
      ],
      include: ['src/**/*.ts'],
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
    include: ['test/**/*.spec.ts'],
    mockReset: true,
    restoreMocks: true,
    setupFiles: ['./test/setup.ts'],
    testTimeout: 10_000,
  },
});
