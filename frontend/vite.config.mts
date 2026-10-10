import { createRequire } from 'node:module';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// ARTHA_BACKEND_PORT/ARTHA_FRONTEND_PORT let a local dev setup avoid colliding with
// another project's server on the same default ports (see CLAUDE.md, start.sh). They
// can be set in the repo-root .env, shared with the backend, Electron and start.sh.
const require = createRequire(import.meta.url);
try {
  require('../scripts/load-env.cjs').loadRootEnv();
} catch {
  // Not available in every build context (e.g. a minimal Docker build); env vars still apply.
}
// The packaged desktop app always starts its bundled backend on this port (see
// electron/main.js), so production builds must not pick up a dev-only port override.
const DESKTOP_BACKEND_PORT = '8000';

export default defineConfig(({ command }) => {
  // Dev server: follow ARTHA_BACKEND_PORT (start.sh / .env). Production build: the
  // desktop default, unless VITE_API_BASE_URL is set explicitly (the Docker/web build).
  const backendPort = command === 'serve' ? (process.env.ARTHA_BACKEND_PORT || DESKTOP_BACKEND_PORT) : DESKTOP_BACKEND_PORT;
  return {
  plugins: [react()],
  base: './',
  // VITE_* variables are read from the repo-root .env too, not frontend/.env.
  envDir: '..',
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
  };
});
