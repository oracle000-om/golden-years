import 'dotenv/config';
import { createPrismaClient } from './lib/prisma';

async function main() {
    const prisma = await createPrismaClient();

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

    process.exit(0);
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
