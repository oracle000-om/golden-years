import 'dotenv/config';
import { createPrismaClient } from './lib/prisma';
import { sendAlert } from './lib/alert';

const MAX_PURGE_PER_RUN = 1000;
const RECENCY_GUARD_MS = 24 * 60 * 60 * 1000; // 24 hours

async function main() {
    const p = await createPrismaClient();

    const total = await p.animal.count({ where: { status: 'DELISTED' } });

    // CV-powered = has an assessment record
    const withCV = await p.animal.count({
        where: {
            status: 'DELISTED',
            assessment: { isNot: null },
        },
    });

    const withoutCV = total - withCV;

    console.log(`DELISTED animals: ${total}`);
    console.log(`  With CV data (KEEP): ${withCV}`);
    console.log(`  Without CV data (PURGE candidates): ${withoutCV}`);

    if (withoutCV === 0) {
        console.log('Nothing to purge.');
        await p.$disconnect();
        return;
    }

    // ── GUARDRAIL 1: Recency check ──────────────────────────
    // Refuse to purge animals delisted within the last 24 hours.
    // This creates a recovery window for accidental mass-delistings.
    const recentCutoff = new Date(Date.now() - RECENCY_GUARD_MS);
    const recentlyDelisted = await p.animal.count({
        where: {
            status: 'DELISTED',
            delistedAt: { gte: recentCutoff },
            assessment: null,
        },
    });

    const safeToPurge = withoutCV - recentlyDelisted;
    if (recentlyDelisted > 0) {
        console.log(`\n  ⚠️  ${recentlyDelisted} animals delisted within last 24h — EXCLUDED from purge (recovery window)`);
    }

    if (safeToPurge <= 0) {
        console.log('No animals eligible for purge after recency guard.');
        await p.$disconnect();
        return;
    }

    // ── GUARDRAIL 2: Absolute cap ──────────────────────────
    if (safeToPurge > MAX_PURGE_PER_RUN) {
        console.log(`\n  🛑 ${safeToPurge} animals eligible but exceeds cap of ${MAX_PURGE_PER_RUN}.`);
        console.log('     Refusing to purge. Investigate manually if this is expected.');
        sendAlert('CRITICAL', `db-health: ${safeToPurge} purge candidates exceeds ${MAX_PURGE_PER_RUN} cap`, {
            pipeline: 'db-health', animalCount: safeToPurge,
        });
        await p.$disconnect();
        return;
    }

    // Get IDs of animals to purge (excluding recently delisted)
    const toPurge = await p.animal.findMany({
        where: {
            status: 'DELISTED',
            delistedAt: { lt: recentCutoff },
            assessment: null,
        },
        select: { id: true },
    });

    const ids = toPurge.map(a => a.id);
    console.log(`\nPurging ${ids.length} DELISTED animals without CV data (>24h old)...`);

    // Cascade: child tables, sources, snapshots, then animals
    const assessmentDel = await (p as any).animalAssessment.deleteMany({ where: { animalId: { in: ids } } });
    const enrichmentDel = await (p as any).animalEnrichment.deleteMany({ where: { animalId: { in: ids } } });
    const listingDel = await (p as any).animalListing.deleteMany({ where: { animalId: { in: ids } } });
    const srcDel = await p.source.deleteMany({ where: { animalId: { in: ids } } });
    const snapDel = await p.animalSnapshot.deleteMany({ where: { animalId: { in: ids } } });
    const aDel = await p.animal.deleteMany({ where: { id: { in: ids } } });

    console.log(`  Child tables deleted: ${assessmentDel.count + enrichmentDel.count + listingDel.count}`);
    console.log(`  Sources deleted: ${srcDel.count}`);
    console.log(`  Snapshots deleted: ${snapDel.count}`);
    console.log(`  Animals deleted: ${aDel.count}`);

    // Verify
    const remaining = await p.animal.count({ where: { status: 'DELISTED' } });
    console.log(`\nRemaining DELISTED (with CV data or recently delisted): ${remaining}`);

    await p.$disconnect();
}

main();

