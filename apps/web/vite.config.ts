import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'node:url';
import { defineConfig, loadEnv } from 'vite';
import { normalizeApiBaseUrl } from './src/lib/api-base-url.ts';
import { resolveDevApiProxyTarget } from './src/lib/dev-api-proxy-target.ts';

const webRoot = fileURLToPath(new URL('.', import.meta.url));

export default defineConfig(({ mode }) => {
  const fileEnvironment = loadEnv(mode, webRoot, ['ALFRED_', 'VITE_']);
  normalizeApiBaseUrl(process.env.VITE_API_URL ?? fileEnvironment.VITE_API_URL);

  return {
    plugins: [react(), tailwindcss()],
    envPrefix: 'VITE_',
    server: {
      host: '127.0.0.1',
      port: 5173,
      strictPort: true,
      forwardConsole: true,
      proxy: {
        '/api': {
          changeOrigin: true,
          target: resolveDevApiProxyTarget(
            process.env.ALFRED_DEV_API_PROXY_TARGET,
            fileEnvironment.ALFRED_DEV_API_PROXY_TARGET,
          ),
        },
      },
    },
    preview: {
      host: '0.0.0.0',
      port: 4173,
      strictPort: true,
    },
    resolve: {
      alias: {
        '@': fileURLToPath(new URL('./src', import.meta.url)),
      },
      dedupe: ['react', 'react-dom'],
    },
    optimizeDeps: {
      include: ['react', 'react-dom/client'],
    },
    build: {
      target: 'es2022',
      sourcemap: false,
      reportCompressedSize: true,
      rolldownOptions: {
        output: {
          manualChunks: (id) => {
            if (id.includes('/node_modules/react') || id.includes('/node_modules/react-dom')) {
              return 'react-vendor';
            }

            return undefined;
          },
        },
      },
    },
  };
});
