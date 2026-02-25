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
import { createAgeEstimationProvider, lookupLifeExpectancy, computeAssessmentDiff, type AgeEstimationProvider } from './cv';
import { findDuplicate, computePhotoHash } from './dedup';
import { sanitizeText } from './lib/sanitize-text';
import type { ScrapedAnimal } from './types';

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

    let cvProvider: AgeEstimationProvider | null = null;
    if (!noCv) {
        cvProvider = createAgeEstimationProvider();
        if (!cvProvider) {
            console.warn('⚠ CV disabled (no GEMINI_API_KEY). Proceeding without age estimation.');
        }
    }

    // Step 2: Upsert shelters
    let sheltersUpserted = 0;
    for (const config of configs) {
        const dbId = `socrata-${config.id}`;
        try {
            await (prisma as any).shelter.upsert({
                where: { id: dbId },
                update: { lastScrapedAt: new Date() },
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
                ? await (prisma as any).animal.findUnique({ where: { id: match.animalId } })
                : null;
        } catch { /* non-fatal */ }

        // CV estimation — skip if existing record already has CV data with same photo
        let cvEstimate = null;
        const hasExistingCv = existing?.ageEstimatedLow != null;
        const photoUnchanged = existing?.photoUrl === animal.photoUrl;

        if (hasExistingCv && photoUnchanged) {
            cvSkipped++;
        } else if (cvProvider && animal.photoUrl) {
            try {
                console.log(`   🔬 CV: ${animal.name || animal.intakeId}...`);
                cvEstimate = await cvProvider.estimateAge(animal.photoUrl, undefined, {
                    shelterSize: animal.size,
                    shelterSpecies: animal.species,
                    shelterAge: animal.ageKnownYears,
                    shelterBreed: animal.breed,
                    shelterNotes: animal.notes,
                });
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
                status: animal.status,
                ageKnownYears: animal.ageKnownYears != null ? Number(animal.ageKnownYears) : null,
                intakeReason: animal.intakeReason,
                intakeReasonDetail: sanitizeText(animal.intakeReasonDetail),
                euthScheduledAt: animal.euthScheduledAt,
                intakeDate: animal.intakeDate,
                notes: sanitizeText(animal.notes),
                lastSeenAt: now,
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
                });
            } else if (!hasExistingCv) {
                data.ageSource = animal.ageSource || 'SHELTER_REPORTED';
                data.ageConfidence = 'NONE';
            }

            if (existing) {
                await (prisma as any).animal.update({
                    where: { id: existing.id },
                    data: {
                        ...data,
                        daysInShelter: existing.firstSeenAt
                            ? Math.floor((now.getTime() - new Date(existing.firstSeenAt).getTime()) / (1000 * 60 * 60 * 24))
                            : 0,
                    },
                });
                updated++;
            } else {
                await (prisma as any).animal.create({
                    data: { shelterId, intakeId: animal.intakeId, ...data, firstSeenAt: now, daysInShelter: 0 },
                });
                created++;
            }
        } catch (err) {
            errors++;
            console.error(`   ❌ ${animal.intakeId}: ${(err as Error).message?.substring(0, 100)}`);
        }

        // Progress
        const total = created + updated + errors;
        if (total % 50 === 0 && total > 0) {
            const elapsed = ((Date.now() - startTime) / 1000).toFixed(0);
            console.log(`   ... ${total}/${animals.length} processed (${created} new, ${updated} updated) — ${elapsed}s`);
        }
    }

    // Step 4: Reconciliation — delist stale animals per shelter (48h grace period)
    const graceCutoff = new Date(Date.now() - 48 * 60 * 60 * 1000);
    let totalDelisted = 0;
    for (const config of configs) {
        const dbId = `socrata-${config.id}`;
        try {
            const delisted = await (prisma as any).animal.updateMany({
                where: {
                    shelterId: dbId,
                    status: { in: ['AVAILABLE', 'URGENT'] },
                    lastSeenAt: { lt: graceCutoff },
                },
                data: { status: 'DELISTED', delistedAt: new Date() },
            });
            if (delisted.count > 0) {
                console.log(`   🔄 Delisted ${delisted.count} animals not seen for 48+ hours from ${config.shelterName}`);
                totalDelisted += delisted.count;
            }
        } catch (err) {
            console.error(`   ⚠ Reconciliation failed for ${config.shelterName}: ${(err as Error).message?.substring(0, 80)}`);
        }
    }

    console.log(`\n🏁 Done in ${((Date.now() - startTime) / 1000).toFixed(0)}s!`);
    console.log(`   Animals: ${created} created, ${updated} updated, ${totalDelisted} delisted, ${errors} errors`);
    console.log(`   CV: ${cvProcessed} new estimates, ${cvSkipped} reused from previous run`);
    console.log(`   Shelters: ${sheltersUpserted}`);
    process.exit(0);
}

main();

