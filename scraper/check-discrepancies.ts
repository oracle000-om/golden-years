import 'dotenv/config';
import { createPrismaClient } from './lib/prisma';

async function main() {
    const prisma = await createPrismaClient();

    // Count total animals
    const total = await prisma.animal.count();
    console.log(`Total animals in DB: ${total}`);

    // Count with ageKnownYears
    const withKnown = await prisma.animal.count({ where: { ageKnownYears: { not: null } } });
    console.log(`With ageKnownYears: ${withKnown}`);

    // Count with ageEstimatedLow
    const withEstimate = await prisma.animalAssessment.count({ where: { ageEstimatedLow: { not: null } } });
    console.log(`With ageEstimatedLow: ${withEstimate}`);

    // Sample some scraped animals
    const samples = await prisma.animal.findMany({
        where: { shelterId: { in: ['la-county', 'oc-animal-care'] } },
        select: {
            id: true, name: true, ageKnownYears: true, ageSource: true, shelterId: true,
            assessment: { select: { ageEstimatedLow: true, ageEstimatedHigh: true, ageConfidence: true } },
        },
        take: 10,
    });
    console.log(`\nSample scraped animals (first 10):`);
    for (const a of samples) {
        console.log(`  ${(a.name || 'Unnamed').padEnd(16)} shelter=${a.ageKnownYears}yr  CV=${a.assessment?.ageEstimatedLow}-${a.assessment?.ageEstimatedHigh}yr  conf=${a.assessment?.ageConfidence}  src=${a.ageSource}  sid=${a.shelterId}`);
    }

    process.exit(0);
}

main().catch(console.error);
