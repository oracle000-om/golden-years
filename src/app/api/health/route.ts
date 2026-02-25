import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
    // Require API key in production
    const apiKey = request.headers.get('x-api-key');
    const expectedKey = process.env.HEALTH_API_KEY;
    if (expectedKey && apiKey !== expectedKey) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const startTs = Date.now();

    try {
        // DB connectivity check
        const [animalCount, shelterCount, lastScrape] = await Promise.all([
            prisma.animal.count(),
            prisma.shelter.count(),
            prisma.shelter.findFirst({
                where: { lastScrapedAt: { not: null } },
                orderBy: { lastScrapedAt: 'desc' },
                select: { lastScrapedAt: true, name: true },
            }),
        ]);

        const dbLatencyMs = Date.now() - startTs;

        // Stale data warning: if last scrape was >24h ago
        const lastScrapeTime = lastScrape?.lastScrapedAt;
        const hoursSinceLastScrape = lastScrapeTime
            ? (Date.now() - lastScrapeTime.getTime()) / (1000 * 60 * 60)
            : null;
        const staleDataWarning = hoursSinceLastScrape !== null && hoursSinceLastScrape > 24
            ? `Last scrape was ${Math.round(hoursSinceLastScrape)}h ago (${lastScrape?.name})`
            : null;

        // Retry queue status
        let unresolvedFailures = 0;
        try {
            unresolvedFailures = await prisma.scrapeFailure.count({
                where: { resolvedAt: null },
            });
        } catch {
            // Table may not exist yet
        }

        return NextResponse.json({
            status: 'ok',
            db: 'connected',
            dbLatencyMs,
            animalCount,
            shelterCount,
            lastScrape: lastScrapeTime?.toISOString() ?? null,
            staleDataWarning,
            unresolvedFailures,
            uptime: process.uptime(),
        });
    } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        return NextResponse.json({
            status: 'error',
            db: 'disconnected',
            error: msg,
        }, { status: 500 });
    }
}
