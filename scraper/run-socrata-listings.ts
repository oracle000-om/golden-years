/**
 * Run Socrata Listings — Active Shelter Inventory
 *
 * Fetches senior animals from Socrata open data portals that
 * publish real-time shelter inventory (animals available for adoption).
 *
 * Sources:
 *   - King County (Seattle), WA
 *   - Dallas, TX
 *   - Austin, TX
 *   - Sonoma County, CA
 *   - Norfolk, VA
 *
 * Usage:
 *   npx tsx scraper/run-socrata-listings.ts              # full pull
 *   npx tsx scraper/run-socrata-listings.ts --dry-run     # preview only
 *   npx tsx scraper/run-socrata-listings.ts --no-cv       # skip CV
 *   npx tsx scraper/run-socrata-listings.ts --shelter=austin-tx-inventory  # single shelter
 */

import 'dotenv/config';
import { createPrismaClient } from './lib/prisma';
import { scrapeSocrataListings, LISTING_CONFIGS } from './adapters/socrata-listings';
import { createAgeEstimationProvider, lookupLifeExpectancy, computeAssessmentDiff, extractKeyFrames, type AgeEstimationProvider } from './cv';
import { findDuplicate, computePhotoHash } from './dedup';
import { sanitizeText } from './lib/sanitize-text';
import { enqueueFailure } from './lib/retry-queue';
import { checkScrapeHealth } from './lib/alert';
import { reconcileAnimals } from './lib/reconcile';
import { startRun, finishRun, failRun } from './lib/scrape-run';
import type { ScrapedAnimal } from './types';
import { upsertAnimalChildren, stripChildFields } from './lib/upsert-children';
import { createEmbeddingHelper, type EmbeddingHelper } from './lib/embed-helper';

