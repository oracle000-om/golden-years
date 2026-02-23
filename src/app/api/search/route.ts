/**
 * Search API — parses NL queries and returns filtered animals.
 * GET /api/search?q=female pit bull in texas
 */
import { NextRequest, NextResponse } from 'next/server';
import { parseSearchQuery } from '@/lib/search-parser';
import { searchAnimals } from '@/lib/queries';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
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
