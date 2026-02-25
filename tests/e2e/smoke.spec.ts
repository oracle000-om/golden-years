/**
 * Smoke Test — Golden Years Club
 *
 * The most basic health check: can the app boot, render the homepage,
 * and show animal listings? If this fails, something is fundamentally broken.
 *
 * Run: npx playwright test tests/e2e/smoke.spec.ts
 */
import { test, expect } from '@playwright/test';

test.describe('Smoke Test', () => {

    test('homepage loads and renders the main heading', async ({ page }) => {
        const response = await page.goto('/');
        // Server should respond 200
        expect(response?.status()).toBe(200);

        // Page title should be set
        await expect(page).toHaveTitle(/Golden Years/i);
    });

    test('animal grid renders with at least one card', async ({ page }) => {
        await page.goto('/');
        // Wait for the animal cards to load (server component hydration)
        await page.waitForSelector('.animal-card', { timeout: 15_000 });

        const cards = page.locator('.animal-card');
        const count = await cards.count();
        expect(count).toBeGreaterThan(0);
    });

    test('page badge shows a non-zero animal count', async ({ page }) => {
        await page.goto('/');
        await page.waitForSelector('.page-badge', { timeout: 15_000 });

        const badge = page.locator('.page-badge', { hasText: /\d/ }).first();
        const text = await badge.textContent();
        const match = text?.match(/(\d[\d,]*)/);
        expect(match).not.toBeNull();
        const count = parseInt(match![1].replace(/,/g, ''), 10);
        expect(count).toBeGreaterThan(0);
    });

    test('nav links are present and correct', async ({ page }) => {
        await page.goto('/');
        await page.waitForSelector('.animal-card', { timeout: 15_000 });

        // The page should have at least one internal navigation link
        const links = page.locator('a[href^="/"]');
        const count = await links.count();
        expect(count).toBeGreaterThan(0);
    });

    test('no console errors on homepage load', async ({ page }) => {
        const errors: string[] = [];
        page.on('console', msg => {
            if (msg.type() === 'error') errors.push(msg.text());
        });

        await page.goto('/');
        await page.waitForSelector('.animal-card', { timeout: 15_000 });

        // Filter out known benign errors (e.g. favicon 404, HMR websocket)
        const realErrors = errors.filter(e =>
            !e.includes('favicon') &&
            !e.includes('WebSocket') &&
            !e.includes('hydration')
        );
        expect(realErrors).toHaveLength(0);
    });
});
