/**
 * Snapshot Cleanup — Prune old AnimalSnapshot records.
 *
 * Keeps the most recent N snapshots per animal and deletes the rest.
 * This prevents unbounded table growth (~54k rows/day at 3x/day runs).
 *
 * Usage:
 *   npx tsx scripts/cleanup-snapshots.ts              # default: keep 10
 *   npx tsx scripts/cleanup-snapshots.ts --keep=5     # keep last 5
 *   npx tsx scripts/cleanup-snapshots.ts --dry-run    # preview only
 */

import 'dotenv/config';
import { createPrismaClient } from '../scraper/lib/prisma';

async function main() {
    const dryRun = process.argv.includes('--dry-run');
    const keepArg = process.argv.find(a => a.startsWith('--keep='))?.split('=')[1];
    const KEEP = Math.max(1, parseInt(keepArg || '10', 10));

    console.log(`🧹 Snapshot Cleanup — keeping last ${KEEP} per animal${dryRun ? ' (DRY RUN)' : ''}`);

    const prisma = await createPrismaClient();

    // Find animals that have more than KEEP snapshots
    const overfilled = await (prisma as any).$queryRaw`
        SELECT animal_id, COUNT(*) as cnt
        FROM animal_snapshots
        GROUP BY animal_id
        HAVING COUNT(*) > ${KEEP}
    ` as { animal_id: string; cnt: bigint }[];

    console.log(`   Found ${overfilled.length} animals with >${KEEP} snapshots`);

    let totalDeleted = 0;

    for (const row of overfilled) {
        // Get the Nth most recent snapshot's date (the cutoff)
        const cutoffSnaps = await (prisma as any).animalSnapshot.findMany({
            where: { animalId: row.animal_id },
            orderBy: { scrapedAt: 'desc' },
            take: KEEP,
            select: { scrapedAt: true },
        });

        const oldest = cutoffSnaps[cutoffSnaps.length - 1]?.scrapedAt;
        if (!oldest) continue;

        if (dryRun) {
            const toDelete = Number(row.cnt) - KEEP;
            console.log(`   Would delete ${toDelete} snapshots for animal ${row.animal_id}`);
            totalDeleted += toDelete;
        } else {
            const deleted = await (prisma as any).animalSnapshot.deleteMany({
                where: {
                    animalId: row.animal_id,
                    scrapedAt: { lt: oldest },
                },
            });
            totalDeleted += deleted.count;
        }
    }

    console.log(`\n✅ ${dryRun ? 'Would delete' : 'Deleted'} ${totalDeleted} old snapshots`);
    process.exit(0);
}

main().catch(err => {
    console.error('Fatal:', err);
    process.exit(1);
});
