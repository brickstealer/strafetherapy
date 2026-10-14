import { defineConfig } from 'vite';

const SERVER_PORT = process.env.SERVER_PORT || process.env.PORT || '3001';

export default defineConfig({
  base: './',
  server: {
    host: '0.0.0.0',
    port: 5173,
    proxy: {
      '/ws': {
        target: `http://localhost:${SERVER_PORT}`,
        ws: true
      }
    }
  },
  preview: {
    host: '0.0.0.0',
    port: 5173,
    proxy: {
      '/ws': {
        target: `http://localhost:${SERVER_PORT}`,
        ws: true
      }
    }
  }
});
