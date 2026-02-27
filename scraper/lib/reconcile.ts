/**
 * Ultra-Conservative Reconciliation Module
 *
 * Design principle: "It is better to show 100 animals that have already been
 * adopted than to hide 1 animal that is still waiting. A false removal has
 * a body count. A stale listing does not."
 *
 * Two-phase delisting with multi-strike protection:
 *
 *   Phase 1 — STALE (soft hide):
 *     Animal must be missed by 5+ consecutive scraper runs AND unseen for
 *     14+ days before moving to STALE. Stale animals are hidden from the
 *     public listing but fully preserved in the database.
 *
 *   Phase 2 — DELISTED (hard remove):
 *     Animals in STALE for 30+ days with continued misses are auto-delisted
 *     as a final fallback. Admin can also manually delist via dashboard.
 *
 *   Auto-Recovery:
 *     If any scraper sees the animal again (even from a different pipeline),
 *     it is immediately restored to AVAILABLE. Data is never destroyed.
 *
 * Safeguard layers (unchanged from v1):
 *   Layer 1: Zero-result circuit breaker (skip if pipeline found 0 animals)
 *   Layer 2: Per-shelter fraction guard (skip if >20% would go stale)
 *   Layer 3: Absolute cap (abort if total transitions exceed 200 per run)
 */

import { sendAlert } from './alert';

// ── Thresholds ─────────────────────────────────────────

/** How many consecutive scraper misses before an animal becomes STALE */
const STALE_STRIKE_THRESHOLD = 5;

/** How long an animal must be unseen before becoming STALE (ms) */
const STALE_GRACE_PERIOD_MS = 14 * 24 * 60 * 60 * 1000; // 14 days

/** How long an animal must be in STALE before auto-delisting (ms) */
const AUTO_DELIST_AFTER_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

/** Skip a shelter if more than this fraction would transition */
const MAX_TRANSITION_FRACTION = 0.20;

/** Never transition more than this many animals in one pipeline run */
const MAX_TRANSITIONS_PER_RUN = 200;


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
    totalStaled: number;
    totalMissIncremented: number;
    skippedShelters: number;
    aborted: boolean;
}

/**
 * Two-phase reconciliation: increment misses → stale → delist.
 *
 * For each shelter in this pipeline:
 *   1. Increment consecutiveMisses for all unseen animals
 *   2. Transition to STALE if misses ≥ 5 AND unseen ≥ 14 days
 *   3. Auto-delist if in STALE for ≥ 30 days
 *
 * Safeguards apply to steps 2 and 3.
 */
