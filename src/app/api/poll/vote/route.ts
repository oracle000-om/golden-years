import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getPollResults } from '@/lib/poll-utils';

/**
 * Simple in-memory rate limiter for poll votes.
 * Tracks IP + poll combos to prevent spam.
 * Resets on server restart (acceptable for this scale).
 */
const RATE_LIMIT_WINDOW_MS = 60_000; // 1 minute
const RATE_LIMIT_MAX = 10; // max votes per window per IP

const ipVoteCounts = new Map<string, { count: number; resetAt: number }>();

function isRateLimited(ip: string): boolean {
    const now = Date.now();
    const entry = ipVoteCounts.get(ip);

    if (!entry || now > entry.resetAt) {
        ipVoteCounts.set(ip, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
        return false;
    }

    entry.count++;
    return entry.count > RATE_LIMIT_MAX;
}

export async function POST(request: NextRequest) {
    try {
        // Rate limiting
        const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
            || request.headers.get('x-real-ip')
            || 'unknown';

        if (isRateLimited(ip)) {
            return NextResponse.json(
                { error: 'Too many votes. Please wait a moment.' },
                { status: 429 }
            );
        }

        const body = await request.json();
        const { pollId, choice, neitherText, voterToken } = body;

        if (!pollId || !choice || !voterToken) {
            return NextResponse.json(
                { error: 'Missing required fields' },
                { status: 400 }
            );
        }

        if (!['FOR', 'AGAINST', 'NEITHER'].includes(choice)) {
            return NextResponse.json(
                { error: 'Invalid choice' },
                { status: 400 }
            );
        }

        if (choice === 'NEITHER' && (!neitherText || !neitherText.trim())) {
            return NextResponse.json(
                { error: 'Please share your thoughts when choosing "Neither"' },
                { status: 400 }
            );
        }

        // Upsert so users can change their vote
        await prisma.pollVote.upsert({
            where: {
                pollId_voterToken: { pollId, voterToken },
            },
            create: {
                pollId,
                choice,
                neitherText: choice === 'NEITHER' ? neitherText?.trim() : null,
                voterToken,
            },
            update: {
                choice,
                neitherText: choice === 'NEITHER' ? neitherText?.trim() : null,
            },
        });

        // Return aggregated results
        const results = await getPollResults(pollId);

        return NextResponse.json({ success: true, results });
    } catch (error) {
        console.error('Poll vote error:', error);
        return NextResponse.json(
            { error: 'Failed to record vote' },
            { status: 500 }
        );
    }
}

export async function DELETE(request: NextRequest) {
    try {
        const body = await request.json();
        const { pollId, voterToken } = body as { pollId: string; voterToken: string };

        if (!pollId || !voterToken) {
            return NextResponse.json(
                { error: 'Missing required fields' },
                { status: 400 }
            );
        }

        const deleted = await prisma.pollVote.deleteMany({
            where: { pollId, voterToken },
        });

        if (deleted.count === 0) {
            return NextResponse.json(
                { error: 'No vote found to undo' },
                { status: 404 }
            );
        }

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('Poll undo error:', error);
        return NextResponse.json(
            { error: 'Failed to undo vote' },
            { status: 500 }
        );
    }
}
