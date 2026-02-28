/**
 * Conditional Scrape Gate
 *
 * Checks whether a pipeline actually needs to run by looking at
 * the most recent successful ScrapeRun. If the last run was recent
 * enough AND error-free, the pipeline can be skipped entirely.
 *
 * This saves significant CI minutes on sources that update slowly
 * (e.g., shelters that only post new animals once a day).
 *
 * Usage in a runner:
 *   import { shouldScrape } from './lib/should-scrape';
 *   if (!await shouldScrape('petfinder', { minIntervalMs: 6 * 60 * 60 * 1000 })) {
 *       console.log('⏭ Skipping — last run was recent and clean');
 *       process.exit(0);
 *   }
 */

import { createPrismaClient } from './prisma';

interface ShouldScrapeOptions {
    /**
     * Minimum interval between successful runs before we scrape again.
     * Default: 6 hours. If the last SUCCESS/PARTIAL run started less
     * than this many ms ago, we skip.
     */
    minIntervalMs?: number;

    /**
     * If true, also skip when the last run was PARTIAL (had some errors
     * but still succeeded overall). Default: false — only skip on
     * fully clean SUCCESS runs.
     */
    skipOnPartial?: boolean;

    /**
     * Shard number, if applicable. When sharded, we check for the
     * specific shard's last run via metadata.
     */
    shard?: number;
}

const DEFAULT_MIN_INTERVAL_MS = 6 * 60 * 60 * 1000; // 6 hours

export async function shouldScrape(
    pipeline: string,
    opts: ShouldScrapeOptions = {},
): Promise<boolean> {
    const {
        minIntervalMs = DEFAULT_MIN_INTERVAL_MS,
        skipOnPartial = false,
        shard,
    } = opts;

    // Always scrape if --force is passed
    if (process.argv.includes('--force')) {
        console.log('🔄 --force flag: scraping regardless of last run');
        return true;
    }

    try {
        const prisma = await createPrismaClient();

        // Find the most recent successful run for this pipeline
        const statuses = skipOnPartial
            ? (['SUCCESS', 'PARTIAL'] as const)
            : (['SUCCESS'] as const);
        const lastRun = await prisma.scrapeRun.findFirst({
            where: {
                pipeline,
                status: { in: statuses as unknown as any },
            },
            orderBy: { startedAt: 'desc' },
        });

        if (!lastRun) {
            // Never run successfully — definitely scrape
            console.log(`🔄 No prior successful run for "${pipeline}" — proceeding`);
            return true;
        }

        // If sharded, check that the last run was for the same shard
        if (shard != null && lastRun.metadata) {
            const meta = lastRun.metadata as Record<string, unknown>;
            if (meta.shard !== shard) {
                // Last run was a different shard — scrape this one
                return true;
            }
        }

        const elapsed = Date.now() - lastRun.startedAt.getTime();
        if (elapsed < minIntervalMs) {
            const hoursAgo = (elapsed / (60 * 60 * 1000)).toFixed(1);
            const minHours = (minIntervalMs / (60 * 60 * 1000)).toFixed(1);
            console.log(`⏭ Skipping "${pipeline}" — last successful run was ${hoursAgo}h ago (min interval: ${minHours}h)`);
            console.log(`   Last run: ${lastRun.id} | status: ${lastRun.status} | created: ${lastRun.animalsCreated}, updated: ${lastRun.animalsUpdated}`);
            return false;
        }

        return true;
    } catch (err) {
        // If we can't check, default to scraping (safe fallback)
        console.warn(`⚠ Could not check last run for "${pipeline}": ${(err as Error).message?.substring(0, 80)}`);
        return true;
    }
}
