import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'node:url';
import { defineConfig, loadEnv } from 'vite';
import { resolveDevApiProxyTarget } from './src/app/config/dev-api-proxy-target.ts';
import { normalizeApiBaseUrl } from './src/services/http/api-base-url.ts';

const webRoot = fileURLToPath(new URL('.', import.meta.url));

export default defineConfig(({ mode }) => {
  const dockerDevelopment = process.env.ALFRED_DOCKER_DEV === 'true';
  const fileEnvironment = loadEnv(mode, webRoot, ['ALFRED_', 'VITE_']);
  normalizeApiBaseUrl(process.env.VITE_API_URL ?? fileEnvironment.VITE_API_URL);

  return {
    plugins: [react(), tailwindcss()],
    cacheDir: dockerDevelopment ? '/tmp/alfred-vite' : undefined,
    envPrefix: 'VITE_',
    server: {
      host: '127.0.0.1',
      port: 5173,
      strictPort: true,
      forwardConsole: true,
      watch: dockerDevelopment ? { usePolling: true, interval: 300 } : undefined,
      proxy: {
        '/api': {
          changeOrigin: !dockerDevelopment,
          configure: (proxy) => {
            if (!dockerDevelopment) return;

            // The Docker API trusts one proxy hop. Replace caller-supplied forwarding headers.
            proxy.on('proxyReq', (proxyRequest, request) => {
              proxyRequest.setHeader('X-Forwarded-For', request.socket.remoteAddress ?? '');
              proxyRequest.setHeader('X-Forwarded-Host', request.headers.host ?? 'localhost');
              proxyRequest.setHeader('X-Forwarded-Proto', 'http');
            });
          },
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
