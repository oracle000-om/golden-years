import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getPollResults } from '@/lib/poll-utils';

export async function GET(request: NextRequest) {
    try {
        const { searchParams } = new URL(request.url);
        const pollId = searchParams.get('pollId');
        const voterToken = searchParams.get('voterToken');

        if (!pollId || !voterToken) {
            return NextResponse.json(
                { error: 'Missing required parameters' },
                { status: 400 }
            );
        }

        // Check if this token has voted
        const existingVote = await prisma.pollVote.findUnique({
            where: {
                pollId_voterToken: { pollId, voterToken },
            },
            select: { choice: true },
        });

        if (!existingVote) {
            return NextResponse.json({ hasVoted: false });
        }

        // Return aggregated results + the user's choice
        const results = await getPollResults(pollId);

        return NextResponse.json({
            hasVoted: true,
            userChoice: existingVote.choice,
            results,
        });
    } catch (error) {
        console.error('Poll results error:', error);
        return NextResponse.json(
            { error: 'Failed to load results' },
            { status: 500 }
        );
    }
}
