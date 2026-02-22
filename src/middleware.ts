import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

/**
 * Middleware — enforces password protection when SITE_PASSWORD is set.
 * Verifies the HMAC-signed gy_auth cookie on every request.
 * Uses Web Crypto API (Edge Runtime compatible).
 */

async function verifyToken(token: string, secret: string): Promise<boolean> {
    try {
        const parts = token.split('.');
        if (parts.length !== 2) return false;
        const [value, sig] = parts;

        const encoder = new TextEncoder();
        const key = await crypto.subtle.importKey(
            'raw',
            encoder.encode(secret),
            { name: 'HMAC', hash: 'SHA-256' },
            false,
            ['sign'],
        );
        const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(value));
        const expected = Array.from(new Uint8Array(signature))
            .map(b => b.toString(16).padStart(2, '0'))
            .join('');

        // Constant-time comparison
        if (sig.length !== expected.length) return false;
        let mismatch = 0;
        for (let i = 0; i < sig.length; i++) {
            mismatch |= sig.charCodeAt(i) ^ expected.charCodeAt(i);
        }
        return mismatch === 0;
    } catch {
        return false;
    }
}

export async function middleware(request: NextRequest) {
    const sitePassword = process.env.SITE_PASSWORD;

    // No password configured — allow all traffic
    if (!sitePassword) {
        return NextResponse.next();
    }

    // Allow static assets, API routes, and the login page itself
    const { pathname } = request.nextUrl;
    if (
        pathname.startsWith('/api/') ||
        pathname.startsWith('/login') ||
        pathname.startsWith('/_next/') ||
        pathname.startsWith('/favicon') ||
        pathname === '/icon.svg' ||
        pathname.endsWith('.svg') ||
        pathname.endsWith('.png') ||
        pathname.endsWith('.jpg') ||
        pathname.endsWith('.webp')
    ) {
        return NextResponse.next();
    }

    // Verify the signed cookie
    const authCookie = request.cookies.get('gy_auth')?.value;
    if (authCookie && await verifyToken(authCookie, sitePassword)) {
        return NextResponse.next();
    }

    // Redirect to login
    const loginUrl = new URL('/login', request.url);
    loginUrl.searchParams.set('from', pathname);
    return NextResponse.redirect(loginUrl);
}

export const config = {
    matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
