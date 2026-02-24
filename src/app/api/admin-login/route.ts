import { NextResponse } from 'next/server';
import crypto from 'crypto';

/**
 * Admin Login API — separate from site password.
 * Uses ADMIN_PASSWORD env var and sets gy_admin cookie.
 */

function signAdminToken(value: string): string {
    const secret = process.env.ADMIN_PASSWORD || 'admin-default';
    const hmac = crypto.createHmac('sha256', secret);
    hmac.update(value);
    return `${value}.${hmac.digest('hex')}`;
}

export async function POST(request: Request) {
    const { password } = await request.json();
    const adminPassword = process.env.ADMIN_PASSWORD;

    if (!adminPassword) {
        return NextResponse.json({ success: false, error: 'Admin not configured' }, { status: 403 });
    }

    if (password === adminPassword) {
        const token = signAdminToken('admin-authenticated');
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
