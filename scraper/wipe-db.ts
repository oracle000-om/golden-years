/**
 * Clear all shelter/animal data from the database.
 * Used when migrating between scraper sources.
 */
import 'dotenv/config';
import { createPrismaClient } from './lib/prisma';

async function main() {
    const prisma = await createPrismaClient();

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
