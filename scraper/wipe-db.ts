/**
 * Clear all shelter/animal data from the database.
 * Used when migrating between scraper sources.
 */
import 'dotenv/config';
import { PrismaClient } from '../src/generated/prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import pg from 'pg';

async function main() {
    const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
    const adapter = new PrismaPg(pool);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const prisma = new (PrismaClient as any)({ adapter }) as PrismaClient;

    const sources = await prisma.source.deleteMany({});
    console.log('Deleted sources:', sources.count);
    const animals = await prisma.animal.deleteMany({});
    console.log('Deleted animals:', animals.count);
    const shelters = await prisma.shelter.deleteMany({});
    console.log('Deleted shelters:', shelters.count);
    console.log('DB cleared. Ready for RescueGroups data.');
    process.exit(0);
}

main();
