import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [swc.vite()],
  test: {
    clearMocks: true,
    environment: 'node',
    globals: true,
    include: ['test/**/*.e2e-spec.ts'],
    mockReset: true,
    restoreMocks: true,
    setupFiles: ['./test/setup.ts'],
    testTimeout: 10_000,
  },
});
