import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

/* ── Rate limiter (DB-backed for multi-instance safety) ── */
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX = 5;

async function isRateLimited(ip: string): Promise<boolean> {
    const route = 'feedback';
    const now = new Date();
    const windowStart = new Date(now.getTime() - RATE_LIMIT_WINDOW_MS);

    // Clean up expired entries and count current window in one go
    await prisma.rateLimitEntry.deleteMany({
        where: { route, windowEnd: { lt: now } },
    });

    const existing = await prisma.rateLimitEntry.findUnique({
        where: { ip_route: { ip, route } },
    });

    if (!existing) {
        await prisma.rateLimitEntry.create({
            data: { ip, route, count: 1, windowEnd: new Date(now.getTime() + RATE_LIMIT_WINDOW_MS) },
        });
        return false;
    }

    if (existing.windowEnd < now) {
        await prisma.rateLimitEntry.update({
            where: { ip_route: { ip, route } },
            data: { count: 1, windowEnd: new Date(now.getTime() + RATE_LIMIT_WINDOW_MS) },
        });
        return false;
    }

    await prisma.rateLimitEntry.update({
        where: { ip_route: { ip, route } },
        data: { count: existing.count + 1 },
    });

    return existing.count + 1 > RATE_LIMIT_MAX;
}

export async function POST(request: NextRequest) {
    try {
        const ip =
            request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
            request.headers.get('x-real-ip') ||
            'unknown';

        if (await isRateLimited(ip)) {
            return NextResponse.json(
                { error: 'Too many requests. Please wait a moment.' },
                { status: 429 },
            );
        }

        const { firstName, email, note } = await request.json();

        if (!firstName || typeof firstName !== 'string' || firstName.trim().length === 0) {
            return NextResponse.json({ error: 'First name is required' }, { status: 400 });
        }
        if (!note || typeof note !== 'string' || note.trim().length === 0) {
            return NextResponse.json({ error: 'Note is required' }, { status: 400 });
        }
        if (firstName.trim().length > 100) {
            return NextResponse.json({ error: 'First name is too long' }, { status: 400 });
        }
        if (note.trim().length > 2000) {
            return NextResponse.json({ error: 'Note is too long (max 2000 characters)' }, { status: 400 });
        }
        if (email && (typeof email !== 'string' || email.trim().length > 255)) {
            return NextResponse.json({ error: 'Invalid email' }, { status: 400 });
        }

        await prisma.feedback.create({
            data: {
                firstName: firstName.trim(),
                email: email?.trim() || null,
                note: note.trim(),
            },
        });

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('Feedback error:', error);
        return NextResponse.json({ error: 'Failed to submit feedback' }, { status: 500 });
    }
}
