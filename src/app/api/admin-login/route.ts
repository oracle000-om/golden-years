import { NextResponse } from 'next/server';

/**
 * Admin Login API — separate from site password.
 * Uses ADMIN_PASSWORD env var and sets gy_admin cookie.
 *
 * Security features:
 *   - Rate limiting: max 5 attempts per IP per 15-minute window
 *   - Timestamped nonce in cookie to support future rotation
 *   - HMAC-signed cookie with Web Crypto API for consistency with middleware
 */

// ── Rate Limiting ────────────────────────────────────────

interface RateEntry {
    count: number;
    resetAt: number;
}

const RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000; // 15 minutes
const RATE_LIMIT_MAX = 5;
const rateLimitMap = new Map<string, RateEntry>();

function isRateLimited(ip: string): boolean {
    const now = Date.now();
    const entry = rateLimitMap.get(ip);

    if (!entry || now > entry.resetAt) {
        rateLimitMap.set(ip, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
        return false;
    }

    entry.count++;
    return entry.count > RATE_LIMIT_MAX;
}

// Periodically clean up stale entries (avoid unbounded memory growth)
setInterval(() => {
    const now = Date.now();
    for (const [ip, entry] of rateLimitMap) {
        if (now > entry.resetAt) rateLimitMap.delete(ip);
    }
}, RATE_LIMIT_WINDOW_MS);

// ── Token Signing ────────────────────────────────────────

async function signAdminToken(secret: string): Promise<string> {
    // Include a timestamp nonce so each login generates a unique token,
    // making cookie replay slightly harder to exploit.
    const value = `admin:${Date.now()}`;
    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey(
        'raw',
        encoder.encode(secret),
        { name: 'HMAC', hash: 'SHA-256' },
        false,
        ['sign'],
    );
    const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(value));
    const hex = Array.from(new Uint8Array(signature))
        .map(b => b.toString(16).padStart(2, '0'))
        .join('');
    return `${value}.${hex}`;
}

// ── Handler ──────────────────────────────────────────────

export async function POST(request: Request) {
    // Extract client IP for rate limiting
    const forwarded = request.headers.get('x-forwarded-for');
    const ip = forwarded?.split(',')[0]?.trim() || 'unknown';

    if (isRateLimited(ip)) {
        return NextResponse.json(
            { success: false, error: 'Too many attempts. Try again later.' },
            { status: 429 },
        );
    }

    const { password } = await request.json();
    const adminPassword = process.env.ADMIN_PASSWORD;

    if (!adminPassword) {
        return NextResponse.json({ success: false, error: 'Admin not configured' }, { status: 403 });
    }

    if (password === adminPassword) {
        const token = await signAdminToken(adminPassword);
        const response = NextResponse.json({ success: true });
        response.cookies.set('gy_admin', token, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'lax',
            maxAge: 60 * 60 * 24 * 7, // 7 days
            path: '/',
        });
        return response;
    }

    return NextResponse.json({ success: false, error: 'Wrong password' }, { status: 401 });
}
