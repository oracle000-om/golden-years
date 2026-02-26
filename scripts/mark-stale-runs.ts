/**
 * Mark Stale Runs — watchdog for ScrapeRun records stuck in RUNNING.
 *
 * If a scrape run has been in RUNNING status for more than MAX_DURATION,
 * it likely crashed without calling finishRun. This script marks them
 * as FAILED so dashboards accurately reflect pipeline health.
 *
 * Usage:
 *   npx tsx scripts/mark-stale-runs.ts              # default: 4h max
 *   npx tsx scripts/mark-stale-runs.ts --max-hours=2
 *   npx tsx scripts/mark-stale-runs.ts --dry-run
 */

import 'dotenv/config';
import { createPrismaClient } from '../scraper/lib/prisma';

async function main() {
    const dryRun = process.argv.includes('--dry-run');
    const maxHoursArg = process.argv.find(a => a.startsWith('--max-hours='))?.split('=')[1];
    const MAX_HOURS = Math.max(1, parseInt(maxHoursArg || '4', 10));

    console.log(`🔍 Stale Run Watchdog — marking runs stuck >${MAX_HOURS}h${dryRun ? ' (DRY RUN)' : ''}`);

    const prisma = await createPrismaClient();
    const cutoff = new Date(Date.now() - MAX_HOURS * 60 * 60 * 1000);

    // Find stale runs
    const staleRuns = await (prisma as any).scrapeRun.findMany({
        where: {
            status: 'RUNNING',
            startedAt: { lt: cutoff },
        },
        select: { id: true, pipeline: true, startedAt: true },
    });

    console.log(`   Found ${staleRuns.length} stale runs`);

    if (dryRun) {
        for (const run of staleRuns) {
            const elapsed = ((Date.now() - new Date(run.startedAt).getTime()) / 3600000).toFixed(1);
            console.log(`   Would mark FAILED: ${run.pipeline} (id: ${run.id}, running ${elapsed}h)`);
        }
    } else {
        const now = new Date();
        for (const run of staleRuns) {
            const elapsed = ((now.getTime() - new Date(run.startedAt).getTime()) / 3600000).toFixed(1);
            await (prisma as any).scrapeRun.update({
                where: { id: run.id },
                data: {
                    status: 'FAILED',
                    finishedAt: now,
                    durationMs: now.getTime() - new Date(run.startedAt).getTime(),
                    errorSummary: `Watchdog: marked as failed after ${elapsed}h with no completion signal`,
                },
            });
            console.log(`   ✅ Marked FAILED: ${run.pipeline} (${elapsed}h stale)`);
        }
    }

    console.log(`\n✅ Done`);
    process.exit(0);
}

main().catch(err => {
    console.error('Fatal:', err);
    process.exit(1);
});
