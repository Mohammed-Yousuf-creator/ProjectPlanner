import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// In development the UI runs on :5173 and forwards /api to the Go server,
// so the browser only ever talks to one origin.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: process.env.PLANNER_API ?? 'http://127.0.0.1:8080',
        changeOrigin: false,
      },
    },
  },
  build: { outDir: 'dist', sourcemap: false },
});
