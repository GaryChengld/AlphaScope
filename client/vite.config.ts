import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    proxy: {
      '/api': { target: 'http://localhost:3001', changeOrigin: true },
      '/socket.io': {
        target: 'http://localhost:3001',
        ws: true,
        changeOrigin: true,
        // Suppress ECONNABORTED/ECONNRESET noise — these fire on every normal
        // browser disconnect (page refresh, hot reload) and are not errors.
        configure: proxy => {
          proxy.on('error', err => {
            if ((err as NodeJS.ErrnoException).code === 'ECONNABORTED' ||
                (err as NodeJS.ErrnoException).code === 'ECONNRESET') return;
            console.error('[socket proxy]', err.message);
          });
        },
      },
    },
  },
  build: { outDir: 'dist', sourcemap: true },
});
