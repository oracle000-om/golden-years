/**
 * Performance Budget Test — Golden Years Club
 *
 * Guards against performance regressions by asserting hard thresholds
 * on page load metrics. Catches both known anti-patterns and novel
 * regressions that grep-based checks would miss.
 *
 * Run: npx playwright test tests/e2e/perf-budget.spec.ts
 */
import { test, expect } from '@playwright/test';

// ── Thresholds ──────────────────────────────────────────────
// Generous for local dev (no CDN, local DB). Tighten for prod.
const MAX_CSS_BYTES = 150 * 1024;       // 150 KB
const MAX_JS_BYTES = 400 * 1024;        // 400 KB
const MAX_BLOCKING_REQUESTS = 2;        // HTML + primary CSS only
const MAX_LCP_MS = 4000;               // 4 seconds (local dev)

test.describe('Performance Budget', () => {

    test('homepage CSS transfer stays under budget', async ({ page }) => {
        let cssBytes = 0;

        page.on('response', (response) => {
            const contentType = response.headers()['content-type'] || '';
            if (contentType.includes('text/css')) {
                const contentLength = response.headers()['content-length'];
                if (contentLength) cssBytes += parseInt(contentLength, 10);
            }
        });

        await page.goto('/');
        await page.waitForSelector('.animal-card,.empty-state,.error-state', { timeout: 15_000 });

        // Allow a moment for late-loading stylesheets
        await page.waitForTimeout(500);

        expect(cssBytes).toBeLessThan(MAX_CSS_BYTES);
    });

    test('homepage JS transfer stays under budget', async ({ page }) => {
        let jsBytes = 0;

        page.on('response', (response) => {
            const contentType = response.headers()['content-type'] || '';
            if (contentType.includes('javascript')) {
                const contentLength = response.headers()['content-length'];
                if (contentLength) jsBytes += parseInt(contentLength, 10);
            }
        });

        await page.goto('/');
        await page.waitForSelector('.animal-card,.empty-state,.error-state', { timeout: 15_000 });
        await page.waitForTimeout(500);

        expect(jsBytes).toBeLessThan(MAX_JS_BYTES);
    });

    test('homepage has minimal render-blocking requests', async ({ page }) => {
        const blockingRequests: string[] = [];

        // Intercept requests to detect blocking resources
        page.on('request', (request) => {
            const type = request.resourceType();
            const url = request.url();

            // Render-blocking: synchronous CSS (not media=print) or blocking scripts
            if (type === 'stylesheet' && !url.includes('media=print')) {
                blockingRequests.push(url);
            }
            if (type === 'script' && !request.url().includes('_next/static')) {
                // Inline scripts and non-deferred scripts are blocking
                blockingRequests.push(url);
            }
        });

        await page.goto('/');
        await page.waitForSelector('.animal-card,.empty-state,.error-state', { timeout: 15_000 });

        expect(
            blockingRequests.length,
            `Blocking requests exceeded budget (${MAX_BLOCKING_REQUESTS}):\n${blockingRequests.join('\n')}`,
        ).toBeLessThanOrEqual(MAX_BLOCKING_REQUESTS);
    });

    test('homepage LCP is under budget', async ({ page }) => {
        await page.goto('/');
        await page.waitForSelector('.animal-card,.empty-state,.error-state', { timeout: 15_000 });

        // Use PerformanceObserver to get LCP
        const lcp = await page.evaluate(() => {
            return new Promise<number>((resolve) => {
                // If LCP has already fired, read from performance entries
                const entries = performance.getEntriesByType('largest-contentful-paint');
                if (entries.length > 0) {
                    resolve(entries[entries.length - 1].startTime);
                    return;
                }

                // Otherwise observe for it (shouldn't happen since page is loaded)
                const observer = new PerformanceObserver((list) => {
                    const lcpEntries = list.getEntries();
                    if (lcpEntries.length > 0) {
                        resolve(lcpEntries[lcpEntries.length - 1].startTime);
                    }
                    observer.disconnect();
                });
                observer.observe({ type: 'largest-contentful-paint', buffered: true });

                // Timeout fallback
                setTimeout(() => resolve(MAX_LCP_MS + 1), 5000);
            });
        });

        expect(lcp, `LCP was ${Math.round(lcp)}ms, budget is ${MAX_LCP_MS}ms`).toBeLessThan(MAX_LCP_MS);
    });

    test('homepage does not use force-dynamic', async ({ page }) => {
        const response = await page.goto('/');

        // force-dynamic sets cache-control: no-store
        // ISR/static sets cache-control with s-maxage or similar
        const cacheControl = response?.headers()['cache-control'] || '';

        // In dev mode, all pages get no-store regardless of config,
        // so we skip this assertion in dev and only enforce in CI/prod builds.
        // The build-time scanner (scripts/perf-check.ts) catches this at source level.
        if (process.env.CI) {
            expect(
                cacheControl,
                'Homepage appears to use force-dynamic (no-store cache header)',
            ).not.toContain('no-store');
        }
    });
});
