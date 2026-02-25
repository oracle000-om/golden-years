/**
 * Rate Limiter Unit Tests
 *
 * Tests the rate limiter's in-memory fallback path since unit tests
 * don't have a DB connection.
 */
import { describe, test, expect } from 'vitest';
import { createRateLimiter, getClientIp } from '../../src/lib/rate-limit';

describe('Rate Limiter (fallback path)', () => {
    test('allows requests within limit', async () => {
        const limiter = createRateLimiter('test-allow', 5, 60_000);
        // Will use fallback since no DB in tests
        const result = await limiter.check('127.0.0.1');
        expect(result.allowed).toBe(true);
    });

    test('blocks requests over limit', async () => {
        const limiter = createRateLimiter('test-block', 3, 60_000);
        // Fire 3 allowed + 1 blocked
        await limiter.check('10.0.0.1');
        await limiter.check('10.0.0.1');
        await limiter.check('10.0.0.1');
        const result = await limiter.check('10.0.0.1');
        expect(result.allowed).toBe(false);
        if (!result.allowed) {
            expect(result.retryAfterMs).toBeGreaterThan(0);
        }
    });

    test('different IPs have independent limits', async () => {
        const limiter = createRateLimiter('test-independent', 2, 60_000);
        await limiter.check('192.168.1.1');
        await limiter.check('192.168.1.1');
        const blocked = await limiter.check('192.168.1.1');
        expect(blocked.allowed).toBe(false);

        // Different IP should still be allowed
        const allowed = await limiter.check('192.168.1.2');
        expect(allowed.allowed).toBe(true);
    });

    test('different routes have independent limits', async () => {
        const limiterA = createRateLimiter('test-route-a', 2, 60_000);
        const limiterB = createRateLimiter('test-route-b', 2, 60_000);

        await limiterA.check('10.0.0.5');
        await limiterA.check('10.0.0.5');
        const blocked = await limiterA.check('10.0.0.5');
        expect(blocked.allowed).toBe(false);

        // Same IP, different route should be allowed
        const allowed = await limiterB.check('10.0.0.5');
        expect(allowed.allowed).toBe(true);
    });
});

describe('getClientIp', () => {
    test('extracts IP from x-forwarded-for', () => {
        const req = new Request('http://localhost', {
            headers: { 'x-forwarded-for': '203.0.113.50, 70.41.3.18' },
        });
        expect(getClientIp(req)).toBe('203.0.113.50');
    });

    test('falls back to x-real-ip', () => {
        const req = new Request('http://localhost', {
            headers: { 'x-real-ip': '10.0.0.1' },
        });
        expect(getClientIp(req)).toBe('10.0.0.1');
    });

    test('returns unknown when no IP headers', () => {
        const req = new Request('http://localhost');
        expect(getClientIp(req)).toBe('unknown');
    });
});
