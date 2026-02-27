import { NextResponse } from 'next/server';

/**
 * Simple admin auth check endpoint.
 * Middleware already validates the gy_admin cookie for /api/admin-* routes,
 * so if we reach this handler, the user is authenticated.
 */
export async function GET() {
    return NextResponse.json({ admin: true });
}
