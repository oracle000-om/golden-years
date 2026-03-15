/**
 * Golden Years Club — Shelter Scraper
 *
 * Scrapes adoptable senior animals from configured shelters,
 * runs CV age estimation on every photo, and syncs to the DB.
 *
 * Pipeline:
 *   1. Scrape animals via shelter adapter (photo required)
 *   2. Run Gemini CV on each photo → age estimate
 *   3. Upsert shelter + animals to DB
 *
 * Usage:
 *   npx tsx scraper/index.ts                      # full sync
 *   npx tsx scraper/index.ts --dry-run             # preview only
 *   npx tsx scraper/index.ts --shelter=la-county    # single shelter
 *   npx tsx scraper/index.ts --no-cv               # skip CV estimation
 */

import 'dotenv/config';
import { createPrismaClient } from './lib/prisma';
import { PrismaClient } from '../src/generated/prisma';
import { shelterConfigs } from './shelters';
import { createAgeEstimationProvider, lookupLifeExpectancy, computeAssessmentDiff, type AgeEstimationProvider } from './cv';
import { extractKeyFrames } from './cv/video-frames';
import { findDuplicate, computePhotoHash } from './dedup';
import { sanitizeText } from './lib/sanitize-text';
import { enqueueFailure } from './lib/retry-queue';
import { checkScrapeHealth } from './lib/alert';
import { reconcileAnimals } from './lib/reconcile';
import { startRun, finishRun } from './lib/scrape-run';
import { upsertAnimalChildren, stripChildFields } from './lib/upsert-children';



