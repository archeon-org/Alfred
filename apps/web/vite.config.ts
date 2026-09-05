import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vite';

export default defineConfig({
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
        target: process.env.ALFRED_DEV_API_PROXY_TARGET ?? 'http://127.0.0.1:3000',
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
});
