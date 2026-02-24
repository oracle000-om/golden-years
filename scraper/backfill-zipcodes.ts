/**
 * One-time backfill: extract zip codes from shelter addresses
 * and populate the new zipCode field.
 *
 * Usage: npx tsx scraper/backfill-zipcodes.ts
 */
import 'dotenv/config';
import { createPrismaClient } from './lib/prisma';

function extractZip(address: string | null): string | null {
    if (!address) return null;
    const match = address.match(/\b(\d{5})(?:-\d{4})?\b/);
    return match ? match[1] : null;
}

async function main() {
    const prisma = await createPrismaClient();

    const shelters = await prisma.shelter.findMany({
        select: { id: true, address: true, zipCode: true },
    });

    let updated = 0;
    let skipped = 0;

    for (const shelter of shelters) {
        if (shelter.zipCode) {
            skipped++;
            continue;
        }

        const zip = extractZip(shelter.address);
        if (zip) {
            await prisma.shelter.update({
                where: { id: shelter.id },
                data: { zipCode: zip },
            });
            updated++;
        } else {
            skipped++;
        }
    }

    console.log(`✅ Backfill complete: ${updated} updated, ${skipped} skipped (${shelters.length} total)`);
    process.exit(0);
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
