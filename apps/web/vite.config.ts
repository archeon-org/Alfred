import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react()],
  envPrefix: 'VITE_',
  server: {
    host: '0.0.0.0',
    port: 5173,
    strictPort: true,
    forwardConsole: true,
  },
  preview: {
    host: '0.0.0.0',
    port: 4173,
    strictPort: true,
  },
  resolve: {
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
