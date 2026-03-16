/**
 * Cross-Source Deduplication with Merge
 *
 * Identifies duplicate animal records caused by the same shelter being scraped
 * from multiple sources (Petfinder, RescueGroups, ShelterLuv, etc.).
 * 
 * MERGES unique data from duplicate records into the best record before delisting:
 *   - Photos (photoUrl, photoUrls, photoHash)
 *   - Description and listing URL
 *   - Age data (ageKnownYears)
 *   - Assessment, enrichment, and listing child records
 *   - Breed information
 *
 * Usage:
 *   npx tsx scripts/dedup-cross-source.ts              # dry run (default)
 *   npx tsx scripts/dedup-cross-source.ts --execute     # merge + delist dupes
 */

import 'dotenv/config';
import { createPrismaClient } from '../scraper/lib/prisma';
import { hammingDistance } from '../scraper/dedup';
import type { PrismaClient } from '../src/generated/prisma';

/** Names that should never be matched (too generic). */
const UNMATCHABLE_NAMES = new Set([
    '', 'unknown', 'n/a', 'na', 'none', 'tbd', 'no name', 'test', 'unnamed',
    'not listed', 'other / not listed',
]);

interface DupeRecord {
    id: string;
    name: string | null;
    species: string;
    breed: string | null;
    shelterId: string;
    photoUrl: string | null;
    photoHash: string | null;
    photoUrls: string[];
    ageKnownYears: number | null;
    ageSource: string;
    listingUrl: string | null;
    description: string | null;
    createdAt: Date;
    assessment: { id: string } | null;
    enrichment: { id: string } | null;
    listing: { id: string; description: string | null } | null;
}

/** Score a record — higher = more data = better to keep. */
function scoreRecord(a: DupeRecord): number {
    let s = 0;
    if (a.assessment) s += 10;          // CV assessment is highest value
    if (a.ageKnownYears !== null) s += 5;
    if (a.listing) s += 4;              // Rich listing data
    if (a.enrichment) s += 3;
    if (a.photoHash) s += 3;
    if (a.photoUrl) s += 2;
    if ((a.photoUrls?.length || 0) > 1) s += 1;
    if (a.breed) s += 1;
    if (a.listingUrl) s += 1;
    if (a.description) s += 1;
    return s;
}

/** Merge unique data from a loser record into the winner. Returns update payload. */
function buildMergePayload(winner: DupeRecord, losers: DupeRecord[]) {
    const updates: Record<string, unknown> = {};
    let mergedPhotoUrls = [...(winner.photoUrls || [])];

    for (const loser of losers) {
        // ── Photos: collect unique URLs ──
        if (loser.photoUrl && !mergedPhotoUrls.includes(loser.photoUrl)) {
            mergedPhotoUrls.push(loser.photoUrl);
        }
        for (const url of (loser.photoUrls || [])) {
            if (!mergedPhotoUrls.includes(url)) {
                mergedPhotoUrls.push(url);
            }
        }

        // ── Fill missing scalar fields ──
        if (!winner.photoUrl && loser.photoUrl) {
            updates.photoUrl = loser.photoUrl;
        }
        if (!winner.photoHash && loser.photoHash) {
            updates.photoHash = loser.photoHash;
        }
        if (winner.ageKnownYears === null && loser.ageKnownYears !== null) {
            updates.ageKnownYears = loser.ageKnownYears;
            updates.ageSource = loser.ageSource;
        }
        if (!winner.description && loser.description) {
            updates.description = loser.description;
        }
        if (!winner.listingUrl && loser.listingUrl) {
            updates.listingUrl = loser.listingUrl;
        }
        if (!winner.breed && loser.breed) {
            updates.breed = loser.breed;
        }
    }

    // Deduplicate and add the winner's own photo
    if (winner.photoUrl && !mergedPhotoUrls.includes(winner.photoUrl)) {
        mergedPhotoUrls.unshift(winner.photoUrl);
    }
    // Remove duplicates
    mergedPhotoUrls = [...new Set(mergedPhotoUrls)];

    if (mergedPhotoUrls.length > (winner.photoUrls?.length || 0)) {
        updates.photoUrls = mergedPhotoUrls;
    }

    return updates;
}

