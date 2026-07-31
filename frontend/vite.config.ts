import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'node:url';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:4000',
        changeOrigin: true,
      },
      // WebSocket de tiempo real (Socket.IO).
      '/socket.io': {
        target: 'http://localhost:4000',
        changeOrigin: true,
        ws: true,
      },
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
    rollupOptions: {
      output: {
        /**
         * Separa las librerias del codigo de la app.
         *
         * Todo iba en un solo archivo de ~860 KB: cada deploy invalidaba el bundle
         * completo y el navegador volvia a bajar React entero por un cambio de una
         * linea. Partido asi, las librerias (que casi nunca cambian) quedan
         * cacheadas y solo se rebaja lo que de verdad se toco.
         */
        manualChunks: {
          react: ['react', 'react-dom', 'react-router-dom'],
          datos: ['@tanstack/react-query', 'axios', 'zustand'],
          realtime: ['socket.io-client'],
          fechas: ['dayjs'],
        },
      },
    },
  },
});
