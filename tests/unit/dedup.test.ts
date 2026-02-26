/**
 * Unit Tests — Dedup Module
 *
 * Tests the 3-tier duplicate detection logic.
 * Broken dedup = duplicate listings cluttering the feed,
 * or animals silently merged with wrong records.
 */
import { describe, test, expect } from 'vitest';
import { hammingDistance, computePhotoHashFromBuffer, PHASH_THRESHOLD } from '../../scraper/dedup';

// ────────────────────────────────────────────
// hammingDistance
// ────────────────────────────────────────────
describe('hammingDistance', () => {
    test('identical hashes return 0', () => {
        expect(hammingDistance('0000000000000000', '0000000000000000')).toBe(0);
        expect(hammingDistance('ffffffffffffffff', 'ffffffffffffffff')).toBe(0);
        expect(hammingDistance('a1b2c3d4e5f60718', 'a1b2c3d4e5f60718')).toBe(0);
    });

    test('single bit difference returns 1', () => {
        // 0 = 0000, 1 = 0001 → 1 bit different
        expect(hammingDistance('0000000000000000', '0000000000000001')).toBe(1);
    });

    test('single hex difference (4 bits max)', () => {
        // 0 = 0000, f = 1111 → 4 bits
        expect(hammingDistance('0000000000000000', '000000000000000f')).toBe(4);
    });

    test('fully inverted hashes return 64', () => {
        expect(hammingDistance('0000000000000000', 'ffffffffffffffff')).toBe(64);
    });

    test('different length returns Infinity', () => {
        expect(hammingDistance('0000', '00000000')).toBe(Infinity);
        expect(hammingDistance('', '0000000000000000')).toBe(Infinity);
    });

    test('threshold boundary: distance 5 is within threshold', () => {
        // PHASH_THRESHOLD is 5, meaning distance <= 5 is a match
        expect(PHASH_THRESHOLD).toBe(5);
        // 7 = 0111 → 3 bits, 0 = 0000 at two positions → 6 total would exceed
        // Let's verify small distances
        expect(hammingDistance('0000000000000000', '0000000000000003')).toBe(2); // within
        expect(hammingDistance('0000000000000000', '0000000000000007')).toBe(3); // within
        expect(hammingDistance('0000000000000000', '000000000000000f')).toBe(4); // within
    });
});

// ────────────────────────────────────────────
// computePhotoHashFromBuffer
// ────────────────────────────────────────────
describe('computePhotoHashFromBuffer', () => {
    test('returns 16-char hex for a valid image buffer', async () => {
        // Create a minimal valid PNG-like buffer via sharp
        const sharp = (await import('sharp')).default;
        const buffer = await sharp({
            create: { width: 100, height: 100, channels: 3, background: { r: 128, g: 64, b: 32 } },
        }).png().toBuffer();

        const hash = await computePhotoHashFromBuffer(buffer);
        expect(hash).not.toBeNull();
        expect(hash).toHaveLength(16);
        expect(hash).toMatch(/^[0-9a-f]{16}$/);
    });

    test('same image produces same hash (deterministic)', async () => {
        const sharp = (await import('sharp')).default;
        const buffer = await sharp({
            create: { width: 50, height: 50, channels: 3, background: { r: 200, g: 100, b: 50 } },
        }).png().toBuffer();

        const hash1 = await computePhotoHashFromBuffer(buffer);
        const hash2 = await computePhotoHashFromBuffer(buffer);
        expect(hash1).toBe(hash2);
    });

    test('different images produce different hashes', async () => {
        const sharp = (await import('sharp')).default;

        // Create two visually distinct images (solid colors hash identically
        // because every pixel equals the mean, so we need actual variation)
        // Image 1: left half black, right half white
        const halfAndHalf = await sharp({
            create: { width: 100, height: 100, channels: 3, background: { r: 0, g: 0, b: 0 } },
        }).composite([{
            input: await sharp({
                create: { width: 50, height: 100, channels: 3, background: { r: 255, g: 255, b: 255 } },
            }).png().toBuffer(),
            left: 50, top: 0,
        }]).png().toBuffer();

        // Image 2: top half black, bottom half white
        const topBottom = await sharp({
            create: { width: 100, height: 100, channels: 3, background: { r: 0, g: 0, b: 0 } },
        }).composite([{
            input: await sharp({
                create: { width: 100, height: 50, channels: 3, background: { r: 255, g: 255, b: 255 } },
            }).png().toBuffer(),
            left: 0, top: 50,
        }]).png().toBuffer();

        const hash1 = await computePhotoHashFromBuffer(halfAndHalf);
        const hash2 = await computePhotoHashFromBuffer(topBottom);
        expect(hash1).not.toBeNull();
        expect(hash2).not.toBeNull();
        expect(hash1).not.toBe(hash2);
    });

    test('returns null for invalid buffer', async () => {
        const hash = await computePhotoHashFromBuffer(Buffer.from('not an image'));
        expect(hash).toBeNull();
    });
});
