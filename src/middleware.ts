import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

/**
 * Middleware — enforces password protection when SITE_PASSWORD is set,
 * and admin auth when ADMIN_PASSWORD is set.
 * Verifies HMAC-signed cookies using Web Crypto API (Edge Runtime compatible).
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
    const { pathname } = request.nextUrl;

    // Allow static assets regardless
    if (
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

    // ─── Admin route protection ───────────────────────────────
    // Protects both /admin/* pages AND /api/admin-* API routes
    const isAdminPage = pathname.startsWith('/admin');
    const isAdminApi = pathname.startsWith('/api/admin-');
    if (isAdminPage || isAdminApi) {
        const adminPassword = process.env.ADMIN_PASSWORD;

        // Admin not configured — block all admin access
        if (!adminPassword) {
            if (isAdminApi) {
                return NextResponse.json({ error: 'Admin not configured' }, { status: 403 });
            }
            return NextResponse.redirect(new URL('/', request.url));
        }

        // Allow admin login page and login API
        if (pathname === '/admin/login' || pathname === '/api/admin-login') {
            return NextResponse.next();
        }

        // Verify admin cookie
        const adminCookie = request.cookies.get('gy_admin')?.value;
        if (adminCookie && await verifyToken(adminCookie, adminPassword)) {
            return NextResponse.next();
        }

        // Unauthorized: redirect pages, return 401 for APIs
        if (isAdminApi) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }
        return NextResponse.redirect(new URL('/admin/login', request.url));
    }

    // ─── Site password protection ─────────────────────────────
    const sitePassword = process.env.SITE_PASSWORD;

    // No password configured — allow all traffic
    if (!sitePassword) {
        return NextResponse.next();
    }

    // Allow public API routes and the login page itself
    if (
        pathname.startsWith('/api/') ||
        pathname.startsWith('/login')
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