async function main() {
    const dryRun = process.argv.includes('--dry-run');
    const noCv = process.argv.includes('--no-cv');
    const shelterArg = process.argv.find(a => a.startsWith('--shelter='))?.split('=')[1];

    console.log(`🐾 Golden Years Club — Socrata Listings Sync${dryRun ? ' (DRY RUN)' : ''}${noCv ? ' (NO CV)' : ''}`);
    if (shelterArg) console.log(`   Shelter filter: ${shelterArg}`);

    // Step 1: Fetch from Socrata portals
    const { animals, configs } = await scrapeSocrataListings({
        shelterIds: shelterArg ? [shelterArg] : undefined,
    });

    console.log(`\n📊 Fetched ${animals.length} senior animals from ${configs.length} portals`);

    const withPhotos = animals.filter(a => a.photoUrl && a.species !== 'OTHER');
    const withoutPhotos = animals.filter(a => !a.photoUrl);
    console.log(`   ${withPhotos.length} with photos, ${withoutPhotos.length} without`);

    if (dryRun) {
        console.log(`\n--- Sample (first 20) ---`);
        for (const a of animals.slice(0, 20)) {
            const photo = a.photoUrl ? '📷' : '  ';
            console.log(`   ${photo} ${a.intakeId} | ${a.name || 'Unnamed'} | ${a.species} | ${a.breed} | ${a.ageKnownYears ?? '?'}yr | ${a.sex} | ${a._shelterName}`);
        }
        console.log(`\n✅ Dry run complete. ${animals.length} animals ready to sync.`);
        process.exit(0);
    }

    // Init DB + CV
    const prisma = await createPrismaClient();
    const runId = await startRun('socrata-listings', { shelterArg });

    let cvProvider: AgeEstimationProvider | null = null;
    if (!noCv) {
        cvProvider = createAgeEstimationProvider();
        if (!cvProvider) {
            console.warn('⚠ CV disabled (no GEMINI_API_KEY). Proceeding without age estimation.');
        }
    }

    // Init embedding provider
    let embedHelper: EmbeddingHelper | null = null;
    if (!noCv) {
        embedHelper = await createEmbeddingHelper(prisma);
    }

    // Step 2: Upsert shelters
    let sheltersUpserted = 0;
    for (const config of configs) {
        const dbId = `socrata-${config.id}`;
        try {
            await prisma.shelter.upsert({
                where: { id: dbId },
                update: {
                    name: config.shelterName,
                    county: config.city,
                    state: config.state,
                    lastScrapedAt: new Date(),
                },
                create: {
                    id: dbId,
                    name: config.shelterName,
                    county: config.city,
                    state: config.state,
                    totalIntakeAnnual: 0,
                    totalEuthanizedAnnual: 0,
                    dataYear: new Date().getFullYear(),
                    dataSourceName: 'Socrata Open Data',
                    dataSourceUrl: `https://${config.domain}`,
                },
            });
            sheltersUpserted++;
        } catch (err) {
            console.error(`   ❌ Shelter upsert failed for ${config.shelterName}: ${(err as Error).message?.substring(0, 100)}`);
        }
    }
    console.log(`\n🏠 ${sheltersUpserted} shelters upserted`);

    // Step 3: Upsert animals
    let created = 0, updated = 0, cvProcessed = 0, cvSkipped = 0, errors = 0;
    const startTime = Date.now();

    // Process all animals (including those without photos — they still have value)
    for (const animal of animals) {
        const shelterId = animal._shelterId || 'unknown';

        // Photo hash
        let photoHash: string | null = null;
        if (animal.photoUrl) {
            try { photoHash = await computePhotoHash(animal.photoUrl); } catch { /* non-fatal */ }
        }

        // Dedup — check for existing record BEFORE CV to avoid redundant Gemini calls
        let existing = null;
        try {
            const match = await findDuplicate(prisma, animal.intakeId, shelterId, animal.photoUrl, photoHash);
            existing = match
                ? await prisma.animal.findUnique({ where: { id: match.animalId }, include: { assessment: true } })
                : null;
        } catch { /* non-fatal */ }

        // CV estimation — skip if existing record already has CV data with same photo
        let cvEstimate = null;
        const hasExistingCv = (existing as any)?.assessment?.ageEstimatedLow != null;
        const photoUnchanged = existing?.photoUrl === animal.photoUrl;

        if (hasExistingCv && photoUnchanged && !(hasExistingCv && (existing as any)?.assessment?.photoQuality === 'poor' && !photoUnchanged)) {
            cvSkipped++;
        } else if (cvProvider && animal.photoUrl) {
            try {
                console.log(`   🔬 CV: ${animal.name || animal.intakeId}...`);
                let videoFrames: Buffer[] = [];
                if (animal.videoUrl) { try { videoFrames = await extractKeyFrames(animal.videoUrl, 4); } catch { /* non-fatal */ } }
                cvEstimate = await cvProvider.estimateAge(animal.photoUrl, undefined, {
                    shelterSize: animal.size,
                    shelterSpecies: animal.species,
                    shelterAge: animal.ageKnownYears,
                    shelterBreed: animal.breed,
                    shelterNotes: animal.description || animal.notes,
                }, undefined, videoFrames.length > 0 ? videoFrames : undefined);
                if (cvEstimate) cvProcessed++;
            } catch {
                // Silently skip CV errors
            }
            // Rate limit
            await new Promise(r => setTimeout(r, 250));
        }

        // Skip non-photo images (drawings, etc.)
        if (cvEstimate && cvEstimate.confidence === 'NONE') continue;

        // Life expectancy
        const lifeExp = cvEstimate?.detectedBreeds?.length
            ? lookupLifeExpectancy(cvEstimate.detectedBreeds, animal.species, animal.size)
            : null;

        try {
            const now = new Date();
            const data: Record<string, any> = {
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
                lastSeenAt: now,
                ageSegment: animal.ageSegment || 'UNKNOWN',
                // v6: Behavioral data
                houseTrained: animal.houseTrained ?? null,
                goodWithCats: animal.goodWithCats ?? null,
                goodWithDogs: animal.goodWithDogs ?? null,
                goodWithChildren: animal.goodWithChildren ?? null,
                specialNeeds: animal.specialNeeds ?? null,
                // v6: Coat & appearance
                coatType: animal.coatType ?? null,
                coatColors: animal.coatColors ?? [],
                // v6: Description & environment
                description: sanitizeText(animal.description),
                environmentNeeds: animal.environmentNeeds ?? [],
                // v7: Medical status
                isAltered: animal.isAltered ?? null,
                isMicrochipped: animal.isMicrochipped ?? null,
                isVaccinated: animal.isVaccinated ?? null,
                // v7: Adoption & listing
                adoptionFee: animal.adoptionFee ?? null,
                listingUrl: animal.listingUrl ?? null,
                isCourtesyListing: animal.isCourtesyListing ?? null,
                // v7: Physical details
                weight: animal.weight ?? null,
                birthday: animal.birthday ?? null,
                coatPattern: animal.coatPattern ?? null,
                isMixed: animal.isMixed ?? null,
                // v7: Foster
                isFosterHome: animal.isFosterHome ?? null,
            };

            if (cvEstimate) {
                Object.assign(data, {
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
                });
            } else if (!hasExistingCv) {
                data.ageSource = animal.ageSource || 'SHELTER_REPORTED';
                data.ageConfidence = 'NONE';
            }

            if (existing) {
                // Re-entry detection: only count as re-entry if delisted 48+ hours ago
                if (existing.status === 'DELISTED') {
                    const wasDelistedLongAgo = existing.delistedAt &&
                        (now.getTime() - new Date(existing.delistedAt).getTime()) > 48 * 60 * 60 * 1000;
                    if (wasDelistedLongAgo) {
                        data.shelterEntryCount = (existing.shelterEntryCount || 1) + 1;
                        console.log(`      🔄 Re-entry #${data.shelterEntryCount}: ${animal.name || animal.intakeId}`);
                    }
                }
                await prisma.animal.update({
                    where: { id: existing.id },
                    data: {
                        ...stripChildFields(data),
                        daysInShelter: existing.firstSeenAt
                            ? Math.floor((now.getTime() - new Date(existing.firstSeenAt).getTime()) / (1000 * 60 * 60 * 24))
                            : 0,
                    },
                });
                updated++;
                await upsertAnimalChildren(prisma, existing.id, data);

                // Generate visual embedding (Phase 2 — Zilliz Cloud)
                if (embedHelper && animal.photoUrl) {
                    await embedHelper.embedAnimal(existing.id, animal.photoUrl, {
                        species: animal.species,
                        shelterId: animal._shelterId || undefined,
                        ageSegment: animal.ageSegment,
                    });
                }
            } else {
                const record = await prisma.animal.create({
                    data: { shelterId, intakeId: animal.intakeId, ...stripChildFields(data), firstSeenAt: now, daysInShelter: 0 },
                });
                created++;
                await upsertAnimalChildren(prisma, record.id, data);

                // Generate visual embedding (Phase 2 — Zilliz Cloud)
                if (embedHelper && animal.photoUrl) {
                    await embedHelper.embedAnimal(record.id, animal.photoUrl, {
                        species: animal.species,
                        shelterId: animal._shelterId || undefined,
                        ageSegment: animal.ageSegment,
                    });
                }
            }
        } catch (err) {
            errors++;
            console.error(`   ❌ ${animal.intakeId}: ${(err as Error).message?.substring(0, 100)}`);
            await enqueueFailure('socrata-listings', shelterId, animal.intakeId, (err as Error).message);
        }

        // Progress
        const total = created + updated + errors;
        if (total % 50 === 0 && total > 0) {
            const elapsed = ((Date.now() - startTime) / 1000).toFixed(0);
            console.log(`   ... ${total}/${animals.length} processed (${created} new, ${updated} updated) — ${elapsed}s`);
        }
    }

    // Step 4: Reconciliation — delist stale animals with safeguards
    const reconcileResult = await reconcileAnimals({
        pipeline: 'socrata-listings',
        prisma,
        shelterIds: configs.map(c => `socrata-${c.id}`),
        created,
        updated,
    });
    const totalDelisted = reconcileResult.totalDelisted;

    console.log(`\n🏁 Done in ${((Date.now() - startTime) / 1000).toFixed(0)}s!`);
    console.log(`   Animals: ${created} created, ${updated} updated, ${totalDelisted} delisted, ${errors} errors`);
    console.log(`   CV: ${cvProcessed} new estimates, ${cvSkipped} reused from previous run`);
    if (embedHelper) {
        const es = embedHelper.stats();
        console.log(`   Embeddings: ${es.generated} new, ${es.skipped} skipped, ${es.failed} failed`);
        await embedHelper.shutdown();
    }
    console.log(`   Shelters: ${sheltersUpserted}`);
    checkScrapeHealth('socrata-listings', created + updated, errors, Date.now() - startTime);
    await finishRun(runId, { created, updated, errors, delisted: totalDelisted, errorSummary: errors > 0 ? `${errors} animal upsert failures` : undefined });
    process.exit(errors > 0 ? 1 : 0);
}

main().catch(async (err) => {
    console.error('💀 Fatal error:', err);
    try {
        const pg = await import('pg');
        const pool = new pg.default.Pool({ connectionString: process.env.DATABASE_URL });
        await pool.query(
            `UPDATE scrape_runs SET status = 'FAILED', finished_at = NOW(), error_summary = $1
             WHERE pipeline = 'socrata-listings' AND status = 'RUNNING' AND started_at > NOW() - INTERVAL '6 hours'`,
            [`Fatal: ${(err as Error).message?.substring(0, 200)}`],
        );
        await pool.end();
    } catch { /* last resort */ }
    process.exit(1);
});
