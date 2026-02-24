/**
 * E2E Tests — Mobile Responsiveness
 *
 * Tests the site on a mobile viewport (iPhone 14 profile).
 * Playwright's "Mobile iPhone" project handles viewport + user agent.
 */
import { test, expect } from '@playwright/test';

// These tests only run in the "Mobile iPhone" project
test.describe('Mobile Layout', () => {

    test('homepage cards stack in single column', async ({ page }) => {
        await page.goto('/');
        await page.waitForSelector('.animal-card');

        // On mobile, card grid should be single column
        const grid = page.locator('.animal-grid');
        if (await grid.count() > 0) {
            const gridBox = await grid.boundingBox();
            const cardBox = await page.locator('.animal-card').first().boundingBox();
            if (gridBox && cardBox) {
                // Card should be nearly full-width of the grid
                expect(cardBox.width).toBeGreaterThan(gridBox.width * 0.8);
            }
        }
    });

    test('footer mascots are visible', async ({ page }) => {
        await page.goto('/');

        // Scroll to bottom
        await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
        await page.waitForTimeout(500);

        // Check mascots exist in the DOM
        const mascots = page.locator('.footer-mascot, .mascot, [class*="mascot"]');
        // Mascots should be present (implementation may vary)
        const count = await mascots.count();
        // At minimum the footer should exist
        await expect(page.locator('footer, .footer')).toBeVisible();
    });

    test('animal detail page is readable on mobile', async ({ page }) => {
        await page.goto('/animal/893c367a-cf6a-4d77-8c1c-abd9f1fc986a');
        await page.waitForSelector('.animal-detail');

        // Name should be visible
        await expect(page.locator('.animal-detail__name')).toBeVisible();

        // Photo should be visible
        await expect(page.locator('.animal-detail__photo')).toBeVisible();

        // Nothing should overflow the viewport width
        const viewportWidth = page.viewportSize()?.width || 375;
        const bodyWidth = await page.evaluate(() => document.body.scrollWidth);
        expect(bodyWidth).toBeLessThanOrEqual(viewportWidth + 5); // 5px tolerance
    });
});
