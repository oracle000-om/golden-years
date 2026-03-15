/**
 * Run CV — Dedicated post-scrape CV assessment
 *
 * Processes animals that don't yet have CV age estimation.
 * Runs AFTER all scrape jobs complete to keep scraping fast.
 *
 * Usage:
 *   npx tsx scraper/run-cv.ts                    # full run
 *   npx tsx scraper/run-cv.ts --limit=500        # cap at 500 animals
 *   npx tsx scraper/run-cv.ts --species=DOG      # dogs only
 *   npx tsx scraper/run-cv.ts --reassess         # re-assess poor quality
 *   npx tsx scraper/run-cv.ts --dry-run          # preview only
 */

import 'dotenv/config';
import { createPrismaClient } from './lib/prisma';
import { createAgeEstimationProvider, lookupLifeExpectancy, type AgeEstimationProvider } from './cv';
import { extractKeyFrames } from './cv/video-frames';
import { upsertAnimalChildren } from './lib/upsert-children';
import { startRun, finishRun } from './lib/scrape-run';

const CV_DELAY_MS = 350; // Rate limit between Gemini calls
const BATCH_SIZE = 20;   // Log progress every N animals

async function main() {
    const dryRun = process.argv.includes('--dry-run');
    const reassess = process.argv.includes('--reassess');
    const limitArg = process.argv.find(a => a.startsWith('--limit='))?.split('=')[1];
    const speciesArg = process.argv.find(a => a.startsWith('--species='))?.split('=')[1]?.toUpperCase();
    const limit = limitArg ? parseInt(limitArg, 10) : undefined;

    console.log(`🔬 Golden Years Club — CV Assessment${dryRun ? ' (DRY RUN)' : ''}${reassess ? ' (REASSESS)' : ''}`);
    if (limit) console.log(`   Limit: ${limit}`);
    if (speciesArg) console.log(`   Species: ${speciesArg}`);

    const prisma = await createPrismaClient();

    // Find animals needing CV assessment
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const where: Record<string, any> = {
        photoUrl: { not: null },
        species: speciesArg ? speciesArg : { in: ['DOG', 'CAT'] },
        status: { in: ['AVAILABLE', 'URGENT'] },
    };

    if (reassess) {
        // Re-assess animals with poor photo quality
        where.assessment = {
            is: { photoQuality: 'poor' },
        };
    } else {
        // Animals with no CV assessment at all
        where.OR = [
            { assessment: { is: null } },
            { assessment: { ageEstimatedLow: null } },
        ];
    }

    const animals = await prisma.animal.findMany({
        where,
        select: {
            id: true,
            name: true,
            intakeId: true,
            species: true,
            breed: true,
            sex: true,
            size: true,
            photoUrl: true,
            photoUrls: true,
            videoUrl: true,
            ageKnownYears: true,
            notes: true,
            description: true,
        },
        orderBy: { lastSeenAt: 'desc' },
        take: limit,
    });

    console.log(`   Found ${animals.length} animals needing CV assessment\n`);

    if (dryRun) {
        for (const a of animals.slice(0, 20)) {
            console.log(`   📷 ${a.intakeId} | ${a.name || 'Unnamed'} | ${a.species} | ${a.breed}`);
        }
        if (animals.length > 20) console.log(`   ... and ${animals.length - 20} more`);
        console.log(`\n✅ Dry run complete.`);
        process.exit(0);
    }

    if (animals.length === 0) {
        console.log('✅ No animals need CV assessment. Done.');
        process.exit(0);
    }

    // Init CV provider
    const cvProvider: AgeEstimationProvider | null = createAgeEstimationProvider();
    if (!cvProvider) {
        console.error('❌ CV disabled (no GEMINI_API_KEY). Cannot proceed.');
        process.exit(1);
    }

    const runId = await startRun('cv', { limit, species: speciesArg, reassess });
    const startTime = Date.now();
    let processed = 0;
    let errors = 0;

    for (const animal of animals) {
        try {
            // Extract video key frames if available
            let videoFrames: Buffer[] = [];
            if (animal.videoUrl) {
                try {
                    videoFrames = await extractKeyFrames(animal.videoUrl, 3);
                } catch { /* non-fatal */ }
            }

            const cvEstimate = await cvProvider.estimateAge(
                animal.photoUrl!,
                animal.photoUrls ?? undefined,
                {
                    shelterSize: animal.size,
                    shelterSpecies: animal.species,
                    shelterAge: animal.ageKnownYears,
                    shelterBreed: animal.breed,
                    shelterNotes: animal.notes || animal.description,
                },
                undefined,
                videoFrames.length > 0 ? videoFrames : undefined,
            );

            if (!cvEstimate || cvEstimate.confidence === 'NONE') {
                processed++;
                continue;
            }

            // Life expectancy lookup
            const lifeExp = cvEstimate.detectedBreeds?.length
                ? lookupLifeExpectancy(cvEstimate.detectedBreeds, animal.species, animal.size)
                : null;

            // Build assessment data object
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const data: Record<string, any> = {
                ageSource: 'CV_ESTIMATED',
                ageEstimatedLow: cvEstimate.estimatedAgeLow,
                ageEstimatedHigh: cvEstimate.estimatedAgeHigh,
                ageConfidence: cvEstimate.confidence,
                ageIndicators: cvEstimate.indicators ?? [],
                detectedBreeds: cvEstimate.detectedBreeds ?? [],
                breedConfidence: cvEstimate.detectedBreeds?.length ? cvEstimate.confidence : 'NONE',
                lifeExpectancyLow: lifeExp?.low ?? null,
                lifeExpectancyHigh: lifeExp?.high ?? null,
                bodyConditionScore: cvEstimate.bodyConditionScore ?? null,
                coatCondition: cvEstimate.coatCondition ?? null,
                visibleConditions: cvEstimate.visibleConditions ?? [],
                healthNotes: cvEstimate.healthNotes ?? null,
                aggressionRisk: cvEstimate.aggressionRisk ?? null,
                fearIndicators: cvEstimate.fearIndicators ?? [],
                stressLevel: cvEstimate.stressLevel ?? null,
                behaviorNotes: cvEstimate.behaviorNotes ?? null,
                photoQuality: cvEstimate.photoQuality ?? null,
                likelyCareNeeds: cvEstimate.likelyCareNeeds ?? [],
                estimatedCareLevel: cvEstimate.estimatedCareLevel ?? null,
                dataConflicts: cvEstimate.dataConflicts ?? [],
                dentalGrade: cvEstimate.dentalGrade ?? null,
                tartarSeverity: cvEstimate.tartarSeverity ?? null,
                dentalNotes: cvEstimate.dentalNotes ?? null,
                cataractStage: cvEstimate.cataractStage ?? null,
                eyeNotes: cvEstimate.eyeNotes ?? null,
                estimatedWeightLbs: cvEstimate.estimatedWeightLbs ?? null,
                mobilityAssessment: cvEstimate.mobilityAssessment ?? null,
                mobilityNotes: cvEstimate.mobilityNotes ?? null,
                energyLevel: cvEstimate.energyLevel ?? null,
                groomingNeeds: cvEstimate.groomingNeeds ?? null,
            };

            // Write to AnimalAssessment child table
            await upsertAnimalChildren(prisma, animal.id, data);

            // Also update ageSource on the Animal record
            await prisma.animal.update({
                where: { id: animal.id },
                data: { ageSource: 'CV_ESTIMATED' },
            });

            processed++;

            if (processed % BATCH_SIZE === 0 || processed === animals.length) {
                const elapsed = ((Date.now() - startTime) / 1000).toFixed(0);
                const breeds = cvEstimate.detectedBreeds.length > 0
                    ? cvEstimate.detectedBreeds.join(' / ')
                    : 'unknown';
                console.log(`   [${processed}/${animals.length}] ${animal.name || animal.intakeId} → ${cvEstimate.estimatedAgeLow}–${cvEstimate.estimatedAgeHigh}yr (${cvEstimate.confidence}) | ${breeds} — ${elapsed}s`);
            }
        } catch (err) {
            errors++;
            console.error(`   ❌ ${animal.intakeId}: ${(err as Error).message?.substring(0, 120)}`);
        }

        // Rate limit
        await new Promise(r => setTimeout(r, CV_DELAY_MS));
    }

    const totalTime = ((Date.now() - startTime) / 1000).toFixed(0);
    console.log(`\n🏁 CV Assessment complete in ${totalTime}s`);
    console.log(`   Processed: ${processed}, Errors: ${errors}`);

    await finishRun(runId, {
        created: 0,
        updated: processed,
        errors,
        errorSummary: errors > 0 ? `${errors} CV assessment failures` : undefined,
    });

    process.exit(errors > 0 ? 1 : 0);
}

main().catch(async (err) => {
    console.error('💀 Fatal error:', err);
    try {
        const pg = await import('pg');
        const pool = new pg.default.Pool({ connectionString: process.env.DATABASE_URL });
        await pool.query(
            `UPDATE scrape_runs SET status = 'FAILED', finished_at = NOW(), error_summary = $1
             WHERE pipeline = 'cv' AND status = 'RUNNING' AND started_at > NOW() - INTERVAL '6 hours'`,
            [`Fatal: ${(err as Error).message?.substring(0, 200)}`],
        );
        await pool.end();
    } catch { /* last resort */ }
    process.exit(1);
});
