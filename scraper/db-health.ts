import 'dotenv/config';
import { createPrismaClient } from './lib/prisma';

async function main() {
    const p = await createPrismaClient();

    const total = await p.animal.count({ where: { status: 'DELISTED' } });

    // CV-powered = has any of: bodyConditionScore, ageEstimatedLow, detectedBreeds, coatCondition, dentalGrade
    const withCV = await p.animal.count({
        where: {
            status: 'DELISTED',
            OR: [
                { bodyConditionScore: { not: null } },
                { ageEstimatedLow: { not: null } },
                { coatCondition: { not: null } },
                { dentalGrade: { not: null } },
                { detectedBreeds: { isEmpty: false } },
                { visibleConditions: { isEmpty: false } },
            ],
        },
    });

    const withoutCV = total - withCV;

    console.log(`DELISTED animals: ${total}`);
    console.log(`  With CV data (KEEP): ${withCV}`);
    console.log(`  Without CV data (PURGE): ${withoutCV}`);

    // Purge those WITHOUT CV data
    if (withoutCV > 0) {
        // Get IDs of animals to purge
        const toPurge = await p.animal.findMany({
            where: {
                status: 'DELISTED',
                bodyConditionScore: null,
                ageEstimatedLow: null,
                coatCondition: null,
                dentalGrade: null,
                detectedBreeds: { isEmpty: true },
                visibleConditions: { isEmpty: true },
            },
            select: { id: true },
        });

        const ids = toPurge.map(a => a.id);
        console.log(`\nPurging ${ids.length} DELISTED animals without CV data...`);

        // Cascade: sources, snapshots, then animals
        const srcDel = await p.source.deleteMany({ where: { animalId: { in: ids } } });
        const snapDel = await p.animalSnapshot.deleteMany({ where: { animalId: { in: ids } } });
        const aDel = await p.animal.deleteMany({ where: { id: { in: ids } } });

        console.log(`  Sources deleted: ${srcDel.count}`);
        console.log(`  Snapshots deleted: ${snapDel.count}`);
        console.log(`  Animals deleted: ${aDel.count}`);
    }

    // Verify
    const remaining = await p.animal.count({ where: { status: 'DELISTED' } });
    console.log(`\nRemaining DELISTED (with CV data): ${remaining}`);

    await p.$disconnect();
}

main();
