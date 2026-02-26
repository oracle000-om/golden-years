/**
 * Scrape Run Tracking
 *
 * Records pipeline execution history in the ScrapeRun table.
 * Every scraper runner should call startRun() at the beginning
 * and finishRun() or failRun() at the end.
 */

import { createPrismaClient } from './prisma';

/**
 * Record the start of a pipeline run.
 * @returns The run ID for later finishRun/failRun calls.
 */
export async function startRun(
    pipeline: string,
    metadata?: Record<string, unknown>,
): Promise<string> {
    try {
        const prisma = await createPrismaClient();
        const run = await prisma.scrapeRun.create({
            data: {
                pipeline,
                metadata: metadata ? JSON.parse(JSON.stringify(metadata)) : undefined,
            },
        });
        return run.id;
    } catch (err) {
        // Non-fatal: if we can't write the run record, log and return a sentinel
        console.error(`   ⚠ Failed to record scrape run start: ${(err as Error).message?.substring(0, 80)}`);
        return '';
    }
}

/**
 * Record a successful (or partial) completion of a pipeline run.
 */
export async function finishRun(
    runId: string,
    stats: {
        created: number;
        updated: number;
        errors: number;
        errorSummary?: string;
    },
): Promise<void> {
    if (!runId) return; // Sentinel from failed startRun

    try {
        const prisma = await createPrismaClient();
        const run = await prisma.scrapeRun.findUnique({ where: { id: runId } });
        const durationMs = run?.startedAt
            ? Date.now() - run.startedAt.getTime()
            : null;

        await prisma.scrapeRun.update({
            where: { id: runId },
            data: {
                status: stats.errors > 0 ? 'PARTIAL' : 'SUCCESS',
                finishedAt: new Date(),
                durationMs,
                animalsCreated: stats.created,
                animalsUpdated: stats.updated,
                errors: stats.errors,
                errorSummary: stats.errorSummary?.substring(0, 1000),
            },
        });
    } catch (err) {
        console.error(`   ⚠ Failed to record scrape run finish: ${(err as Error).message?.substring(0, 80)}`);
    }
}

/**
 * Record a total failure of a pipeline run.
 */
export async function failRun(runId: string, error: string): Promise<void> {
    if (!runId) return;

    try {
        const prisma = await createPrismaClient();
        const run = await prisma.scrapeRun.findUnique({ where: { id: runId } });
        const durationMs = run?.startedAt
            ? Date.now() - run.startedAt.getTime()
            : null;

        await prisma.scrapeRun.update({
            where: { id: runId },
            data: {
                status: 'FAILED',
                finishedAt: new Date(),
                durationMs,
                errorSummary: error.substring(0, 1000),
            },
        });
    } catch (err) {
        console.error(`   ⚠ Failed to record scrape run failure: ${(err as Error).message?.substring(0, 80)}`);
    }
}
