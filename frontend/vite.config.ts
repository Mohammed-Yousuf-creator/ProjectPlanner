import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// In development the UI runs on :5173 and forwards /api to the Go server,
// so the browser only ever talks to one origin.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    // Local only by default. Set PLANNER_DEV_HOST=0.0.0.0 to reach the dev
    // server from another machine or through a preview proxy, and list the
    // host names it is reached under in PLANNER_DEV_ALLOWED_HOSTS.
    host: process.env.PLANNER_DEV_HOST || '127.0.0.1',
    allowedHosts: (process.env.PLANNER_DEV_ALLOWED_HOSTS ?? '').split(',').map((h) => h.trim()).filter(Boolean),
    proxy: {
      '/api': {
        target: process.env.PLANNER_API ?? 'http://127.0.0.1:8080',
        changeOrigin: false,
      },
    },
  },
  build: { outDir: 'dist', sourcemap: false },
});
