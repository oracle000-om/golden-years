/**
 * Cleanup Placeholder CV Data
 *
 * One-time script to remove AnimalAssessment records for animals whose
 * photoHash matches known placeholder images. These animals had Gemini
 * hallucinate CV data from text context instead of a real photo.
 *
 * Updated: Uses AnimalAssessment child table (not flat columns on Animal).
 *
 * Usage:
 *   npx tsx scripts/cleanup-placeholder-cv.ts              # dry run (default)
 *   npx tsx scripts/cleanup-placeholder-cv.ts --execute     # actually update
 */

import 'dotenv/config';
import { createPrismaClient } from '../scraper/lib/prisma';

/** Known placeholder image hashes — same as gemini-provider.ts */
const PLACEHOLDER_HASHES = [
    '0f1e200121e5e7ff', // 24PetConnect "No Image Available"
];

async function main() {
    const execute = process.argv.includes('--execute');
    console.log(`🧹 Cleanup Placeholder CV Data${execute ? '' : ' (DRY RUN)'}\n`);

    const prisma = await createPrismaClient();

    // Find animals with placeholder photoHash that have assessment data
    const affected = await prisma.animal.findMany({
        where: {
            photoHash: { in: PLACEHOLDER_HASHES },
            assessment: {
                isNot: null,
            },
        },
        select: {
            id: true,
            name: true,
            intakeId: true,
            shelterId: true,
            photoUrl: true,
            photoHash: true,
            assessment: {
                select: {
                    id: true,
                    ageEstimatedLow: true,
                    ageEstimatedHigh: true,
                    ageConfidence: true,
                    detectedBreeds: true,
                },
            },
        },
    });

    console.log(`Found ${affected.length} animals with placeholder photo + CV assessment:\n`);

    for (const a of affected) {
        const aa = a.assessment;
        console.log(`  ${(a.name || 'Unnamed').padEnd(20)} ${a.intakeId?.padEnd(12) || 'N/A'.padEnd(12)} CV: ${aa?.ageEstimatedLow}-${aa?.ageEstimatedHigh}yr (${aa?.ageConfidence}) breeds: [${aa?.detectedBreeds?.join(', ')}]`);
        console.log(`    photo: ${a.photoUrl}`);
    }

    if (!execute) {
        console.log(`\n⚠️  Dry run — ${affected.length} animals would be updated. Pass --execute to apply.`);
        await prisma.$disconnect();
        process.exit(0);
    }

    // Delete the assessment child records
    const animalIds = affected.map(a => a.id);

    const deleteResult = await prisma.animalAssessment.deleteMany({
        where: { animalId: { in: animalIds } },
    });

    // Reset ageSource on parent Animal records
    await prisma.animal.updateMany({
        where: { id: { in: animalIds } },
        data: { ageSource: 'SHELTER_REPORTED' },
    });

    console.log(`\n✅ Deleted ${deleteResult.count} placeholder assessments, ageSource reset to SHELTER_REPORTED.`);
    await prisma.$disconnect();
    process.exit(0);
}

main();
