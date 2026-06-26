import { defineConfig, devices } from '@playwright/test';

/**
 * Headless cron-friendly config.
 * `ignoreHTTPSErrors` is needed because DSM uses a self-signed cert on the LAN endpoint
 * that the LAN/relay endpoint redirects to (e.g. 192-168-x-x.<id>.direct.quickconnect.to).
 */
export default defineConfig({
  testDir: '.',
  testMatch: ['capture.spec.ts'],
  timeout: 120_000,
  fullyParallel: false,
  retries: process.env.CI ? 1 : 0,
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'playwright-report' }]],
  use: {
    headless: true,
    viewport: { width: 1440, height: 900 },
    ignoreHTTPSErrors: true,
    actionTimeout: 15_000,
    navigationTimeout: 30_000,
    screenshot: 'off',                 // we screenshot manually in the spec
    video: 'retain-on-failure',
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],
});
