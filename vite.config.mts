import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// ARTHA_BACKEND_PORT/ARTHA_FRONTEND_PORT let a local dev setup avoid colliding with
// another project's server on the same default ports (see CLAUDE.md, start.sh).
const backendPort = process.env.ARTHA_BACKEND_PORT || '8000';

export default defineConfig({
  plugins: [react()],
  base: './',
  define: {
    // Only applied if VITE_API_BASE_URL isn't already set (e.g. by the Docker build) —
    // see src/config.ts.
    'import.meta.env.VITE_API_BASE_URL': process.env.VITE_API_BASE_URL
      ? JSON.stringify(process.env.VITE_API_BASE_URL)
      : JSON.stringify(`http://127.0.0.1:${backendPort}`),
    // Docker/web mode only — see src/config.ts's API_SECRET comment. Must be set at
    // BUILD time (not just container start), since Vite bakes this into the static
    // bundle; empty string (auth disabled) if unset, matching desktop/dev behavior.
    'import.meta.env.VITE_API_SECRET': JSON.stringify(process.env.VITE_API_SECRET || '')
  },
  build: {
    outDir: 'dist'
  },
  server: {
    port: Number(process.env.ARTHA_FRONTEND_PORT) || 5173,
    strictPort: true
  }
});
