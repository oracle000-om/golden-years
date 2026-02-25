/**
 * Search API — parses NL queries and returns filtered animals.
 * GET /api/search?q=female pit bull in texas
 */
import { NextRequest, NextResponse } from 'next/server';
import { parseSearchQuery } from '@/lib/search-parser';
import { searchAnimals } from '@/lib/queries';
import { createRateLimiter, getClientIp } from '@/lib/rate-limit';

export const dynamic = 'force-dynamic';

const limiter = createRateLimiter('search', 60); // 60 req/min per IP

export async function GET(request: NextRequest) {
    const ip = getClientIp(request);
    const result = limiter.check(ip);
    if (!result.allowed) {
        return NextResponse.json({ error: 'Too many requests' }, { status: 429 });
    }

    const q = request.nextUrl.searchParams.get('q') || '';

    if (!q.trim()) {
        return NextResponse.json({ animals: [], intent: null });
    }

    const intent = parseSearchQuery(q);

    try {
        const animals = await searchAnimals(intent);
        return NextResponse.json({
            animals,
            intent,
            total: animals.length,
        });
    } catch (error) {
        console.error('Search API error:', error);
        return NextResponse.json({ error: 'Search failed' }, { status: 500 });
    }
}
