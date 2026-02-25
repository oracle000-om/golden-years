import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

/* ── Rate limiter ── */
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX = 5;
const ipCounts = new Map<string, { count: number; resetAt: number }>();

function isRateLimited(ip: string): boolean {
    const now = Date.now();
    const entry = ipCounts.get(ip);
    if (!entry || now > entry.resetAt) {
        ipCounts.set(ip, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
        return false;
    }
    entry.count++;
    return entry.count > RATE_LIMIT_MAX;
}

export async function POST(request: NextRequest) {
    try {
        const ip =
            request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
            request.headers.get('x-real-ip') ||
            'unknown';

        if (isRateLimited(ip)) {
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
