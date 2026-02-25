/**
 * Scraper Retry Queue
 *
 * Records failed animal upserts for later retry. Uses the ScrapeFailure
 * table in PostgreSQL so failures survive process restarts.
 */

import { createPrismaClient } from './prisma';

/**
 * Record a failed animal upsert for later retry.
 */
export async function enqueueFailure(
    pipeline: string,
    shelterId: string | null,
    animalIntakeId: string | null,
    error: string,
    payload?: Record<string, unknown>,
): Promise<void> {
    try {
        const prisma = await createPrismaClient();
        await prisma.scrapeFailure.create({
            data: {
                pipeline,
                shelterId,
                animalIntakeId,
                errorMessage: error.substring(0, 1000), // Truncate long errors
                payload: payload ? JSON.parse(JSON.stringify(payload)) : undefined,
            },
        });
    } catch (err) {
        // Non-fatal: if we can't even write the failure, just log it
        console.error(`   ⚠ Failed to enqueue retry: ${(err as Error).message?.substring(0, 80)}`);
    }
}

/**
 * Get counts of unresolved failures by pipeline.
 */
export async function getFailureSummary(): Promise<Record<string, number>> {
    const prisma = await createPrismaClient();
    const results = await prisma.scrapeFailure.groupBy({
        by: ['pipeline'],
        where: { resolvedAt: null },
        _count: true,
    });
    const summary: Record<string, number> = {};
    for (const r of results) {
        summary[r.pipeline] = r._count;
    }
    return summary;
}

/**
 * Process unresolved failures for a specific pipeline.
 * Calls the provided retry function for each failure.
 * Marks resolved on success, increments retryCount on failure.
 *
 * @param pipeline — pipeline name to retry (e.g. 'petfinder', 'shelterluv')
 * @param maxRetries — max retry attempts before giving up
 * @param retryFn — async function that attempts to process the failure payload
 */
export async function processRetryQueue(
    pipeline: string,
    maxRetries: number,
    retryFn: (failure: { shelterId: string | null; animalIntakeId: string | null; payload: unknown }) => Promise<void>,
): Promise<{ processed: number; resolved: number; exhausted: number }> {
    const prisma = await createPrismaClient();

    const failures = await prisma.scrapeFailure.findMany({
        where: {
            pipeline,
            resolvedAt: null,
            retryCount: { lt: maxRetries },
        },
        orderBy: { createdAt: 'asc' },
        take: 500, // Process in batches
    });

    let resolved = 0;
    let exhausted = 0;

    for (const failure of failures) {
        try {
            await retryFn({
                shelterId: failure.shelterId,
                animalIntakeId: failure.animalIntakeId,
                payload: failure.payload,
            });
            // Success — mark resolved
            await prisma.scrapeFailure.update({
                where: { id: failure.id },
                data: { resolvedAt: new Date() },
            });
            resolved++;
        } catch {
            const newCount = failure.retryCount + 1;
            await prisma.scrapeFailure.update({
                where: { id: failure.id },
                data: { retryCount: newCount },
            });
            if (newCount >= maxRetries) exhausted++;
        }
    }

    return { processed: failures.length, resolved, exhausted };
}