async function main() {
    const dryRun = process.argv.includes('--dry-run');
    const noCv = process.argv.includes('--no-cv');
    const shelterArg = process.argv.find(a => a.startsWith('--shelter='))?.split('=')[1];

    // Filter shelters
    const shelters = shelterArg
        ? shelterConfigs.filter(s => s.id === shelterArg)
        : shelterConfigs;

    if (shelters.length === 0) {
        console.error(`❌ Unknown shelter: ${shelterArg}`);
        console.log(`   Available: ${shelterConfigs.map(s => s.id).join(', ')}`);
        process.exit(1);
    }

    // Init CV provider
    let cvProvider: AgeEstimationProvider | null = null;
    if (!noCv && !dryRun) {
        cvProvider = createAgeEstimationProvider();
        if (!cvProvider) {
            console.warn('⚠ CV disabled (no GEMINI_API_KEY). Proceeding without age estimation.');
        }
    }

    // Init DB
    let prisma: PrismaClient | null = null;
    if (!dryRun) {
        prisma = await createPrismaClient();
    }

    const runId = !dryRun ? await startRun('shelters', { shelterArg }) : '';

    console.log(`🐾 Golden Years Club — Scraper${dryRun ? ' (DRY RUN)' : ''}${noCv ? ' (NO CV)' : ''}`);

    console.log(`   Shelters: ${shelters.map(s => s.id).join(', ')}\n`);

    let grandTotalCreated = 0;
    let grandTotalUpdated = 0;
    let grandTotalCvProcessed = 0;
    let grandTotalDedupMerged = 0;
    let grandTotalErrors = 0;

    for (const shelter of shelters) {
        console.log(`🏠 ${shelter.name}`);
        const shelterStartTime = Date.now();

        // Step 1: Scrape
        let animals;
        try {
            animals = await shelter.adapter();
        } catch (error) {
            console.error(`   ❌ Scrape failed: ${(error as Error).message}`);
            continue;
        }

        // Filter: photo required, dogs and cats only
        const withPhotos = animals.filter(a => a.photoUrl && a.species !== 'OTHER');
        if (withPhotos.length < animals.length) {
            console.log(`   ⚠ Dropped ${animals.length - withPhotos.length} animals without photos`);
        }

        if (dryRun) {
            console.log(`   --- Sample data (first 10) ---`);
            for (const a of withPhotos.slice(0, 10)) {
                console.log(`   📷 ${a.intakeId} | ${a.name || 'Unnamed'} | ${a.breed} | ${a.ageKnownYears}yr | ${a.sex} | ${a.intakeReason}`);
            }
            console.log(`   ✅ ${withPhotos.length} seniors with photos\n`);
            continue;
        }

        if (!prisma) continue;

        // Step 2: Upsert shelter
        await prisma.shelter.upsert({
            where: { id: shelter.id },
            update: {
                name: shelter.name,
                county: shelter.county,
                state: shelter.state,
                address: shelter.address,
                phone: shelter.phone,
                websiteUrl: shelter.websiteUrl,
                lastScrapedAt: new Date(),
                dataSourceAdapter: 'shelters',
            },
            create: {
                id: shelter.id,
                name: shelter.name,
                county: shelter.county,
                state: shelter.state,
                address: shelter.address,
                phone: shelter.phone,
                websiteUrl: shelter.websiteUrl,
                totalIntakeAnnual: 0,
                totalEuthanizedAnnual: 0,
            },
        });

        let created = 0;
        let updated = 0;
        let cvProcessed = 0;
        let dedupMerged = 0;

        for (const animal of withPhotos) {
            // Step 3: CV age estimation
            let cvEstimate = null;
            if (cvProvider && animal.photoUrl) {
                try {
                    console.log(`   🔬 CV: ${animal.name || animal.intakeId}...`);
                    // Extract video key frames if available
                    let videoFrames: Buffer[] | undefined;
                    if (animal.videoUrl) {
                        videoFrames = await extractKeyFrames(animal.videoUrl, 3);
                        if (videoFrames.length > 0) {
                            console.log(`      🎥 Extracted ${videoFrames.length} video frames`);
                        }
                    }
                    cvEstimate = await cvProvider.estimateAge(animal.photoUrl, undefined, {
                        shelterSize: animal.size,
                        shelterSpecies: animal.species,
                        shelterAge: animal.ageKnownYears,
                        shelterBreed: animal.breed,
                        shelterNotes: animal.notes,
                    }, undefined, videoFrames);
                    if (cvEstimate) {
                        cvProcessed++;
                        const breeds = cvEstimate.detectedBreeds.length > 0
                            ? cvEstimate.detectedBreeds.join(' / ')
                            : 'unknown breed';
                        const modelTag = cvEstimate.modelUsed === 'gemini-2.5-flash-lite' ? '[LITE]' : '[FLASH]';
                        console.log(`      → ${modelTag} ${cvEstimate.estimatedAgeLow}–${cvEstimate.estimatedAgeHigh}yr (${cvEstimate.confidence}) | ${breeds} | BCS:${cvEstimate.bodyConditionScore ?? '?'} | Aggr:${cvEstimate.aggressionRisk}/5 | Care:${cvEstimate.estimatedCareLevel}`);
                    }
                } catch (err) {
                    console.log(`      ⚠ CV error: ${(err as Error).message}`);
                }

                // Rate limit: 350ms between CV calls (up from 250ms to account for tiered fallback)
                await new Promise(r => setTimeout(r, 350));
            }

            // Life expectancy lookup from breed data
            const lifeExp = cvEstimate?.detectedBreeds?.length
                ? lookupLifeExpectancy(cvEstimate.detectedBreeds, animal.species, animal.size)
                : null;

            // Step 4: Compute photo hash for dedup
            let photoHash: string | null = null;
            if (animal.photoUrl) {
                try {
                    photoHash = await computePhotoHash(animal.photoUrl);
                } catch {
                    // Non-fatal: proceed without hash
                }
            }

            // Step 5: Dedup + upsert animal
            try {
                const match = await findDuplicate(prisma, animal.intakeId, shelter.id, animal.photoUrl, photoHash);
                const existing = match
                    ? await prisma.animal.findUnique({ where: { id: match.animalId } })
                    : null;

                if (match && match.tier > 1) {
                    console.log(`      🔗 Dedup T${match.tier}: ${match.reason}`);
                    dedupMerged++;
                }

                const now = new Date();
                const data: Record<string, unknown> = {
                    name: sanitizeText(animal.name),
                    species: animal.species,
                    breed: sanitizeText(animal.breed),
                    sex: animal.sex,
                    size: animal.size,
                    photoUrl: animal.photoUrl,
                    photoHash,
                    videoUrl: animal.videoUrl ?? null,
                    status: animal.status,
                    ageKnownYears: animal.ageKnownYears != null ? Number(animal.ageKnownYears) : null,
                    intakeReason: animal.intakeReason,
                    intakeReasonDetail: sanitizeText(animal.intakeReasonDetail),
                    euthScheduledAt: animal.euthScheduledAt,
                    intakeDate: animal.intakeDate,
                    notes: sanitizeText(animal.notes),
                    // v2: temporal tracking
                    lastSeenAt: now,
                    ageSegment: (animal as any).ageSegment || 'UNKNOWN',
                    // v10: Reset listing protection counters
                    consecutiveMisses: 0,
                    staleSince: null,
                };

                // Only overwrite CV fields when we have a fresh estimate —
                // otherwise preserve whatever is already in the DB
                if (cvEstimate) {
                    Object.assign(data, {
                        ageSource: 'CV_ESTIMATED' as const,
                        ageEstimatedLow: cvEstimate.estimatedAgeLow ?? null,
                        ageEstimatedHigh: cvEstimate.estimatedAgeHigh ?? null,
                        ageConfidence: cvEstimate.confidence ?? 'NONE',
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
                    });
                } else if (!existing) {
                    // New animal with no CV — set default source
                    data.ageSource = animal.ageSource || 'SHELTER_REPORTED';
                    data.ageConfidence = 'NONE';
                }

                let animalId: string;
                if (existing) {
                    // Re-entry detection: animal was delisted/stale but reappeared
                    const existingStatus = existing.status as string;
                    if (existingStatus === 'DELISTED' || existingStatus === 'STALE') {
                        const wasDelistedLongAgo = (existing as any).delistedAt &&
                            (now.getTime() - new Date((existing as any).delistedAt).getTime()) > 48 * 60 * 60 * 1000;
                        const wasStale = existingStatus === 'STALE';
                        if (wasDelistedLongAgo) {
                            data.shelterEntryCount = ((existing as any).shelterEntryCount || 1) + 1;
                            console.log(`      🔄 Re-entry #${data.shelterEntryCount}: ${animal.name || animal.intakeId}`);
                        } else if (wasStale) {
                            console.log(`      ↩️ Restoring from STALE: ${animal.name || animal.intakeId}`);
                        }
                        // Auto-recovery: restore status
                        data.status = animal.status;
                    }
                    await prisma.animal.update({
                        where: { id: existing.id },
                        data: {
                            ...stripChildFields(data),
                            daysInShelter: existing.firstSeenAt
                                ? Math.floor((now.getTime() - existing.firstSeenAt.getTime()) / (1000 * 60 * 60 * 24))
                                : 0,
                        },
                    });
                    animalId = existing.id;
                    updated++;
                    await upsertAnimalChildren(prisma, animalId, data);
                } else {
                    const created_record = await prisma.animal.create({
                        data: {
                            shelterId: shelter.id,
                            intakeId: animal.intakeId,
                            ...stripChildFields(data),
                            firstSeenAt: now,
                            daysInShelter: 0,
                        },
                    });
                    animalId = created_record.id;
                    created++;
                    await upsertAnimalChildren(prisma, animalId, data);
                }

                // v2: Create temporal snapshot with diff logging
                const cvDiff = (cvEstimate && existing)
                    ? computeAssessmentDiff(existing, cvEstimate)
                    : null;
                if (cvDiff?.hasChanges) {
                    console.log(`      📊 CV diff: ${cvDiff.summary}`);
                }

                await prisma.animalSnapshot.create({
                    data: {
                        animalId,
                        listingSource: shelter.id,
                        status: animal.status as 'AVAILABLE' | 'URGENT',
                        name: animal.name,
                        photoUrl: animal.photoUrl,
                        notes: animal.notes,
                        euthScheduledAt: animal.euthScheduledAt,
                        bodyConditionScore: cvEstimate?.bodyConditionScore ?? null,
                        coatCondition: cvEstimate?.coatCondition ?? null,
                        aggressionRisk: cvEstimate?.aggressionRisk ?? null,
                        stressLevel: cvEstimate?.stressLevel ?? null,
                        photoQuality: cvEstimate?.photoQuality ?? null,
                        rawAssessment: cvEstimate
                            ? JSON.parse(JSON.stringify({ assessment: cvEstimate, diff: cvDiff }))
                            : null,
                    },
                });
            } catch (err) {
                console.error(`      ❌ DB error for ${animal.intakeId}: ${(err as Error).message?.substring(0, 120)}`);
                grandTotalErrors++;
                await enqueueFailure('shelters', shelter.id, animal.intakeId, (err as Error).message);
            }
        }

        // Step 6: Reconciliation — delist stale animals with safeguards
        const reconcileResult = await reconcileAnimals({
            pipeline: 'shelters',
            prisma,
            shelterIds: [shelter.id],
            created,
            updated,
        });

        grandTotalCreated += created;
        grandTotalUpdated += updated;
        grandTotalCvProcessed += cvProcessed;
        grandTotalDedupMerged += dedupMerged;

        console.log(`   ✅ Created: ${created}, Updated: ${updated}, Dedup: ${dedupMerged}, CV: ${cvProcessed}/${withPhotos.length}\n`);
    }

    const totalAnimals = grandTotalCreated + grandTotalUpdated;
    console.log(`🏁 Done. Total: ${grandTotalCreated} created, ${grandTotalUpdated} updated, ${grandTotalDedupMerged} deduped, ${grandTotalCvProcessed} CV estimates, ${grandTotalErrors} errors.`);
    checkScrapeHealth('shelters', totalAnimals, grandTotalErrors, Date.now());
    await finishRun(runId, { created: grandTotalCreated, updated: grandTotalUpdated, errors: grandTotalErrors, errorSummary: grandTotalErrors > 0 ? `${grandTotalErrors} animal upsert failures` : undefined });
    process.exit(grandTotalErrors > 0 ? 1 : 0);
}

main();
