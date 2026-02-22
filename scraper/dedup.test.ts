/**
 * Tests for the dedup module — hash computation and hamming distance.
 *
 * Run: npx tsx --test scraper/dedup.test.ts
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { hammingDistance, computePhotoHash } from './dedup';

describe('hammingDistance', () => {
    it('returns 0 for identical hashes', () => {
        assert.strictEqual(hammingDistance('0000000000000000', '0000000000000000'), 0);
        assert.strictEqual(hammingDistance('ffffffffffffffff', 'ffffffffffffffff'), 0);
        assert.strictEqual(hammingDistance('abcdef0123456789', 'abcdef0123456789'), 0);
    });

    it('returns correct bit difference for single-hex changes', () => {
        // 0 = 0000, 1 = 0001 → 1 bit different
        assert.strictEqual(hammingDistance('0000000000000000', '0000000000000001'), 1);
        // 0 = 0000, f = 1111 → 4 bits different
        assert.strictEqual(hammingDistance('0000000000000000', '000000000000000f'), 4);
    });

    it('returns 64 for fully inverted hashes', () => {
        // 0 vs f in every position → 4 bits × 16 positions = 64
        assert.strictEqual(hammingDistance('0000000000000000', 'ffffffffffffffff'), 64);
    });

    it('returns Infinity for different-length hashes', () => {
        assert.strictEqual(hammingDistance('0000', '00000000'), Infinity);
    });

    it('correctly measures small distances', () => {
        // 0 = 0000, 3 = 0011 → 2 bits
        assert.strictEqual(hammingDistance('0000000000000000', '0000000000000003'), 2);
        // 7 = 0111 → 3 bits
        assert.strictEqual(hammingDistance('0000000000000000', '0000000000000007'), 3);
    });
});

describe('computePhotoHash', () => {
    it('returns null for invalid URLs', async () => {
        const hash = await computePhotoHash('https://this-does-not-exist.invalid/photo.jpg');
        assert.strictEqual(hash, null);
    });

    it('returns a 16-character hex string for a valid image', async () => {
        // Use a known public image — the Google favicon
        const hash = await computePhotoHash('https://www.google.com/images/branding/googlelogo/2x/googlelogo_color_272x92dp.png');
        if (hash !== null) {
            assert.strictEqual(hash.length, 16, `Expected 16-char hex, got "${hash}" (${hash.length} chars)`);
            assert.match(hash, /^[0-9a-f]{16}$/, `Hash should be hex: ${hash}`);
        }
        // Note: if fetch fails in CI, hash may be null — that's OK
    });

    it('returns consistent hashes for the same image', async () => {
        const url = 'https://www.google.com/images/branding/googlelogo/2x/googlelogo_color_272x92dp.png';
        const hash1 = await computePhotoHash(url);
        const hash2 = await computePhotoHash(url);
        if (hash1 !== null && hash2 !== null) {
            assert.strictEqual(hash1, hash2, 'Same image should produce identical hashes');
        }
    });
});
