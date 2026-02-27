/**
 * Cleanup Placeholder CV Data
 *
 * One-time script to null out CV fields for animals whose photoHash
 * matches known placeholder images. These animals had Gemini hallucinate
 * CV data from text context instead of a real photo.
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

/** All CV-derived fields that should be nulled out */
const CV_FIELD_RESET: Record<string, unknown> = {
    ageSource: 'SHELTER_REPORTED',
    ageEstimatedLow: null,
    ageEstimatedHigh: null,
    ageConfidence: 'NONE',
    ageIndicators: [],
    detectedBreeds: [],
    breedConfidence: 'NONE',
    lifeExpectancyLow: null,
    lifeExpectancyHigh: null,
    bodyConditionScore: null,
    coatCondition: null,
    visibleConditions: [],
    healthNotes: null,
    aggressionRisk: null,
    fearIndicators: [],
    stressLevel: null,
    behaviorNotes: null,
    photoQuality: null,
    likelyCareNeeds: [],
    estimatedCareLevel: null,
    dataConflicts: [],
    dentalGrade: null,
    tartarSeverity: null,
    dentalNotes: null,
    cataractStage: null,
    eyeNotes: null,
    estimatedWeightLbs: null,
    mobilityAssessment: null,
    mobilityNotes: null,
    energyLevel: null,
    groomingNeeds: null,
};

async function main() {
    const execute = process.argv.includes('--execute');
    console.log(`🧹 Cleanup Placeholder CV Data${execute ? '' : ' (DRY RUN)'}\n`);

    const prisma = await createPrismaClient();

    // Find animals with placeholder photoHash that have CV data
    const affected = await (prisma as any).animal.findMany({
        where: {
            photoHash: { in: PLACEHOLDER_HASHES },
            ageEstimatedLow: { not: null },
        },
        select: {
            id: true,
            name: true,
            intakeId: true,
            shelterId: true,
            photoUrl: true,
            photoHash: true,
            ageEstimatedLow: true,
            ageEstimatedHigh: true,
            ageConfidence: true,
            detectedBreeds: true,
        },
    });

    console.log(`Found ${affected.length} animals with placeholder photo + CV data:\n`);

    for (const a of affected) {
        console.log(`  ${(a.name || 'Unnamed').padEnd(20)} ${a.intakeId?.padEnd(12) || 'N/A'.padEnd(12)} CV: ${a.ageEstimatedLow}-${a.ageEstimatedHigh}yr (${a.ageConfidence}) breeds: [${a.detectedBreeds?.join(', ')}]`);
        console.log(`    photo: ${a.photoUrl}`);
    }

    if (!execute) {
        console.log(`\n⚠️  Dry run — ${affected.length} animals would be updated. Pass --execute to apply.`);
        await (prisma as any).$disconnect();
        process.exit(0);
    }

    // Apply cleanup
    const result = await (prisma as any).animal.updateMany({
        where: {
            photoHash: { in: PLACEHOLDER_HASHES },
            ageEstimatedLow: { not: null },
        },
        data: CV_FIELD_RESET,
    });

    console.log(`\n✅ Updated ${result.count} animals — CV data nulled, ageSource reset to SHELTER_REPORTED.`);
    await (prisma as any).$disconnect();
    process.exit(0);
}

main();
