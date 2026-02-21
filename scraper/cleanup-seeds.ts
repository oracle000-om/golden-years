import 'dotenv/config';
import { PrismaClient } from '../src/generated/prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import pg from 'pg';

async function main() {
    const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
    const adapter = new PrismaPg(pool);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const prisma = new (PrismaClient as any)({ adapter });

    // Delete seed animals (those with /seed/ photo URLs)
    const seedAnimals = await prisma.animal.findMany({
        where: { photoUrl: { startsWith: '/seed/' } },
        select: { id: true, name: true, photoUrl: true },
    });

    console.log(`Found ${seedAnimals.length} seed animals to delete:`);
    for (const a of seedAnimals) {
        console.log(`  - ${a.name || '(unnamed)'} (${a.photoUrl})`);
    }

    if (seedAnimals.length > 0) {
        // Delete related sources first
        await prisma.source.deleteMany({
            where: { animalId: { in: seedAnimals.map((a: { id: string }) => a.id) } },
        });

        const result = await prisma.animal.deleteMany({
            where: { photoUrl: { startsWith: '/seed/' } },
        });
        console.log(`\n✅ Deleted ${result.count} seed animals from database.`);
    } else {
        console.log('\n✅ No seed animals found — database is clean.');
    }

    await prisma.$disconnect();
    await pool.end();
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
