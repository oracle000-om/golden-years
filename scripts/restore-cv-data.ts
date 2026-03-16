/**
 * Restore CV data that was clobbered by the scraper
 * 
 * Finds animals where assessment child table is missing but snapshots
 * have valid rawAssessment data, then restores from the most recent
 * good snapshot into the AnimalAssessment child table.
 *
 * Updated: Uses AnimalAssessment child table (not flat columns on Animal).
 */
import 'dotenv/config';
import { createPrismaClient } from '../scraper/lib/prisma';

async function main() {
    const prisma = await createPrismaClient();

    // Find animals with no assessment child record but snapshots with rawAssessment
    const affected = await prisma.animal.findMany({
        where: {
            assessment: null,
            snapshots: {
                some: {
                    rawAssessment: { not: null },
                },
            },
        },
        select: { id: true, name: true },
    });

    console.log(`Found ${affected.length} animals with missing assessment data\n`);

    let restored = 0;
    for (const animal of affected) {
        // Get most recent snapshot with rawAssessment
        const snap = await prisma.animalSnapshot.findFirst({
            where: {
                animalId: animal.id,
                rawAssessment: { not: null },
            },
            orderBy: { scrapedAt: 'desc' },
        });

        if (!snap) continue;

        const raw = snap.rawAssessment as Record<string, unknown> | null;
        const assessment = (raw as any)?.assessment as Record<string, unknown> | undefined;

        if (!assessment) continue;

        // Build AnimalAssessment data from the raw CV assessment
        const assessmentData: Record<string, unknown> = {
            ageEstimatedLow: assessment.estimatedAgeLow ?? null,
            ageEstimatedHigh: assessment.estimatedAgeHigh ?? null,
            ageConfidence: assessment.confidence ?? 'NONE',
            ageIndicators: assessment.indicators ?? [],
            detectedBreeds: assessment.detectedBreeds ?? [],
            breedConfidence: assessment.detectedBreeds?.length ? assessment.confidence : 'NONE',
            visibleConditions: assessment.visibleConditions ?? [],
            healthNotes: assessment.healthNotes ?? null,
            bodyConditionScore: typeof assessment.bodyConditionScore === 'number' ? assessment.bodyConditionScore : null,
            coatCondition: assessment.coatCondition ?? null,
            aggressionRisk: typeof assessment.aggressionRisk === 'number' ? assessment.aggressionRisk : null,
            fearIndicators: assessment.fearIndicators ?? [],
            stressLevel: assessment.stressLevel ?? null,
            behaviorNotes: assessment.behaviorNotes ?? null,
            photoQuality: assessment.photoQuality ?? null,
            likelyCareNeeds: assessment.likelyCareNeeds ?? [],
            estimatedCareLevel: assessment.estimatedCareLevel ?? null,
            dataConflicts: assessment.dataConflicts ?? [],
            dentalGrade: typeof assessment.dentalGrade === 'number' ? assessment.dentalGrade : null,
            tartarSeverity: assessment.tartarSeverity ?? null,
            dentalNotes: assessment.dentalNotes ?? null,
            cataractStage: assessment.cataractStage ?? null,
            eyeNotes: assessment.eyeNotes ?? null,
            estimatedWeightLbs: typeof assessment.estimatedWeightLbs === 'number' ? assessment.estimatedWeightLbs : null,
            mobilityAssessment: assessment.mobilityAssessment ?? null,
            mobilityNotes: assessment.mobilityNotes ?? null,
            energyLevel: assessment.energyLevel ?? null,
            groomingNeeds: assessment.groomingNeeds ?? null,
        };

        // Upsert into AnimalAssessment child table
        await prisma.animalAssessment.upsert({
            where: { animalId: animal.id },
            update: assessmentData,
            create: { animalId: animal.id, ...assessmentData },
        });

        // Also set ageSource on the parent Animal record
        await prisma.animal.update({
            where: { id: animal.id },
            data: { ageSource: 'CV_ESTIMATED' },
        });

        restored++;
        const bcs = assessmentData.bodyConditionScore;
        const conf = assessmentData.ageConfidence;
        const ageLow = assessmentData.ageEstimatedLow;
        const ageHigh = assessmentData.ageEstimatedHigh;
        console.log(`  ✅ ${animal.name || 'Unnamed'} — restored age:${ageLow}–${ageHigh}yr (${conf}), BCS:${bcs ?? '?'}`);
    }

    console.log(`\n🏁 Restored ${restored} animals`);
    await prisma.$disconnect();
    process.exit(0);
}

main().catch(console.error);
