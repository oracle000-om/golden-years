/**
 * Re-Entry Detector — Cross-Shelter + Same-Shelter Historical Matching
 *
 * Detects when the same animal re-enters the shelter system by comparing
 * visual embeddings via Zilliz Cloud. Creates ReEntryCandidate records
 * for human review.
 *
 * Matches against:
 *   - Other shelters (cross-shelter re-entry)
 *   - Same shelter at a past time (return under a new name/intake ID)
 *
 * Usage:
 *   // Programmatic (called from embed-helper.ts after each embedding):
 *   await checkForReEntry(animalId, embedding, prisma);
 *
 *   // CLI (standalone backfill):
 *   npx tsx scraper/re-entry-detector.ts                        # full backfill
 *   npx tsx scraper/re-entry-detector.ts --threshold=0.90       # stricter
 *   npx tsx scraper/re-entry-detector.ts --dry-run              # preview only
 *   npx tsx scraper/re-entry-detector.ts --animal-id=<id>       # single animal
 */

import 'dotenv/config';
import { createPrismaClient } from './lib/prisma';
import { createEmbeddingProvider, type EmbeddingProvider, type SearchMatch } from './cv';

export const RE_ENTRY_THRESHOLD = 0.85;
const RE_ENTRY_SEARCH_LIMIT = 30;  // Top-K from Zilliz before filtering

/**
 * Check whether a newly-embedded animal matches any historical record.
 * Creates ReEntryCandidate rows for matches above threshold, excluding:
 *   - The animal itself
 *   - Pairs that already have a pending or confirmed candidate
 */
export async function checkForReEntry(
    animalId: string,
    embedding: number[],
    prisma: any,
    provider: EmbeddingProvider,
    opts: { threshold?: number; dryRun?: boolean } = {},
): Promise<{ matched: number; created: number }> {
    const threshold = opts.threshold ?? RE_ENTRY_THRESHOLD;

    // 1. Search Zilliz for visually similar animals
    const matches = await provider.search(embedding, {
        limit: RE_ENTRY_SEARCH_LIMIT,
        threshold,
    });

    // 2. Filter out self-match
    const candidates = matches.filter(m => m.id !== animalId);
    if (candidates.length === 0) {
        return { matched: 0, created: 0 };
    }

    // 3. Check which pairs already have a candidate record
    const matchedIds = candidates.map(m => m.id);
    const existing = await prisma.reEntryCandidate.findMany({
        where: {
            OR: [
                { animalId, matchedAnimalId: { in: matchedIds } },
                { matchedAnimalId: animalId, animalId: { in: matchedIds } },
            ],
        },
        select: { animalId: true, matchedAnimalId: true },
    });

    const existingPairs = new Set(
        existing.map((e: any) => `${e.animalId}:${e.matchedAnimalId}`),
    );
    // Also check reverse direction
    existing.forEach((e: any) => existingPairs.add(`${e.matchedAnimalId}:${e.animalId}`));

    const newCandidates = candidates.filter(
        m => !existingPairs.has(`${animalId}:${m.id}`) && !existingPairs.has(`${m.id}:${animalId}`),
    );

    if (newCandidates.length === 0) {
        return { matched: candidates.length, created: 0 };
    }

    if (opts.dryRun) {
        return { matched: candidates.length, created: newCandidates.length };
    }

    // 4. Create ReEntryCandidate records
    await prisma.reEntryCandidate.createMany({
        data: newCandidates.map(m => ({
            animalId,
            matchedAnimalId: m.id,
            similarity: m.similarity,
            status: 'PENDING_REVIEW',
        })),
    });

    console.log(`🔄 Re-entry: ${newCandidates.length} candidate(s) for ${animalId} (best: ${newCandidates[0].similarity.toFixed(3)})`);

    return { matched: candidates.length, created: newCandidates.length };
}

/**
 * Build the journey JSON for a confirmed identity link.
 * Chains all animals under the same identity in chronological order.
 */
