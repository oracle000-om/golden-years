import { NextResponse } from 'next/server';
import crypto from 'crypto';

/**
 * Sign the auth cookie value using HMAC-SHA256.
 * If SITE_PASSWORD is not set, auth is disabled.
 */
function getAuthSecret(): string {
    return process.env.SITE_PASSWORD || 'golden-years-default';
}

export function signToken(value: string): string {
    const hmac = crypto.createHmac('sha256', getAuthSecret());
    hmac.update(value);
    return `${value}.${hmac.digest('hex')}`;
}

export function verifyToken(token: string): boolean {
    const parts = token.split('.');
    if (parts.length !== 2) return false;
    const [value, sig] = parts;
    const hmac = crypto.createHmac('sha256', getAuthSecret());
    hmac.update(value);
    const expected = hmac.digest('hex');
    return crypto.timingSafeEqual(Buffer.from(sig, 'hex'), Buffer.from(expected, 'hex'));
}

export async function POST(request: Request) {
    const { password } = await request.json();
    const sitePassword = process.env.SITE_PASSWORD;

    if (!sitePassword) {
        // No password set — allow access
        return NextResponse.json({ success: true });
    }

    if (password === sitePassword) {
        const token = signToken('authenticated');
        const response = NextResponse.json({ success: true });
        response.cookies.set('gy_auth', token, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'lax',
            maxAge: 60 * 60 * 24 * 30, // 30 days
            path: '/',
        });
        return response;
    }

    return NextResponse.json({ success: false, error: 'Wrong password' }, { status: 401 });
}
