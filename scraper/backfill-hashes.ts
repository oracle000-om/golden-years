/**
 * Backfill Photo Hashes & Detect Duplicates
 *
 * One-time script to:
 *   1. Compute pHash for all existing animals that have a photo but no hash
 *   2. Scan for cross-source duplicates using all 3 tiers
 *   3. Report findings (or merge with --merge flag)
 *
 * Usage:
 *   npx tsx scraper/backfill-hashes.ts              # report only
 *   npx tsx scraper/backfill-hashes.ts --merge       # merge duplicates
 */

import 'dotenv/config';
import { createPrismaClient } from './lib/prisma';
import { computePhotoHash, hammingDistance } from './dedup';

const PHASH_THRESHOLD = 5;



async function main() {
    const shouldMerge = process.argv.includes('--merge');
    const prisma = await createPrismaClient();

    console.log(`🔍 Golden Years — Photo Hash Backfill & Duplicate Scan`);
    console.log(`   Mode: ${shouldMerge ? '⚠️  MERGE (will merge duplicates)' : '📋 REPORT ONLY'}\n`);

    // ── Step 1: Backfill hashes ──
    const unhashed = await prisma.animal.findMany({
        where: {
            photoUrl: { not: null },
            photoHash: null,
        },
        select: { id: true, photoUrl: true, name: true, intakeId: true },
    });

    console.log(`📷 ${unhashed.length} animals need photo hashes\n`);

    let hashesComputed = 0;
    let hashErrors = 0;

    for (let i = 0; i < unhashed.length; i++) {
        const animal = unhashed[i];
        try {
            const hash = await computePhotoHash(animal.photoUrl!);
            if (hash) {
                await prisma.animal.update({
                    where: { id: animal.id },
                    data: { photoHash: hash },
                });
                hashesComputed++;
            } else {
                hashErrors++;
            }
        } catch {
            hashErrors++;
        }

        // Rate limit: 100ms between fetches
        await new Promise(r => setTimeout(r, 100));

        if ((i + 1) % 50 === 0) {
            console.log(`   ... ${i + 1}/${unhashed.length} processed (${hashesComputed} hashed, ${hashErrors} errors)`);
        }
    }

    console.log(`\n✅ Hashing complete: ${hashesComputed} computed, ${hashErrors} errors\n`);

    // ── Step 2: Scan for duplicates ──
    console.log(`🔎 Scanning for duplicates...\n`);

    // Get all animals with photo data
    const allAnimals = await prisma.animal.findMany({
        select: {
            id: true,
            intakeId: true,
            shelterId: true,
            name: true,
            photoUrl: true,
            photoHash: true,
            species: true,
            createdAt: true,
        },
        orderBy: { createdAt: 'asc' }, // oldest first = canonical
    });

    // Track which animals are already flagged as dupes to avoid double-counting
    const mergedIds = new Set<string>();
    const duplicatePairs: Array<{
        canonical: typeof allAnimals[0];
        duplicate: typeof allAnimals[0];
        tier: number;
        detail: string;
    }> = [];

    // Check each pair (O(n²) for pHash, but bounded in practice)
    for (let i = 0; i < allAnimals.length; i++) {
        if (mergedIds.has(allAnimals[i].id)) continue;

        for (let j = i + 1; j < allAnimals.length; j++) {
            if (mergedIds.has(allAnimals[j].id)) continue;

            const a = allAnimals[i]; // canonical (older)
            const b = allAnimals[j]; // potential duplicate

            // Skip same shelter + same intakeId (that's just normal updates)
            if (a.shelterId === b.shelterId && a.intakeId === b.intakeId) continue;

            // Tier 2: Cross-source photo URL match
            if (a.photoUrl && b.photoUrl && a.photoUrl === b.photoUrl) {
                duplicatePairs.push({ canonical: a, duplicate: b, tier: 2, detail: 'Same photo URL' });
                mergedIds.add(b.id);
                continue;
            }

            // Tier 3: Perceptual hash match
            if (a.photoHash && b.photoHash) {
                const dist = hammingDistance(a.photoHash, b.photoHash);
                if (dist <= PHASH_THRESHOLD) {
                    duplicatePairs.push({ canonical: a, duplicate: b, tier: 3, detail: `pHash distance: ${dist}` });
                    mergedIds.add(b.id);
                }
            }
        }
    }

    // ── Step 3: Report / Merge ──
    if (duplicatePairs.length === 0) {
        console.log('✨ No cross-source duplicates found!\n');
    } else {
        console.log(`⚠️  Found ${duplicatePairs.length} duplicate pairs:\n`);

        for (const { canonical, duplicate, tier, detail } of duplicatePairs) {
            console.log(`   T${tier} | ${detail}`);
            console.log(`      Keep:   ${canonical.intakeId} — "${canonical.name}" (shelter: ${canonical.shelterId})`);
            console.log(`      Remove: ${duplicate.intakeId} — "${duplicate.name}" (shelter: ${duplicate.shelterId})`);
            console.log(`      Photos: ${canonical.photoUrl}`);
            console.log(`              ${duplicate.photoUrl}\n`);

            if (shouldMerge) {
                try {
                    // Move sources from duplicate to canonical
                    await prisma.source.updateMany({
                        where: { animalId: duplicate.id },
                        data: { animalId: canonical.id },
                    });
                    // Move snapshots from duplicate to canonical
                    await prisma.animalSnapshot.updateMany({
                        where: { animalId: duplicate.id },
                        data: { animalId: canonical.id },
                    });
                    // Delete the duplicate
                    await prisma.animal.delete({
                        where: { id: duplicate.id },
                    });
                    console.log(`      ✅ Merged!\n`);
                } catch (err) {
                    console.error(`      ❌ Merge failed: ${(err as Error).message}\n`);
                }
            }
        }
    }

    console.log(`🏁 Done.`);
    console.log(`   Hashes backfilled: ${hashesComputed}`);
    console.log(`   Duplicates found: ${duplicatePairs.length}`);
    if (shouldMerge) console.log(`   Duplicates merged: ${duplicatePairs.length}`);
    process.exit(0);
}

main();