export async function buildJourneyTimeline(
    identityId: string,
    prisma: any,
): Promise<Array<{ animalId: string; shelterName: string; shelterId: string; event: string; date: string }>> {
    const animals = await prisma.animal.findMany({
        where: { identityId },
        select: {
            id: true,
            name: true,
            status: true,
            intakeDate: true,
            outcomeDate: true,
            delistedAt: true,
            createdAt: true,
            shelter: { select: { id: true, name: true, state: true } },
        },
        orderBy: { createdAt: 'asc' },
    });

    const timeline: Array<{ animalId: string; shelterName: string; shelterId: string; event: string; date: string }> = [];

    for (const animal of animals) {
        const shelterName = `${animal.shelter.name} (${animal.shelter.state})`;

        // Intake event
        timeline.push({
            animalId: animal.id,
            shelterName,
            shelterId: animal.shelter.id,
            event: 'INTAKE',
            date: (animal.intakeDate || animal.createdAt).toISOString(),
        });

        // Outcome event (if any)
        if (['ADOPTED', 'TRANSFERRED', 'RETURNED_OWNER', 'EUTHANIZED', 'DELISTED'].includes(animal.status)) {
            timeline.push({
                animalId: animal.id,
                shelterName,
                shelterId: animal.shelter.id,
                event: animal.status,
                date: (animal.outcomeDate || animal.delistedAt || animal.createdAt).toISOString(),
            });
        }
    }

    return timeline.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
}

// ── CLI ─────────────────────────────────────────────────

async function main() {
    const dryRun = process.argv.includes('--dry-run');
    const thresholdArg = process.argv.find(a => a.startsWith('--threshold='))?.split('=')[1];
    const animalIdArg = process.argv.find(a => a.startsWith('--animal-id='))?.split('=')[1];
    const threshold = thresholdArg ? parseFloat(thresholdArg) : RE_ENTRY_THRESHOLD;

    console.log(`🔄 Re-Entry Detection${dryRun ? ' (DRY RUN)' : ''} — threshold: ${threshold}`);

    const prisma = await createPrismaClient();

    // Initialize embedding provider (for Zilliz search)
    const provider = await createEmbeddingProvider();
    if (!provider) {
        console.error('❌ Could not initialize embedding provider. Check Python + torch installation.');
        process.exit(1);
    }

    let animals: any[];

    if (animalIdArg) {
        // Single animal mode
        const animal = await prisma.animal.findUnique({
            where: { id: animalIdArg },
            select: { id: true, name: true, photoUrl: true, shelterId: true },
        });
        if (!animal || !animal.photoUrl) {
            console.error(`❌ Animal ${animalIdArg} not found or has no photo`);
            process.exit(1);
        }
        animals = [animal];
    } else {
        // Backfill mode — all animals with photos (embeddings live in Zilliz, not Postgres)
        animals = await prisma.animal.findMany({
            where: {
                photoUrl: { not: null },
                species: { not: 'OTHER' },
            },
            select: { id: true, name: true, photoUrl: true, shelterId: true },
            orderBy: { createdAt: 'desc' },
        });
    }

    console.log(`   Checking ${animals.length} animals...\n`);

    let totalMatched = 0;
    let totalCreated = 0;
    let totalSkipped = 0;
    const startTime = Date.now();

    for (let i = 0; i < animals.length; i++) {
        const animal = animals[i];

        // Generate embedding on-the-fly from photo URL
        let embedding: number[] | null = null;
        try {
            embedding = await provider.generateEmbedding(animal.photoUrl, `reentry-cli-${animal.id}`);
        } catch {
            totalSkipped++;
            continue;
        }
        if (!embedding || embedding.length !== 2048) {
            totalSkipped++;
            continue;
        }

        const result = await checkForReEntry(
            animal.id,
            embedding,
            prisma,
            provider,
            { threshold, dryRun },
        );

        totalMatched += result.matched;
        totalCreated += result.created;

        if (result.created > 0) {
            console.log(`   ${dryRun ? '(dry)' : '✅'} ${animal.name || animal.id}: ${result.created} candidate(s)`);
        }

        if ((i + 1) % 50 === 0 || i === animals.length - 1) {
            const elapsed = ((Date.now() - startTime) / 1000).toFixed(0);
            console.log(`   ... ${i + 1}/${animals.length} checked — ${totalCreated} candidates — ${elapsed}s`);
        }
    }

    await provider.shutdown();

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(0);
    console.log(`\n🏁 Done in ${elapsed}s!`);
    console.log(`   🔍 ${totalMatched} total matches above threshold`);
    console.log(`   📋 ${totalCreated} new candidates created${dryRun ? ' (dry run — nothing written)' : ''}`);

    process.exit(0);
}

// Run CLI if executed directly
if (require.main === module) {
    main();
}
