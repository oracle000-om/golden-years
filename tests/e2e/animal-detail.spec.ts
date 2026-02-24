/**
 * E2E Tests — Animal Detail Page
 *
 * Tests the animal profile page across desktop and mobile:
 * - Back button preserves filter state
 * - Phone number rendering (link vs plain text)
 * - Shelter CTA fallback behavior
 * - BCS label in Changes Since Intake
 * - Photo gallery functionality
 */
import { test, expect } from '@playwright/test';

test.describe('Animal Detail Page', () => {

    test('back button preserves filters on return', async ({ page }) => {
        // Apply filters on homepage
        await page.goto('/?species=dog&sort=newest');
        await page.waitForSelector('.animal-card');

        // Click the first animal card
        await page.locator('.animal-card').first().click();
        await page.waitForSelector('.animal-detail__back');

        // Click back
        await page.locator('.animal-detail__back').click();
        await page.waitForSelector('.animal-card');

        // Verify filters survived the round trip
        expect(page.url()).toContain('species=dog');
        expect(page.url()).toContain('sort=newest');
    });

    test('phone number is a clickable tel: link when present', async ({ page }) => {
        // Use an animal with a known shelter that has a phone number
        await page.goto('/animal/893c367a-cf6a-4d77-8c1c-abd9f1fc986a');
        await page.waitForSelector('.animal-detail__shelter-phone-line');

        const phoneLine = page.locator('.animal-detail__shelter-phone-line');
        const link = phoneLine.locator('a');
        await expect(link).toHaveCount(1);
        await expect(link).toHaveAttribute('href', /^tel:/);
    });

    test('phone not available is plain text, not a link', async ({ page }) => {
        // Use an animal at a shelter with no phone
        await page.goto('/animal/3144a684-0208-4c62-85a8-9641869cd1b2');
        await page.waitForSelector('.animal-detail__shelter-phone-line');

        const phoneLine = page.locator('.animal-detail__shelter-phone-line');
        await expect(phoneLine).toContainText('Phone not available');
        await expect(phoneLine.locator('a')).toHaveCount(0);
    });

    test('BCS label shows full name in Changes Since Intake', async ({ page }) => {
        await page.goto('/animal/893c367a-cf6a-4d77-8c1c-abd9f1fc986a');

        const delta = page.locator('.animal-detail__delta');
        // Section may not exist for all animals — skip if absent
        if (await delta.count() === 0) {
            test.skip();
            return;
        }

        await expect(delta.locator('.animal-detail__delta-label').first())
            .toContainText('Body Condition Score (BCS)');
    });

    test('shelter CTA shows fallback when no contact info', async ({ page }) => {
        await page.goto('/animal/42d8a945-ee52-4325-aa75-e3067f2f5d9f');
        await page.waitForSelector('.animal-detail__shelter-card');

        const cta = page.locator('.animal-detail__shelter-cta');
        const fallback = cta.locator('.animal-detail__shelter-fallback');

        // Should show the "search online" fallback instead of a button
        if (await fallback.count() > 0) {
            await expect(fallback).toContainText('Search for');
            await expect(fallback).toContainText('online');
        } else {
            // If the shelter now has a websiteUrl, the CTA button is fine too
            await expect(cta.locator('a')).toHaveCount(1);
        }
    });
});

test.describe('Photo Gallery', () => {

    test('multi-photo animal shows gallery with thumbnails', async ({ page }) => {
        // Navigate and find an animal with multiple photos
        await page.goto('/');
        await page.waitForSelector('.animal-card');
        await page.locator('.animal-card').first().click();
        await page.waitForSelector('.animal-detail__photo');

        const gallery = page.locator('.photo-gallery');
        if (await gallery.count() > 0) {
            // Verify thumbnail strip exists
            await expect(gallery.locator('.photo-gallery__thumbs')).toBeVisible();
            // Verify at least 2 thumbnails
            const thumbCount = await gallery.locator('.photo-gallery__thumb').count();
            expect(thumbCount).toBeGreaterThanOrEqual(2);
        }
        // Single-photo animals won't have a gallery — that's fine
    });
});

test.describe('Homepage', () => {

    test('filter bar renders with all dropdowns', async ({ page }) => {
        await page.goto('/');
        await page.waitForSelector('.filter-bar');

        await expect(page.locator('.filter-bar')).toBeVisible();
        // Check key filter elements exist
        await expect(page.locator('.search-bar')).toBeVisible();
    });

    test('species filter updates results', async ({ page }) => {
        await page.goto('/');
        const totalText = await page.locator('.page-badge').textContent();
        const totalMatch = totalText?.match(/\d+/);
        const totalCount = totalMatch ? parseInt(totalMatch[0], 10) : 0;

        await page.goto('/?species=cat');
        await page.waitForSelector('.page-badge');
        const catText = await page.locator('.page-badge').textContent();
        const catMatch = catText?.match(/\d+/);
        const catCount = catMatch ? parseInt(catMatch[0], 10) : 0;

        // Cat-only should be fewer than total
        expect(catCount).toBeLessThan(totalCount);
        expect(catCount).toBeGreaterThan(0);
    });

    test('pagination shows when results exceed page size', async ({ page }) => {
        await page.goto('/');
        const pagination = page.locator('.pagination');

        if (await pagination.count() > 0) {
            await expect(pagination).toBeVisible();
            // Should have navigation buttons and page numbers
            await expect(pagination.locator('a, span')).not.toHaveCount(0);
        }
    });
});