/** Reassign child records (assessment, enrichment, listing) from loser to winner if winner is missing them. */
async function reassignChildRecords(prisma: PrismaClient, winnerId: string, winner: DupeRecord, losers: DupeRecord[]) {
    for (const loser of losers) {
        // Assessment: reassign if winner has none
        if (!winner.assessment && loser.assessment) {
            try {
                await (prisma.animalAssessment as any).update({
                    where: { id: loser.assessment.id },
                    data: { animalId: winnerId },
                });
                winner.assessment = loser.assessment; // prevent further reassignment
            } catch {
                // Unique constraint — winner already got one from another loser
            }
        }

        // Enrichment: reassign if winner has none
        if (!winner.enrichment && loser.enrichment) {
            try {
                await (prisma.animalEnrichment as any).update({
                    where: { id: loser.enrichment.id },
                    data: { animalId: winnerId },
                });
                winner.enrichment = loser.enrichment;
            } catch { /* unique constraint */ }
        }

        // Listing: reassign if winner has none
        if (!winner.listing && loser.listing) {
            try {
                await (prisma.animalListing as any).update({
                    where: { id: loser.listing.id },
                    data: { animalId: winnerId },
                });
                winner.listing = loser.listing;
            } catch { /* unique constraint */ }
        }

        // If winner has listing but no description, and loser listing has one
        if (winner.listing && !winner.listing.description && loser.listing?.description) {
            try {
                await (prisma.animalListing as any).update({
                    where: { id: winner.listing.id },
                    data: { description: loser.listing.description },
                });
            } catch { /* ignore */ }
        }
    }
}

