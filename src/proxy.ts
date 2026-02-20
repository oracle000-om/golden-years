import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function proxy(request: NextRequest) {
    // Skip the login page and login API
    if (
        request.nextUrl.pathname === '/login' ||
        request.nextUrl.pathname === '/api/login'
    ) {
        return NextResponse.next();
    }

    // Check for auth cookie
    const authCookie = request.cookies.get('gy_auth');
    if (authCookie?.value === 'authenticated') {
        return NextResponse.next();
    }

    // Redirect to login
    const loginUrl = new URL('/login', request.url);
    loginUrl.searchParams.set('from', request.nextUrl.pathname);
    return NextResponse.redirect(loginUrl);
}

export const config = {
    matcher: [
        // Match all paths except static files and Next.js internals
        '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
    ],
};
