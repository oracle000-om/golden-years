/**
 * Shared Reconciliation Module
 *
 * Centralizes the "delist stale animals" logic with multi-layered safeguards:
 *
 * Layer 1: Zero-result circuit breaker (skip if pipeline got 0 animals)
 * Layer 2: Per-shelter percentage guard (skip if >50% of shelter would be delisted)
 * Layer 3: Absolute cap (abort if total delistings would exceed MAX_DELIST_PER_RUN)
 *
 * All 7 scraper runners should use this instead of inlining reconciliation.
 */

import { sendAlert } from './alert';

/** Never delist more than this many animals in one pipeline run */
const MAX_DELIST_PER_RUN = 500;

/** Skip a shelter's reconciliation if it would delist more than this fraction */
const MAX_DELIST_FRACTION = 0.5;

/** Animals must be unseen for this long before delisting (ms) */
const GRACE_PERIOD_MS = 48 * 60 * 60 * 1000;

export interface ReconcileOptions {
    /** Pipeline name for logging/alerts */
    pipeline: string;
    /** Prisma client (typed as any to avoid adapter cast issues) */
    prisma: any;
    /** Shelter IDs to reconcile */
    shelterIds: string[];
    /** Total animals created in this run */
    created: number;
    /** Total animals updated in this run */
    updated: number;
}

export interface ReconcileResult {
    totalDelisted: number;
    skippedShelters: number;
    aborted: boolean;
}

/**
 * Reconcile stale animals across shelters with safeguards.
 *
 * Returns the count of delisted animals and whether any shelters were skipped.
 */
export async function reconcileAnimals(opts: ReconcileOptions): Promise<ReconcileResult> {
    const { pipeline, prisma, shelterIds, created, updated } = opts;
    const result: ReconcileResult = { totalDelisted: 0, skippedShelters: 0, aborted: false };

    // ── Layer 1: Zero-result circuit breaker ───────────────
    if (created + updated === 0) {
        console.log('\n   ⚠️  CIRCUIT BREAKER: Skipping reconciliation — scraper returned 0 animals.');
        console.log('      This likely means the upstream API is down or has changed.');
        sendAlert('CRITICAL', `${pipeline}: reconciliation skipped — zero animals scraped`, {
            pipeline, animalCount: 0,
        });
        result.aborted = true;
        return result;
    }

    const graceCutoff = new Date(Date.now() - GRACE_PERIOD_MS);

    for (const shelterId of shelterIds) {
        try {
            // ── Layer 2: Percentage guard ──────────────────
            // Count how many active animals this shelter has
            const activeCount = await prisma.animal.count({
                where: {
                    shelterId,
                    status: { in: ['AVAILABLE', 'URGENT'] },
                },
            });

            if (activeCount === 0) continue;

            // Count how many would be delisted
            const staleCount = await prisma.animal.count({
                where: {
                    shelterId,
                    status: { in: ['AVAILABLE', 'URGENT'] },
                    lastSeenAt: { lt: graceCutoff },
                },
            });

            if (staleCount === 0) continue;

            const fraction = staleCount / activeCount;
            if (fraction > MAX_DELIST_FRACTION) {
                console.log(`   ⚠️  Skipping ${shelterId}: would delist ${staleCount}/${activeCount} (${(fraction * 100).toFixed(0)}% > ${MAX_DELIST_FRACTION * 100}% threshold)`);
                result.skippedShelters++;
                continue;
            }

            // ── Layer 3: Absolute cap ─────────────────────
            if (result.totalDelisted + staleCount > MAX_DELIST_PER_RUN) {
                console.log(`   🛑 ABSOLUTE CAP: Would exceed ${MAX_DELIST_PER_RUN} total delistings. Aborting reconciliation.`);
                sendAlert('CRITICAL', `${pipeline}: reconciliation aborted — would exceed ${MAX_DELIST_PER_RUN} delist cap`, {
                    pipeline, animalCount: result.totalDelisted + staleCount,
                });
                result.aborted = true;
                break;
            }

            // ── Safe to delist ─────────────────────────────
            const delisted = await prisma.animal.updateMany({
                where: {
                    shelterId,
                    status: { in: ['AVAILABLE', 'URGENT'] },
                    lastSeenAt: { lt: graceCutoff },
                },
                data: {
                    status: 'DELISTED',
                    delistedAt: new Date(),
                },
            });

            if (delisted.count > 0) {
                console.log(`   🔄 Delisted ${delisted.count}/${activeCount} stale animals from ${shelterId}`);
                result.totalDelisted += delisted.count;
            }
        } catch (err) {
            console.error(`   ⚠ Reconciliation failed for ${shelterId}: ${(err as Error).message?.substring(0, 80)}`);
        }
    }

    if (result.skippedShelters > 0) {
        sendAlert('WARNING', `${pipeline}: ${result.skippedShelters} shelter(s) skipped — too many stale animals (possible API issue)`, {
            pipeline, animalCount: result.totalDelisted,
        });
    }

    return result;
}