async function main() {
    const execute = process.argv.includes('--execute');
    const force = process.argv.includes('--force');
    console.log(`🔍 Cross-Source Dedup with Merge${execute ? '' : ' (DRY RUN)'}${force ? ' (FORCE — skip photo verification)' : ''}\n`);

    const prisma = await createPrismaClient();

    // Step 1: Find shelter groups (same name, different IDs) with active animals
    console.log('Step 1: Finding shelters with multiple scraper IDs...');
    const shelterGroups = await prisma.$queryRawUnsafe<{ shelter_name: string; ids: string[] }[]>(`
        SELECT LOWER(s.name) as shelter_name, ARRAY_AGG(s.id) as ids
        FROM shelters s
        WHERE EXISTS (
            SELECT 1 FROM animals a
            WHERE a.shelter_id = s.id AND a.status IN ('AVAILABLE', 'URGENT')
        )
        GROUP BY LOWER(s.name)
        HAVING COUNT(DISTINCT s.id) > 1
    `);
    console.log(`  Found ${shelterGroups.length} shelter groups with multiple IDs\n`);

    // Step 2: For each group, find and merge duplicates
    let totalMerged = 0;
    let totalDelisted = 0;
    let childReassigned = 0;
    const operations: Array<{
        winnerId: string;
        winnerName: string;
        loserIds: string[];
        mergePayload: Record<string, unknown>;
        losers: DupeRecord[];
        winner: DupeRecord;
    }> = [];

    for (const group of shelterGroups) {
        const shelterIds = group.ids;

        // Fetch all active animals from all IDs in this shelter group
        const animals = await prisma.animal.findMany({
            where: {
                shelterId: { in: shelterIds },
                status: { in: ['AVAILABLE', 'URGENT'] },
                name: { not: null },
            },
            select: {
                id: true,
                name: true,
                species: true,
                breed: true,
                shelterId: true,
                photoUrl: true,
                photoHash: true,
                photoUrls: true,
                ageKnownYears: true,
                ageSource: true,
                listingUrl: true,
                description: true,
                createdAt: true,
                assessment: { select: { id: true } },
                enrichment: { select: { id: true } },
                listing: { select: { id: true, description: true } },
            },
        }) as DupeRecord[];

        // Group by normalized name + species
        const byKey = new Map<string, DupeRecord[]>();
        for (const a of animals) {
            const name = (a.name || '').toLowerCase().trim();
            if (UNMATCHABLE_NAMES.has(name)) continue;

            const key = `${name}|${a.species}`;
            const list = byKey.get(key) || [];
            list.push(a);
            byKey.set(key, list);
        }

        // Find groups with duplicates from different shelter IDs
        for (const [, dupeGroup] of byKey) {
            const shelterIdSet = new Set(dupeGroup.map(a => a.shelterId));
            if (shelterIdSet.size <= 1) continue;

            // Sort by score (descending), keep best
            const scored = dupeGroup
                .map(a => ({ ...a, score: scoreRecord(a) }))
                .sort((a, b) => b.score - a.score || b.createdAt.getTime() - a.createdAt.getTime());

            const winner = scored[0];
            // Only target losers from DIFFERENT shelter IDs than the winner
            let losers = scored.slice(1).filter(l => l.shelterId !== winner.shelterId);

            if (losers.length === 0) continue;

            // Photo hash verification — only auto-merge when photos confirm match
            if (!force) {
                const PHASH_MERGE_THRESHOLD = 10; // More lenient than dedup's 5 since we already matched by name
                losers = losers.filter(loser => {
                    // Both have photo hashes → require visual similarity
                    if (winner.photoHash && loser.photoHash) {
                        const dist = hammingDistance(winner.photoHash, loser.photoHash);
                        if (dist > PHASH_MERGE_THRESHOLD) {
                            console.log(`  ⚠ Skipping ${loser.name} — name matches but photos differ (hamming: ${dist})`);
                            return false;
                        }
                        return true;
                    }
                    // Missing photo hash on either side → skip (can't verify)
                    console.log(`  ⚠ Skipping ${loser.name} — no photo hash to verify (winner: ${!!winner.photoHash}, loser: ${!!loser.photoHash})`);
                    return false;
                });
                if (losers.length === 0) continue;
            }

            const mergePayload = buildMergePayload(winner, losers);

            operations.push({
                winnerId: winner.id,
                winnerName: winner.name || 'Unnamed',
                loserIds: losers.map(l => l.id),
                mergePayload,
                losers,
                winner,
            });

            totalMerged += Object.keys(mergePayload).length > 0 ? 1 : 0;
            totalDelisted += losers.length;
        }
    }

    console.log(`Step 2: Analysis complete`);
    console.log(`  Duplicate sets found: ${operations.length}`);
    console.log(`  Records to delist: ${totalDelisted}`);
    console.log(`  Winners with data to merge: ${totalMerged}\n`);

    if (!execute) {
        // Show a sample of merges
        const merges = operations.filter(o => Object.keys(o.mergePayload).length > 0).slice(0, 10);
        if (merges.length > 0) {
            console.log('Sample merges:');
            for (const m of merges) {
                const fields = Object.keys(m.mergePayload);
                const photoCount = (m.mergePayload.photoUrls as string[])?.length || 0;
                console.log(`  ${m.winnerName.padEnd(20)} ← merging: ${fields.join(', ')}${photoCount ? ` (${photoCount} total photos)` : ''}`);
            }
        }

        const reassignSamples = operations
            .filter(o => o.losers.some(l => l.assessment || l.enrichment || l.listing))
            .slice(0, 5);
        if (reassignSamples.length > 0) {
            console.log('\nSample child record reassignments:');
            for (const r of reassignSamples) {
                for (const loser of r.losers) {
                    const parts = [];
                    if (loser.assessment && !r.winner.assessment) parts.push('assessment');
                    if (loser.enrichment && !r.winner.enrichment) parts.push('enrichment');
                    if (loser.listing && !r.winner.listing) parts.push('listing');
                    if (parts.length > 0) {
                        console.log(`  ${r.winnerName.padEnd(20)} ← reassign: ${parts.join(', ')} from loser`);
                    }
                }
            }
        }

        console.log(`\n⚠️  Dry run — ${totalDelisted} records would be delisted after merge. Pass --execute to apply.`);
        await prisma.$disconnect();
        process.exit(0);
    }

    // Step 3: Execute merges and delists
    console.log(`Step 3: Executing ${operations.length} merge+delist operations...`);
    let processed = 0;

    for (const op of operations) {
        // 3a. Reassign child records (assessment, enrichment, listing) from losers → winner
        await reassignChildRecords(prisma, op.winnerId, op.winner, op.losers);

        // 3b. Merge scalar/array fields into winner
        if (Object.keys(op.mergePayload).length > 0) {
            await prisma.animal.update({
                where: { id: op.winnerId },
                data: op.mergePayload as any,
            });
        }

        // 3c. Delist losers
        await prisma.animal.updateMany({
            where: { id: { in: op.loserIds } },
            data: {
                status: 'DELISTED',
                delistedAt: new Date(),
                outcomeNotes: `cross-source-dedup: merged into ${op.winnerId}`,
            },
        });

        processed++;
        if (processed % 100 === 0 || processed === operations.length) {
            console.log(`  Processed ${processed}/${operations.length}`);
        }
    }

    // Count child reassignments
    console.log(`\n✅ Merge-dedup complete:`);
    console.log(`   ${totalDelisted} records delisted`);
    console.log(`   ${totalMerged} winners received merged data`);
    await prisma.$disconnect();
    process.exit(0);
}

main().catch((err) => {
    console.error('Fatal error:', err);
    process.exit(1);
});
