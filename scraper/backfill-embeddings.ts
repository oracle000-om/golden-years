/**
 * Backfill Embeddings into Zilliz Cloud / Milvus Lite Vector Store
 *
 * Spawns N parallel Python embedding workers for ~Nx throughput.
 * Each worker independently downloads images, generates ResNet50 embeddings,
 * and inserts into the shared Milvus/Zilliz collection.
 *
 * Usage:
 *   npx tsx scraper/backfill-embeddings.ts                   # full backfill (4 workers)
 *   npx tsx scraper/backfill-embeddings.ts --workers=8       # 8 parallel workers
 *   npx tsx scraper/backfill-embeddings.ts --limit=100       # first 100 only
 *   npx tsx scraper/backfill-embeddings.ts --species=DOG     # dogs only
 *   npx tsx scraper/backfill-embeddings.ts --dry-run         # preview only
 */

import 'dotenv/config';
import { createPrismaClient } from './lib/prisma';
import { createEmbeddingProvider, type EmbeddingProvider } from './cv';

const DEFAULT_WORKERS = 4;

async function main() {
    const dryRun = process.argv.includes('--dry-run');
    const limitArg = process.argv.find(a => a.startsWith('--limit='))?.split('=')[1];
    const speciesArg = process.argv.find(a => a.startsWith('--species='))?.split('=')[1];
    const workersArg = process.argv.find(a => a.startsWith('--workers='))?.split('=')[1];
    const limit = limitArg ? parseInt(limitArg, 10) : undefined;
    const numWorkers = workersArg ? parseInt(workersArg, 10) : DEFAULT_WORKERS;

    const storeName = process.env.ZILLIZ_ENDPOINT ? 'Zilliz Cloud' : 'Milvus Lite';
    console.log(`🧬 Embedding Backfill → ${storeName} (${numWorkers} workers)${dryRun ? ' (DRY RUN)' : ''}${limit ? ` (limit: ${limit})` : ''}`);

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

    // Spawn N parallel embedding workers
    console.log(`   Spawning ${numWorkers} embedding workers...`);
    const workers: EmbeddingProvider[] = [];
    for (let i = 0; i < numWorkers; i++) {
        const provider = await createEmbeddingProvider();
        if (!provider) {
            console.error(`❌ Worker ${i} failed to initialize.`);
            // Shut down any workers that did start
            for (const w of workers) await w.shutdown();
            process.exit(1);
        }
        workers.push(provider);
        console.log(`   ✅ Worker ${i + 1}/${numWorkers} ready`);
    }

    const existingCount = await workers[0].count();
    console.log(`   ${storeName} already has ${existingCount} vectors`);

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

    // Distribute animals across workers round-robin
    const queues: any[][] = Array.from({ length: numWorkers }, () => []);
    animals.forEach((animal: any, i: number) => {
        queues[i % numWorkers].push(animal);
    });

    let success = 0, failed = 0;
    const startTime = Date.now();

    function logProgress(force = false) {
        const processed = success + failed;
        if (force || processed % 200 < numWorkers || processed === animals.length) {
            const elapsed = ((Date.now() - startTime) / 1000).toFixed(0);
            const rate = (success / Math.max(Number(elapsed), 1)).toFixed(1);
            const pct = ((processed / animals.length) * 100).toFixed(1);
            console.log(`   ... ${processed}/${animals.length} (${pct}%) — ${success} ok, ${failed} fail — ${elapsed}s (${rate}/s)`);
        }
    }

    // Each worker processes its queue sequentially (workers run in parallel)
    const workerPromises = queues.map(async (queue, workerIdx) => {
        const worker = workers[workerIdx];
        for (const animal of queue) {
            try {
                const ok = await worker.embedAndInsert(animal.id, animal.photoUrl, {
                    species: animal.species,
                    shelterId: animal.shelterId,
                    ageSegment: animal.ageSegment || 'UNKNOWN',
                });
                if (ok) success++;
                else failed++;
            } catch {
                failed++;
            }
            logProgress();
        }
    });

    await Promise.all(workerPromises);
    logProgress(true);

    const finalCount = await workers[0].count();

    // Shut down all workers
    await Promise.all(workers.map(w => w.shutdown()));

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(0);
    console.log(`\n🏁 Done in ${elapsed}s!`);
    console.log(`   ✅ ${success} embeddings generated + stored in ${storeName}`);
    console.log(`   ❌ ${failed} failed`);
    console.log(`   📊 ${storeName} total: ${finalCount} vectors`);

    process.exit(failed > 0 ? 1 : 0);
}

main();
