import 'dotenv/config';
import { PrismaClient } from '../src/generated/prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import pg from 'pg';

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const prisma = new (PrismaClient as any)({ adapter });

async function main() {
    // Count total animals
    const total = await prisma.animal.count();
    console.log(`Total animals in DB: ${total}`);

    // Count with ageKnownYears
    const withKnown = await prisma.animal.count({ where: { ageKnownYears: { not: null } } });
    console.log(`With ageKnownYears: ${withKnown}`);

    // Count with ageEstimatedLow
    const withEstimate = await prisma.animal.count({ where: { ageEstimatedLow: { not: null } } });
    console.log(`With ageEstimatedLow: ${withEstimate}`);

    // Sample some scraped animals
    const samples = await prisma.animal.findMany({
        where: { shelterId: { in: ['la-county', 'oc-animal-care'] } },
        select: { id: true, name: true, ageKnownYears: true, ageEstimatedLow: true, ageEstimatedHigh: true, ageConfidence: true, ageSource: true, shelterId: true },
        take: 10,
    });
    console.log(`\nSample scraped animals (first 10):`);
    for (const a of samples) {
        console.log(`  ${(a.name || 'Unnamed').padEnd(16)} shelter=${a.ageKnownYears}yr  CV=${a.ageEstimatedLow}-${a.ageEstimatedHigh}yr  conf=${a.ageConfidence}  src=${a.ageSource}  sid=${a.shelterId}`);
    }

    await pool.end();
}

main().catch(console.error);
