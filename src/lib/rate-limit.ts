/**
 * Database-backed Rate Limiter
 *
 * Persists rate limit state in PostgreSQL so limits survive server
 * restarts, deploys, and serverless cold starts.
 *
 * Uses upsert with a sliding window per (ip, route) pair.
 */

import { createPrismaClient } from '../../scraper/lib/prisma';
import type { PrismaClient } from '../generated/prisma/client';

let prisma: PrismaClient | null = null;

async function getPrisma(): Promise<PrismaClient> {
    if (!prisma) {
        prisma = await createPrismaClient();
    }
    return prisma;
}

// In-memory fallback for when DB is unavailable (graceful degradation)
const fallbackStores = new Map<string, Map<string, { count: number; resetAt: number }>>();

/**
 * Create a rate limiter for a specific route.
 *
 * @param name   — unique name for this limiter (e.g. 'search', 'vote')
 * @param limit  — max requests per window
 * @param windowMs — window duration in ms (default: 60s)
 */
export function createRateLimiter(name: string, limit: number, windowMs = 60_000) {
    // Lazy cleanup counter — run DB cleanup every ~100 checks
    let checkCount = 0;

    return {
        /**
         * Check if a request from this IP is allowed.
         * Returns { allowed: true } or { allowed: false, retryAfterMs }.
         */
        async check(ip: string): Promise<{ allowed: true } | { allowed: false; retryAfterMs: number }> {
            try {
                const db = await getPrisma();
                const now = new Date();
                const windowEnd = new Date(now.getTime() + windowMs);

                // Periodic cleanup of expired entries
                checkCount++;
                if (checkCount % 100 === 0) {
                    db.rateLimitEntry.deleteMany({
                        where: { windowEnd: { lt: now } },
                    }).catch(() => { /* non-fatal cleanup */ });
                }

                // Try to find existing entry
                const existing = await db.rateLimitEntry.findUnique({
                    where: { ip_route: { ip, route: name } },
                });

                if (!existing || existing.windowEnd < now) {
                    // Window expired or no entry — create/reset
                    await db.rateLimitEntry.upsert({
                        where: { ip_route: { ip, route: name } },
                        update: { count: 1, windowEnd },
                        create: { ip, route: name, count: 1, windowEnd },
                    });
                    return { allowed: true };
                }

                if (existing.count >= limit) {
                    return {
                        allowed: false,
                        retryAfterMs: existing.windowEnd.getTime() - now.getTime(),
                    };
                }

                // Increment
                await db.rateLimitEntry.update({
                    where: { ip_route: { ip, route: name } },
                    data: { count: existing.count + 1 },
                });
                return { allowed: true };
            } catch {
                // DB unavailable — fall back to in-memory (better than no rate limiting)
                return this._fallbackCheck(ip);
            }
        },

        /** In-memory fallback when DB is unavailable */
        _fallbackCheck(ip: string): { allowed: true } | { allowed: false; retryAfterMs: number } {
            if (!fallbackStores.has(name)) {
                fallbackStores.set(name, new Map());
            }
            const store = fallbackStores.get(name)!;
            const now = Date.now();

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
