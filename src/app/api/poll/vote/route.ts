import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getPollResults } from '@/lib/poll-utils';

export async function POST(request: NextRequest) {
    try {
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

