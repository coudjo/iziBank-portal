import { defineConfig } from '@playwright/test';

// Set PW_CHROMIUM to use an already-installed Chromium (for example in the cloud workspace).
const executablePath = process.env['PW_CHROMIUM'];
const launchOptions = executablePath ? { executablePath } : {};

export default defineConfig({
  testDir: 'e2e',
  fullyParallel: true,
  forbidOnly: !!process.env['CI'],
  retries: process.env['CI'] ? 1 : 0,
  reporter: [['list']],
  // Reduced motion: the app then drops its animations (styles.scss), so axe never scans a half-faded toast.
  use: {
    baseURL: 'http://localhost:4200',
    trace: 'retain-on-failure',
    reducedMotion: 'reduce',
    launchOptions,
  },
  projects: [
    { name: 'desktop', use: { viewport: { width: 1366, height: 768 } } },
    { name: 'tablet', use: { viewport: { width: 820, height: 1180 }, hasTouch: true } },
    { name: 'phone', use: { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: false } },
  ],
  webServer: {
    command: 'npm run start -- --port 4200',
    url: 'http://localhost:4200',
    reuseExistingServer: !process.env['CI'],
    timeout: 120_000,
  },
});
