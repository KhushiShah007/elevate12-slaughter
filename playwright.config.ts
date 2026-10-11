import { defineConfig } from '@playwright/test';

// End-to-end smoke test against a dev server with its own throwaway database.
// Uses the Microsoft Edge already on the machine (no browser download). AI keys are blanked so
// the assistant answers from its rules, and nothing is ever sent for real.
export default defineConfig({
  testDir: 'e2e',
  timeout: 600_000,
  expect: { timeout: 30_000 },
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:5175',
    channel: process.env.PW_CHANNEL ?? 'msedge',
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
  },
  webServer: {
    command: 'npx vite --port 5175 --strictPort',
    url: 'http://localhost:5175/api/health',
    timeout: 240_000,
    reuseExistingServer: false,
    env: { PGLITE_DIR: '.data/pglite-e2e', OTP_SHOW_CODE: 'on', ALLOW_REAL_OUTBOUND: 'false', XAI_API_KEY: '', GROQ_API_KEY: '', AMADEUS_CLIENT_ID: '', GOOGLE_MAPS_API_KEY: '' },
  },
});
