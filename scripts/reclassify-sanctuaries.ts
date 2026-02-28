/**
 * Reclassify Sanctuaries
 *
 * One-time script to reclassify shelters with "sanctuary" in their name
 * from NO_KILL/MUNICIPAL to SANCTUARY. These are permanent-resident
 * facilities whose animals should not appear in the adoption feed.
 *
 * Usage:
 *   npx tsx scripts/reclassify-sanctuaries.ts              # dry run (default)
 *   npx tsx scripts/reclassify-sanctuaries.ts --execute     # actually update
 */

import 'dotenv/config';
import { createPrismaClient } from '../scraper/lib/prisma';

async function main() {
    const execute = process.argv.includes('--execute');
    console.log(`🏛️  Reclassify Sanctuaries${execute ? '' : ' (DRY RUN)'}\n`);

    const prisma = await createPrismaClient();

    // Find shelters with "sanctuary" in name that aren't already SANCTUARY
    const candidates = await (prisma as any).shelter.findMany({
        where: {
            name: { contains: 'sanctuary', mode: 'insensitive' },
            shelterType: { not: 'SANCTUARY' },
        },
        select: {
            id: true,
            name: true,
            shelterType: true,
            _count: { select: { animals: { where: { status: { in: ['AVAILABLE', 'URGENT'] } } } } },
        },
        orderBy: { name: 'asc' },
    });

    const withAnimals = candidates.filter((s: any) => s._count.animals > 0);
    const totalAnimals = withAnimals.reduce((sum: number, s: any) => sum + s._count.animals, 0);

    console.log(`Found ${candidates.length} shelters with "sanctuary" in name`);
    console.log(`  ${withAnimals.length} have active animals (${totalAnimals} total)\n`);

    if (withAnimals.length > 0) {
        console.log('Shelters with active animals:');
        for (const s of withAnimals) {
            console.log(`  ${s.name.padEnd(50)} ${s.shelterType.padEnd(12)} ${s._count.animals} animals`);
        }
        console.log('');
    }

    if (!execute) {
        console.log(`⚠️  Dry run — ${candidates.length} shelters would be reclassified. Pass --execute to apply.`);
        await (prisma as any).$disconnect();
        process.exit(0);
    }

    // Apply reclassification
    const result = await (prisma as any).shelter.updateMany({
        where: {
            name: { contains: 'sanctuary', mode: 'insensitive' },
            shelterType: { not: 'SANCTUARY' },
        },
        data: { shelterType: 'SANCTUARY' },
    });

    console.log(`✅ Reclassified ${result.count} shelters to SANCTUARY.`);
    console.log(`   ${totalAnimals} active animals will be excluded from the main feed.`);
    await (prisma as any).$disconnect();
    process.exit(0);
}

main();
