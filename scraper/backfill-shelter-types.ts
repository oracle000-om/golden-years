/**
 * One-time backfill: tag existing RescueGroups shelters as RESCUE type.
 * Run: npx tsx scraper/backfill-shelter-types.ts
 */
import 'dotenv/config';
import { createPrismaClient } from './lib/prisma';

async function main() {
    const prisma = await createPrismaClient();
    try {
        const result = await prisma.shelter.updateMany({
            where: { dataSourceName: 'RescueGroups.org' },
            data: { shelterType: 'RESCUE' },
        });
        console.log(`✅ Updated ${result.count} RescueGroups shelters to RESCUE`);

        // Verify
        const counts = await prisma.shelter.groupBy({
            by: ['shelterType'],
            _count: { shelterType: true },
        });
        console.log('Shelter type distribution:');
        for (const c of counts) {
            console.log(`  ${c.shelterType}: ${c._count.shelterType}`);
        }
    } finally {
        await prisma.$disconnect();
    }
}

main();
