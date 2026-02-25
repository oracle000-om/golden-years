/**
 * Run Retry Queue — Process Failed Scraper Upserts
 *
 * Standalone script to retry unresolved scrape failures.
 * Can be run manually or added to CI schedule.
 *
 * Usage:
 *   npx tsx scraper/run-retry.ts                  # all pipelines
 *   npx tsx scraper/run-retry.ts --pipeline=petfinder
 */

import 'dotenv/config';
import { getFailureSummary, processRetryQueue } from './lib/retry-queue';
import { sendAlert } from './lib/alert';

async function main() {
    const pipelineArg = process.argv.find(a => a.startsWith('--pipeline='))?.split('=')[1];

    console.log('🔄 Golden Years Club — Retry Queue Processor\n');

    // Show summary
    const summary = await getFailureSummary();
    const entries = Object.entries(summary);

    if (entries.length === 0) {
        console.log('   ✅ No unresolved failures. Queue is empty.');
        process.exit(0);
    }

    console.log('   Unresolved failures:');
    for (const [pipeline, count] of entries) {
        console.log(`      ${pipeline}: ${count}`);
    }
    console.log('');

    // Filter to specific pipeline if requested
    const pipelines = pipelineArg
        ? entries.filter(([p]) => p === pipelineArg)
        : entries;

    if (pipelines.length === 0) {
        console.log(`   ⚠ No failures for pipeline: ${pipelineArg}`);
        process.exit(0);
    }

    let totalResolved = 0;
    let totalExhausted = 0;

    for (const [pipeline] of pipelines) {
        console.log(`   Processing ${pipeline}...`);
        const result = await processRetryQueue(pipeline, 3, async (failure) => {
            // Generic retry: re-attempt the upsert using the stored payload
            // This is a placeholder — each pipeline can implement specific retry logic
            console.log(`      Retrying ${failure.animalIntakeId ?? 'unknown'} from ${failure.shelterId ?? 'unknown'}...`);
            // For now, just log that we'd retry. Real retry logic would be pipeline-specific.
            throw new Error('Generic retry not yet implemented — pipeline-specific handlers needed');
        });

        console.log(`      Processed: ${result.processed}, Resolved: ${result.resolved}, Exhausted: ${result.exhausted}`);
        totalResolved += result.resolved;
        totalExhausted += result.exhausted;
    }

    console.log(`\n🏁 Done. Resolved: ${totalResolved}, Exhausted: ${totalExhausted}`);

    if (totalExhausted > 0) {
        sendAlert('WARNING', `Retry queue: ${totalExhausted} failures exhausted max retries`, {
            pipeline: pipelineArg ?? 'all',
        });
    }

    process.exit(0);
}

main();
