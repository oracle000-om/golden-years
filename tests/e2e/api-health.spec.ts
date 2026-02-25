/**
 * Health API E2E Test
 *
 * Tests the /api/health endpoint returns structured status information.
 * Requires dev server running on :3002.
 */
import { test, expect } from '@playwright/test';

test.describe('Health API', () => {
    test('returns 200 with expected JSON structure', async ({ request }) => {
        const response = await request.get('/api/health');
        expect(response.status()).toBe(200);

        const body = await response.json();
        expect(body.status).toBe('ok');
        expect(body.db).toBe('connected');
        expect(typeof body.animalCount).toBe('number');
        expect(typeof body.shelterCount).toBe('number');
        expect(typeof body.dbLatencyMs).toBe('number');
        expect(typeof body.uptime).toBe('number');
        expect(body.animalCount).toBeGreaterThan(0);
    });

    test('returns lastScrape timestamp', async ({ request }) => {
        const response = await request.get('/api/health');
        const body = await response.json();
        // lastScrape should be an ISO date string or null
        if (body.lastScrape !== null) {
            expect(new Date(body.lastScrape).getTime()).toBeGreaterThan(0);
        }
    });
});
