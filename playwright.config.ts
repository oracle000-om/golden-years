import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright E2E Configuration — Golden Years Club
 *
 * Runs browser tests against the local dev server.
 * Uses Chromium only for speed; add Firefox/Safari for cross-browser coverage.
 *
 * Usage:
 *   npx playwright test              # run all E2E tests
 *   npx playwright test --ui         # interactive UI mode
 *   npx playwright test --headed     # see the browser
 */
export default defineConfig({
    testDir: './tests/e2e',
    timeout: 30_000,
    expect: { timeout: 5_000 },

    /* Run tests in parallel */
    fullyParallel: true,

    /* Fail the build on CI if you accidentally left test.only */
    forbidOnly: !!process.env.CI,

    /* Retry on CI only */
    retries: process.env.CI ? 2 : 0,

    /* Reporter */
    reporter: process.env.CI ? 'github' : 'html',

    use: {
        /* Base URL for all tests */
        baseURL: 'http://localhost:3002',

        /* Collect trace on first retry */
        trace: 'on-first-retry',

        /* Screenshot on failure */
        screenshot: 'only-on-failure',
    },

    projects: [
        {
            name: 'Desktop Chrome',
            use: { ...devices['Desktop Chrome'] },
        },
        {
            name: 'Mobile iPhone',
            use: { ...devices['iPhone 14'] },
        },
    ],

    /* Start the dev server before running tests */
    webServer: {
        command: 'npm run dev -- -p 3002',
        url: 'http://localhost:3002',
        reuseExistingServer: true,
        timeout: 60_000,
    },
});
