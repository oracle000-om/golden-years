/**
 * Restore CV data that was clobbered by the scraper
 * 
 * Finds animals where CV fields are null but snapshots have valid data,
 * then restores from the most recent good snapshot.
 */
import 'dotenv/config';
import { createPrismaClient } from '../scraper/lib/prisma';

async function main() {
    const prisma = await createPrismaClient();

    // Find animals with null CV fields that have snapshots with data
    const affected = await (prisma as any).animal.findMany({
        where: {
            bodyConditionScore: null,
            snapshots: {
                some: {
                    bodyConditionScore: { not: null },
                },
            },
        },
        select: { id: true, name: true },
    });

    console.log(`Found ${affected.length} animals with clobbered CV data\n`);

    let restored = 0;
    for (const animal of affected) {
        // Get most recent snapshot with CV data
        const snap = await (prisma as any).animalSnapshot.findFirst({
            where: {
                animalId: animal.id,
                bodyConditionScore: { not: null },
            },
            orderBy: { scrapedAt: 'desc' },
        });

        if (!snap) continue;

        // Also check if there's a snapshot with rawAssessment for full CV data
        const cvSnap = await (prisma as any).animalSnapshot.findFirst({
            where: {
                animalId: animal.id,
                rawAssessment: { not: null },
            },
            orderBy: { scrapedAt: 'desc' },
        });

        const assessment = cvSnap?.rawAssessment?.assessment;
        const updateData: Record<string, unknown> = {
            bodyConditionScore: snap.bodyConditionScore,
            coatCondition: snap.coatCondition,
            stressLevel: snap.stressLevel,
        };

        // If we have the raw CV assessment, restore all the fields
        if (assessment) {
            Object.assign(updateData, {
                ageSource: 'CV_ESTIMATED',
                ageEstimatedLow: assessment.estimatedAgeLow ?? null,
                ageEstimatedHigh: assessment.estimatedAgeHigh ?? null,
                ageConfidence: assessment.confidence ?? 'NONE',
                ageIndicators: assessment.indicators ?? [],
                detectedBreeds: assessment.detectedBreeds ?? [],
                breedConfidence: assessment.detectedBreeds?.length ? assessment.confidence : 'NONE',
                visibleConditions: assessment.visibleConditions ?? [],
                healthNotes: assessment.healthNotes ?? null,
                aggressionRisk: assessment.aggressionRisk ?? null,
                fearIndicators: assessment.fearIndicators ?? [],
                behaviorNotes: assessment.behaviorNotes ?? null,
                photoQuality: assessment.photoQuality ?? null,
                likelyCareNeeds: assessment.likelyCareNeeds ?? [],
                estimatedCareLevel: assessment.estimatedCareLevel ?? null,
                dataConflicts: assessment.dataConflicts ?? [],
                dentalGrade: assessment.dentalGrade ?? null,
                tartarSeverity: assessment.tartarSeverity ?? null,
                dentalNotes: assessment.dentalNotes ?? null,
                cataractStage: assessment.cataractStage ?? null,
                eyeNotes: assessment.eyeNotes ?? null,
            });
        }

        await (prisma as any).animal.update({
            where: { id: animal.id },
            data: updateData,
        });

        restored++;
        console.log(`  ✅ ${animal.name || 'Unnamed'} — restored BCS:${snap.bodyConditionScore}, stress:${snap.stressLevel}, coat:${snap.coatCondition}${assessment ? ' + full CV' : ''}`);
    }

    console.log(`\n🏁 Restored ${restored} animals`);
    process.exit(0);
}

main().catch(console.error);
