import { defineConfig } from '@playwright/test';

// End-to-end smoke tests (e2e/): every page opens without errors, and a few key flows work,
// against a throwaway backend + Vite dev server on their own ports with a freshly seeded DB.
// Locally they use the installed Chrome; CI installs Playwright's Chromium.
const BACKEND = process.env.E2E_BACKEND_PORT ?? '8097';
const FRONTEND = process.env.E2E_FRONTEND_PORT ?? '5197';
process.env.E2E_BACKEND_PORT = BACKEND;
process.env.E2E_FRONTEND_PORT = FRONTEND;

export default defineConfig({
  testDir: 'e2e',
  globalSetup: './e2e/seed.ts',
  fullyParallel: false,
  workers: 1,
  timeout: 30_000,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['list']] : 'list',
  use: {
    baseURL: `http://localhost:${FRONTEND}`,
    viewport: { width: 1440, height: 900 },
    channel: process.env.CI ? undefined : 'chrome',
    trace: 'retain-on-failure',
  },
  webServer: [
    {
      command: 'node e2e/start-backend.mjs',
      url: `http://127.0.0.1:${BACKEND}/api/init`,
      reuseExistingServer: false,
      timeout: 60_000,
    },
    {
      command: `npm run dev -w frontend -- --port ${FRONTEND} --strictPort`,
      url: `http://localhost:${FRONTEND}`,
      reuseExistingServer: false,
      timeout: 60_000,
      env: { ARTHA_BACKEND_PORT: BACKEND, ARTHA_FRONTEND_PORT: FRONTEND },
    },
  ],
});
