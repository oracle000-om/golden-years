/**
 * API Auth Unit Tests
 */
import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import { validateApiAuth } from '../../src/lib/api-auth';

function mockRequest(headers: Record<string, string> = {}): Request {
    return {
        headers: {
            get(name: string) { return headers[name.toLowerCase()] ?? null; },
        },
    } as unknown as Request;
}

describe('validateApiAuth', () => {
    const originalEnv = process.env;

    beforeEach(() => {
        process.env = { ...originalEnv };
    });
    afterEach(() => {
        process.env = originalEnv;
    });

    test('bypasses auth when API_AUTH_REQUIRED=false', async () => {
        process.env.API_AUTH_REQUIRED = 'false';
        const result = await validateApiAuth(mockRequest());
        expect(result.authenticated).toBe(true);
        expect(result.clientId).toBe('dev-bypass');
    });

    test('rejects when no auth headers provided', async () => {
        process.env.API_AUTH_REQUIRED = 'true';
        process.env.API_KEYS = 'test:secret123';
        const result = await validateApiAuth(mockRequest());
        expect(result.authenticated).toBe(false);
        expect(result.error).toContain('Missing authentication');
    });

    test('validates correct API key', async () => {
        process.env.API_AUTH_REQUIRED = 'true';
        process.env.API_KEYS = 'sniff:my-secret-key';
        const result = await validateApiAuth(mockRequest({ 'x-api-key': 'my-secret-key' }));
        expect(result.authenticated).toBe(true);
        expect(result.clientId).toBe('sniff');
    });

    test('rejects invalid API key', async () => {
        process.env.API_AUTH_REQUIRED = 'true';
        process.env.API_KEYS = 'sniff:my-secret-key';
        const result = await validateApiAuth(mockRequest({ 'x-api-key': 'wrong-key' }));
        expect(result.authenticated).toBe(false);
    });

    test('supports multiple API keys', async () => {
        process.env.API_AUTH_REQUIRED = 'true';
        process.env.API_KEYS = 'sniff:key1,admin:key2';
        const r1 = await validateApiAuth(mockRequest({ 'x-api-key': 'key1' }));
        const r2 = await validateApiAuth(mockRequest({ 'x-api-key': 'key2' }));
        expect(r1.authenticated).toBe(true);
        expect(r1.clientId).toBe('sniff');
        expect(r2.authenticated).toBe(true);
        expect(r2.clientId).toBe('admin');
    });

    test('rejects when API_KEYS not configured', async () => {
        process.env.API_AUTH_REQUIRED = 'true';
        delete process.env.API_KEYS;
        const result = await validateApiAuth(mockRequest({ 'x-api-key': 'any-key' }));
        expect(result.authenticated).toBe(false);
        expect(result.error).toContain('not configured');
    });

    test('rejects invalid JWT', async () => {
        process.env.API_AUTH_REQUIRED = 'true';
        process.env.API_JWT_SECRET = 'test-secret';
        const result = await validateApiAuth(mockRequest({ 'authorization': 'Bearer invalid-token' }));
        expect(result.authenticated).toBe(false);
        expect(result.error).toContain('Invalid or expired');
    });

    test('rejects when JWT secret not configured', async () => {
        process.env.API_AUTH_REQUIRED = 'true';
        delete process.env.API_JWT_SECRET;
        const result = await validateApiAuth(mockRequest({ 'authorization': 'Bearer some-token' }));
        expect(result.authenticated).toBe(false);
        expect(result.error).toContain('not configured');
    });
});
