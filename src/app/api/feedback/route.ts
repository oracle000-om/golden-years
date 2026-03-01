import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { createRateLimiter, getClientIp } from '@/lib/rate-limit';

const limiter = createRateLimiter('feedback', 5);

export async function POST(request: NextRequest) {
    try {
        const ip = getClientIp(request);
        const rateCheck = await limiter.check(ip);
        if (!rateCheck.allowed) {
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
