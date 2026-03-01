/**
 * Run Retry Queue — Process Failed Scraper Upserts
 *
 * Standalone script to retry unresolved scrape failures.
 * The retry handler deserializes the stored failure payload and
 * re-attempts the Prisma upsert. Most failures are transient
 * (DB timeout, connection reset) so the same payload works on retry.
 *
 * Usage:
 *   npx tsx scraper/run-retry.ts                  # all pipelines
 *   npx tsx scraper/run-retry.ts --pipeline=petfinder
 */

import 'dotenv/config';
import { getFailureSummary, processRetryQueue } from './lib/retry-queue';
import { sendAlert } from './lib/alert';
import { createPrismaClient } from './lib/prisma';
import { startRun, finishRun } from './lib/scrape-run';
import { upsertAnimalChildren, stripChildFields } from './lib/upsert-children';

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

    const runId = await startRun('retry-queue', { pipelineArg });

    // Initialize Prisma for retry upserts
    const prisma = await createPrismaClient();

    let totalResolved = 0;
    let totalExhausted = 0;
    let totalProcessed = 0;

    for (const [pipeline] of pipelines) {
        console.log(`   Processing ${pipeline}...`);
        const result = await processRetryQueue(pipeline, 3, async (failure) => {
            // Generic retry: re-attempt the animal upsert using stored identifiers.
            // Most failures are transient DB issues (timeout, connection reset, lock contention).
            // Re-doing the upsert with the same shelter/animal ID resolves most of these.
            const shelterId = failure.shelterId;
            const intakeId = failure.animalIntakeId;

            if (!shelterId || !intakeId) {
                throw new Error(`Missing shelterId or intakeId — cannot retry`);
            }

            // Check if the animal was already successfully upserted in a later run
            const existing = await prisma.animal.findFirst({
                where: {
                    shelterId,
                    intakeId,
                },
                select: { id: true, updatedAt: true },
            });

            if (existing) {
                // Animal exists — failure was already resolved by a subsequent scrape run
                console.log(`      ✅ ${intakeId} already exists (updated ${existing.updatedAt.toISOString()}) — marking resolved`);
                return; // Success — processRetryQueue will mark as resolved
            }

            // If the failure has a stored payload, attempt to re-create the record
            if (failure.payload && typeof failure.payload === 'object') {
                const payload = failure.payload as Record<string, any>;
                if (payload.data) {
                    // Attempt the upsert with the stored data
                    const record = await prisma.animal.create({
                        data: {
                            shelterId,
                            intakeId,
                            ...stripChildFields(payload.data),
                            firstSeenAt: new Date(),
                            daysInShelter: 0,
                        },
                    });
                    await upsertAnimalChildren(prisma, record.id, payload.data);
                    console.log(`      ✅ ${intakeId} re-created from stored payload`);
                    return;
                }
            }

            // No payload and no existing record — can't do anything useful
            throw new Error(`No existing record and no stored payload for ${intakeId}`);
        });

        console.log(`      Processed: ${result.processed}, Resolved: ${result.resolved}, Exhausted: ${result.exhausted}`);
        totalResolved += result.resolved;
        totalExhausted += result.exhausted;
        totalProcessed += result.processed;
    }

    console.log(`\n🏁 Done. Resolved: ${totalResolved}, Exhausted: ${totalExhausted}`);

    await finishRun(runId, {
        created: 0,
        updated: totalResolved,
        errors: totalExhausted,
        errorSummary: totalExhausted > 0 ? `${totalExhausted} failures exhausted max retries` : undefined,
    });

    if (totalExhausted > 0) {
        sendAlert('WARNING', `Retry queue: ${totalExhausted} failures exhausted max retries`, {
            pipeline: pipelineArg ?? 'all',
        });
    }

    process.exit(totalExhausted > 0 ? 1 : 0);
}

main();
