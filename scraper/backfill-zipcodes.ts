/**
 * One-time backfill: extract zip codes from shelter addresses
 * and populate the new zipCode field.
 *
 * Usage: npx tsx scraper/backfill-zipcodes.ts
 */
import { PrismaClient } from '../src/generated/prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import pg from 'pg';

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const prisma = new (PrismaClient as any)({ adapter });

function extractZip(address: string | null): string | null {
    if (!address) return null;
    const match = address.match(/\b(\d{5})(?:-\d{4})?\b/);
    return match ? match[1] : null;
}

async function main() {
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
}

main()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
