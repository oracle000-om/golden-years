/**
 * Simple in-memory rate limiter for API routes.
 *
 * Uses a sliding window approach. Safe for single-instance deployments.
 * For multi-instance, swap for Redis-based limiter.
 */

interface RateEntry {
    count: number;
    resetAt: number;
}

const stores = new Map<string, Map<string, RateEntry>>();

/**
 * Create a rate limiter for a specific route.
 *
 * @param name   — unique name for this limiter (e.g. 'search', 'vote')
 * @param limit  — max requests per window
 * @param windowMs — window duration in ms (default: 60s)
 */
export function createRateLimiter(name: string, limit: number, windowMs = 60_000) {
    if (!stores.has(name)) {
        stores.set(name, new Map());
    }
    const store = stores.get(name)!;

    return {
        /**
         * Check if a request from this IP is allowed.
         * Returns { allowed: true } or { allowed: false, retryAfterMs }.
         */
        check(ip: string): { allowed: true } | { allowed: false; retryAfterMs: number } {
            const now = Date.now();

            // Periodic cleanup (every check, lazy)
            if (store.size > 10_000) {
                for (const [key, entry] of store) {
                    if (now > entry.resetAt) store.delete(key);
                }
            }

            const entry = store.get(ip);

            if (!entry || now > entry.resetAt) {
                store.set(ip, { count: 1, resetAt: now + windowMs });
                return { allowed: true };
            }

            if (entry.count >= limit) {
                return { allowed: false, retryAfterMs: entry.resetAt - now };
            }

            entry.count++;
            return { allowed: true };
        },
    };
}

/**
 * Extract client IP from request headers.
 */
export function getClientIp(request: Request): string {
    const forwarded = (request.headers.get('x-forwarded-for') ?? '').split(',')[0]?.trim();
    const realIp = request.headers.get('x-real-ip');
    return forwarded || realIp || 'unknown';
}
