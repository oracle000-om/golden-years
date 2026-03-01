/**
 * Backfill Embeddings into Milvus Lite Vector Store
 *
 * Reads all animals from Postgres (photo URLs), generates ResNet50 embeddings,
 * and stores them in Milvus Lite vector database.
 *
 * Usage:
 *   npx tsx scraper/backfill-embeddings.ts                   # full backfill
 *   npx tsx scraper/backfill-embeddings.ts --limit=100       # first 100 only
 *   npx tsx scraper/backfill-embeddings.ts --species=DOG     # dogs only
 *   npx tsx scraper/backfill-embeddings.ts --dry-run         # preview only
 */

import 'dotenv/config';
import { createPrismaClient } from './lib/prisma';
import { createEmbeddingProvider } from './cv';

const BATCH_SIZE = 20;

async function main() {
    const dryRun = process.argv.includes('--dry-run');
    const limitArg = process.argv.find(a => a.startsWith('--limit='))?.split('=')[1];
    const speciesArg = process.argv.find(a => a.startsWith('--species='))?.split('=')[1];
    const limit = limitArg ? parseInt(limitArg, 10) : undefined;

    console.log(`🧬 Embedding Backfill → Milvus Lite${dryRun ? ' (DRY RUN)' : ''}${limit ? ` (limit: ${limit})` : ''}`);

    const prisma = await createPrismaClient();

    // Find animals with photos
    const where: Record<string, unknown> = {
        photoUrl: { not: null },
        species: { not: 'OTHER' },
    };
    if (speciesArg) where.species = speciesArg;

    const total = await (prisma as any).animal.count({ where });
    console.log(`   ${total} animals with photos${speciesArg ? ` (${speciesArg} only)` : ''}`);

    if (dryRun) {
        console.log('✅ Dry run complete.');
        process.exit(0);
    }

    // Initialize embedding provider (handles both ResNet50 + Milvus Lite)
    const provider = await createEmbeddingProvider();
    if (!provider) {
        console.error('❌ Could not initialize embedding provider.');
        process.exit(1);
    }

    const existingCount = await provider.count();
    console.log(`   Milvus Lite already has ${existingCount} vectors`);

    const animals = await (prisma as any).animal.findMany({
        where,
        select: {
            id: true,
            photoUrl: true,
            name: true,
            species: true,
            shelterId: true,
            ageSegment: true,
        },
        take: limit,
        orderBy: { lastSeenAt: 'desc' },
    });

    console.log(`   Processing ${animals.length} animals...\n`);

    let success = 0, failed = 0;
    const startTime = Date.now();

    for (let i = 0; i < animals.length; i += BATCH_SIZE) {
        const batch = animals.slice(i, i + BATCH_SIZE);

        const promises = batch.map(async (animal: any) => {
            const ok = await provider.embedAndInsert(animal.id, animal.photoUrl, {
                species: animal.species,
                shelterId: animal.shelterId,
                ageSegment: animal.ageSegment || 'UNKNOWN',
            });
            if (ok) success++;
            else failed++;
        });
        await Promise.all(promises);

        const processed = Math.min(i + BATCH_SIZE, animals.length);
        if (processed % 100 < BATCH_SIZE || processed === animals.length) {
            const elapsed = ((Date.now() - startTime) / 1000).toFixed(0);
            const rate = (success / Number(elapsed || 1)).toFixed(1);
            console.log(`   ... ${processed}/${animals.length} (${success} embedded, ${failed} failed) — ${elapsed}s (${rate}/s)`);
        }
    }

    const finalCount = await provider.count();
    await provider.shutdown();

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(0);
    console.log(`\n🏁 Done in ${elapsed}s!`);
    console.log(`   ✅ ${success} embeddings generated + stored in Milvus Lite`);
    console.log(`   ❌ ${failed} failed`);
    console.log(`   📊 Milvus Lite total: ${finalCount} vectors`);

    process.exit(failed > 0 ? 1 : 0);
}

main();
