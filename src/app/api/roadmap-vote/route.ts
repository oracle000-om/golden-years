import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { createRateLimiter, getClientIp } from '@/lib/rate-limit';

const VALID_CHOICES = ['enhance_site', 'grants', 'vet_costs', 'new_programs'] as const;
const limiter = createRateLimiter('roadmap-vote', 10);

async function getResults() {
    const votes = await prisma.roadmapVote.findMany({ select: { choice: true } });
    const total = votes.length;
    const counts: Record<string, number> = {};
    for (const c of VALID_CHOICES) counts[c] = 0;
    for (const v of votes) counts[v.choice] = (counts[v.choice] || 0) + 1;

    const percentages: Record<string, number> = {};
    for (const c of VALID_CHOICES) {
        percentages[c] = total > 0 ? Math.round((counts[c] / total) * 100) : 0;
    }

    return { total, counts, percentages };
}

/* ── POST: cast / change vote ── */
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

        const { choice, voterToken } = await request.json();

        if (!choice || !voterToken) {
            return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
        }

        if (!VALID_CHOICES.includes(choice)) {
            return NextResponse.json({ error: 'Invalid choice' }, { status: 400 });
        }

        await prisma.roadmapVote.upsert({
            where: { voterToken },
            create: { choice, voterToken, ipAddress: ip },
            update: { choice, ipAddress: ip },
        });

        const results = await getResults();
        return NextResponse.json({ success: true, results, userChoice: choice });
    } catch (error) {
        console.error('Roadmap vote error:', error);
        return NextResponse.json({ error: 'Failed to record vote' }, { status: 500 });
    }
}

/* ── DELETE: undo vote ── */
export async function DELETE(request: NextRequest) {
    try {
        const ip = getClientIp(request);
        const rateCheck = await limiter.check(ip);
        if (!rateCheck.allowed) {
            return NextResponse.json(
                { error: 'Too many requests. Please wait a moment.' },
                { status: 429 },
            );
        }

        const voterToken = new URL(request.url).searchParams.get('voterToken');
        if (!voterToken) {
            return NextResponse.json({ error: 'Missing voterToken' }, { status: 400 });
        }

        await prisma.roadmapVote.deleteMany({ where: { voterToken } });

        const results = await getResults();
        return NextResponse.json({ success: true, results });
    } catch (error) {
        console.error('Roadmap undo error:', error);
        return NextResponse.json({ error: 'Failed to undo vote' }, { status: 500 });
    }
}

/* ── GET: check existing vote + results ── */
export async function GET(request: NextRequest) {
    try {
        const voterToken = new URL(request.url).searchParams.get('voterToken');
        if (!voterToken) {
            return NextResponse.json({ error: 'Missing voterToken' }, { status: 400 });
        }

        const existing = await prisma.roadmapVote.findUnique({
            where: { voterToken },
            select: { choice: true },
        });

        if (!existing) {
            return NextResponse.json({ voted: false });
        }

        const results = await getResults();
        return NextResponse.json({ voted: true, userChoice: existing.choice, results });
    } catch (error) {
        console.error('Roadmap results error:', error);
        return NextResponse.json({ error: 'Failed to load results' }, { status: 500 });
    }
}