export async function reconcileAnimals(opts: ReconcileOptions): Promise<ReconcileResult> {
    const { pipeline, prisma, shelterIds, created, updated } = opts;
    const result: ReconcileResult = {
        totalDelisted: 0,
        totalStaled: 0,
        totalMissIncremented: 0,
        skippedShelters: 0,
        aborted: false,
    };

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

    // Cutoff timestamps
    const now = new Date();
    const staleGraceCutoff = new Date(now.getTime() - STALE_GRACE_PERIOD_MS);
    const autoDelistCutoff = new Date(now.getTime() - AUTO_DELIST_AFTER_MS);

    for (const shelterId of shelterIds) {
        try {
            // ─────────────────────────────────────────────
            // Step 1: Increment consecutiveMisses for all
            // animals at this shelter that were NOT touched
            // by this scraper run (lastSeenAt is old).
            // ─────────────────────────────────────────────
            // "Recently seen" = lastSeenAt within the last 2 hours
            // (generous window to account for long-running scraper batches)
            const recentCutoff = new Date(now.getTime() - 2 * 60 * 60 * 1000);

            const missIncrement = await prisma.animal.updateMany({
                where: {
                    shelterId,
                    status: { in: ['AVAILABLE', 'URGENT'] },
                    lastSeenAt: { lt: recentCutoff },
                },
                data: {
                    consecutiveMisses: { increment: 1 },
                },
            });
            result.totalMissIncremented += missIncrement.count;

            // ─────────────────────────────────────────────
            // Step 2: Transition AVAILABLE/URGENT → STALE
            // Requires: consecutiveMisses ≥ 5 AND unseen ≥ 14 days
            // ─────────────────────────────────────────────
            const activeCount = await prisma.animal.count({
                where: {
                    shelterId,
                    status: { in: ['AVAILABLE', 'URGENT'] },
                },
            });

            if (activeCount === 0) continue;

            const staleEligibleCount = await prisma.animal.count({
                where: {
                    shelterId,
                    status: { in: ['AVAILABLE', 'URGENT'] },
                    consecutiveMisses: { gte: STALE_STRIKE_THRESHOLD },
                    lastSeenAt: { lt: staleGraceCutoff },
                },
            });

            if (staleEligibleCount === 0) continue;

            // ── Layer 2: Fraction guard ───────────────────
            const fraction = staleEligibleCount / activeCount;
            if (fraction > MAX_TRANSITION_FRACTION) {
                console.log(`   ⚠️  Skipping ${shelterId}: would stale ${staleEligibleCount}/${activeCount} (${(fraction * 100).toFixed(0)}% > ${MAX_TRANSITION_FRACTION * 100}% threshold)`);
                result.skippedShelters++;
                continue;
            }

            // ── Layer 3: Absolute cap ─────────────────────
            if (result.totalStaled + staleEligibleCount > MAX_TRANSITIONS_PER_RUN) {
                console.log(`   🛑 ABSOLUTE CAP: Would exceed ${MAX_TRANSITIONS_PER_RUN} total transitions. Aborting.`);
                sendAlert('CRITICAL', `${pipeline}: reconciliation aborted — would exceed ${MAX_TRANSITIONS_PER_RUN} transition cap`, {
                    pipeline, animalCount: result.totalStaled + staleEligibleCount,
                });
                result.aborted = true;
                break;
            }

            // ── Safe to transition → STALE ────────────────
            const staled = await prisma.animal.updateMany({
                where: {
                    shelterId,
                    status: { in: ['AVAILABLE', 'URGENT'] },
                    consecutiveMisses: { gte: STALE_STRIKE_THRESHOLD },
                    lastSeenAt: { lt: staleGraceCutoff },
                },
                data: {
                    status: 'STALE',
                    staleSince: now,
                },
            });

            if (staled.count > 0) {
                console.log(`   🔶 Staled ${staled.count}/${activeCount} animals at ${shelterId} (${STALE_STRIKE_THRESHOLD}+ misses, ${Math.round(STALE_GRACE_PERIOD_MS / (24 * 60 * 60 * 1000))}d+ unseen)`);
                result.totalStaled += staled.count;
            }

            // ─────────────────────────────────────────────
            // Step 3: Auto-delist STALE animals that have
            // been stale for 30+ days (final fallback).
            // ─────────────────────────────────────────────
            const autoDelisted = await prisma.animal.updateMany({
                where: {
                    shelterId,
                    status: 'STALE',
                    staleSince: { lt: autoDelistCutoff },
                },
                data: {
                    status: 'DELISTED',
                    delistedAt: now,
                },
            });

            if (autoDelisted.count > 0) {
                console.log(`   🔴 Auto-delisted ${autoDelisted.count} animals at ${shelterId} (stale for ${Math.round(AUTO_DELIST_AFTER_MS / (24 * 60 * 60 * 1000))}+ days)`);
                result.totalDelisted += autoDelisted.count;
            }
        } catch (err) {
            console.error(`   ⚠ Reconciliation failed for ${shelterId}: ${(err as Error).message?.substring(0, 80)}`);
        }
    }

    // ── Summary alerts ────────────────────────────────────
    if (result.skippedShelters > 0) {
        sendAlert('WARNING', `${pipeline}: ${result.skippedShelters} shelter(s) skipped — too many stale candidates (possible API issue)`, {
            pipeline, totalStaled: result.totalStaled,
        });
    }

    if (result.totalStaled > 0 || result.totalDelisted > 0) {
        console.log(`   📊 Reconciliation: ${result.totalMissIncremented} misses incremented, ${result.totalStaled} → STALE, ${result.totalDelisted} → DELISTED`);
    }

    return result;
}
