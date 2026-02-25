/**
 * RescueGroups Runner
 *
 * Fetches senior animals from RescueGroups.org API and syncs to DB.
 * This is separate from the per-shelter scraper because RescueGroups
 * is a bulk aggregator — one call pulls from many shelters at once.
 *
 * Usage:
 *   npx tsx scraper/run-rescuegroups.ts              # full pull
 *   npx tsx scraper/run-rescuegroups.ts --dry-run     # preview only
 *   npx tsx scraper/run-rescuegroups.ts --no-cv       # skip CV
 *   npx tsx scraper/run-rescuegroups.ts --state=CA    # single state
 */

import 'dotenv/config';
import { createPrismaClient } from './lib/prisma';
import { scrapeRescueGroups } from './adapters/rescuegroups';
import { createAgeEstimationProvider, lookupLifeExpectancy, computeAssessmentDiff, type AgeEstimationProvider } from './cv';
import { findDuplicate, computePhotoHashFromBuffer, hammingDistance, PHASH_THRESHOLD } from './dedup';
import { sanitizeText } from './lib/sanitize-text';
import type { ScrapedAnimal } from './types';

/** How many animals to process in parallel */
const CONCURRENCY = 5;



/**
 * Download an image and return as Buffer.
 * Shared between CV and photo hash to avoid double-fetching.
 */
async function downloadImage(url: string): Promise<Buffer | null> {
    try {
        const response = await fetch(url, {
            signal: AbortSignal.timeout(15_000),
            headers: { 'User-Agent': 'GoldenYearsClub/1.0' },
        });
        if (!response.ok) return null;
        const ct = response.headers.get('content-type') || '';
        if (ct.startsWith('text/html') || ct.startsWith('application/json')) return null;
        const buf = Buffer.from(await response.arrayBuffer());
        return buf.length < 500 ? null : buf;
    } catch {
        return null;
    }
}

async function main() {
    const dryRun = process.argv.includes('--dry-run');
    const noCv = process.argv.includes('--no-cv');
    const stateArg = process.argv.find(a => a.startsWith('--state='))?.split('=')[1];

    console.log(`🐾 Golden Years Club — RescueGroups Sync${dryRun ? ' (DRY RUN)' : ''}${noCv ? ' (NO CV)' : ''}`);
    if (stateArg) console.log(`   State filter: ${stateArg}`);

    // Step 1: Fetch from RescueGroups API
    const { animals, shelters } = await scrapeRescueGroups({
        state: stateArg,
    });

    console.log(`\n📊 Fetched ${animals.length} senior animals from ${shelters.size} shelters`);

    // Filter: photo required
    const withPhotos = animals.filter(a => a.photoUrl && a.species !== 'OTHER');
    console.log(`   ${withPhotos.length} with photos (dropped ${animals.length - withPhotos.length} without)`);

    if (dryRun) {
        console.log(`\n--- Sample (first 20) ---`);
        for (const a of withPhotos.slice(0, 20)) {
            console.log(`   📷 ${a.intakeId} | ${a.name || 'Unnamed'} | ${a.species} | ${a.breed} | ${a.ageKnownYears ?? '?'}yr | ${a.sex} | ${a._shelterName || 'Unknown Shelter'} (${a._shelterState})`);
        }
        console.log(`\n--- Shelters found ---`);
        for (const [id, s] of shelters) {
            console.log(`   🏠 ${s.name} — ${s.city}, ${s.state}`);
        }
        console.log(`\n✅ Dry run complete. ${withPhotos.length} animals ready to sync.`);
        process.exit(0);
    }

    // Init DB
    const prisma = await createPrismaClient();

    // Init CV provider
    let cvProvider: AgeEstimationProvider | null = null;
    if (!noCv) {
        cvProvider = createAgeEstimationProvider();
        if (!cvProvider) {
            console.warn('⚠ CV disabled (no GEMINI_API_KEY). Proceeding without age estimation.');
        }
    }

    // State name → 2-letter abbreviation map
    const STATE_ABBREV: Record<string, string> = {
        'alabama': 'AL', 'alaska': 'AK', 'arizona': 'AZ', 'arkansas': 'AR', 'california': 'CA',
        'colorado': 'CO', 'connecticut': 'CT', 'delaware': 'DE', 'district of columbia': 'DC', 'florida': 'FL',
        'georgia': 'GA', 'hawaii': 'HI', 'idaho': 'ID', 'illinois': 'IL', 'indiana': 'IN',
        'iowa': 'IA', 'kansas': 'KS', 'kentucky': 'KY', 'louisiana': 'LA', 'maine': 'ME',
        'maryland': 'MD', 'massachusetts': 'MA', 'michigan': 'MI', 'minnesota': 'MN', 'mississippi': 'MS',
        'missouri': 'MO', 'montana': 'MT', 'nebraska': 'NE', 'nevada': 'NV', 'new hampshire': 'NH',
        'new jersey': 'NJ', 'new mexico': 'NM', 'new york': 'NY', 'north carolina': 'NC', 'north dakota': 'ND',
        'ohio': 'OH', 'oklahoma': 'OK', 'oregon': 'OR', 'pennsylvania': 'PA', 'rhode island': 'RI',
        'south carolina': 'SC', 'south dakota': 'SD', 'tennessee': 'TN', 'texas': 'TX', 'utah': 'UT',
        'vermont': 'VT', 'virginia': 'VA', 'washington': 'WA', 'west virginia': 'WV', 'wisconsin': 'WI',
        'wyoming': 'WY',
    };

    function normalizeState(raw: string): string {
        const trimmed = raw.trim();
        if (/^[A-Z]{2}$/.test(trimmed)) return trimmed;
        if (/^[a-z]{2}$/i.test(trimmed)) return trimmed.toUpperCase();
        return STATE_ABBREV[trimmed.toLowerCase()] || trimmed.toUpperCase();
    }

    // Step 2: Upsert shelters from RescueGroups org data
    let sheltersCreated = 0;
    for (const [rgId, s] of shelters) {
        const dbId = `rg-${rgId}`;
        const stateNormalized = normalizeState(s.state);
        try {
            await (prisma as any).shelter.upsert({
                where: { id: dbId },
                update: { lastScrapedAt: new Date(), state: stateNormalized, shelterType: 'RESCUE' },
                create: {
                    id: dbId,
                    name: s.name,
                    county: s.city,
                    state: stateNormalized,
                    shelterType: 'RESCUE',
                    phone: s.phone,
                    websiteUrl: s.url,
                    totalIntakeAnnual: 0,
                    totalEuthanizedAnnual: 0,
                    dataYear: new Date().getFullYear(),
                    dataSourceName: 'RescueGroups.org',
                    dataSourceUrl: 'https://www.rescuegroups.org',
                },
            });
            sheltersCreated++;
        } catch (err) {
            console.error(`   ❌ Shelter upsert failed for ${s.name}: ${(err as Error).message?.substring(0, 100)}`);
        }
    }
    console.log(`\n🏠 ${sheltersCreated} shelters upserted`);

    // Step 3: Preload existing photo hashes for in-memory Tier 3 dedup
    // This avoids querying ALL hashes per-animal (was ~1710 full-table scans)
    const existingHashes: Map<string, string> = new Map(); // animalId → photoHash
    try {
        const hashRecords = await (prisma as any).animal.findMany({
            where: { photoHash: { not: null } },
            select: { id: true, photoHash: true },
        });
        for (const r of hashRecords) {
            if (r.photoHash) existingHashes.set(r.id, r.photoHash);
        }
        console.log(`   Preloaded ${existingHashes.size} photo hashes for Tier 3 dedup`);
    } catch (err) {
        console.warn(`   ⚠ Could not preload hashes: ${(err as Error).message?.substring(0, 80)}`);
    }

    // Step 4: Upsert animals with concurrency
    let created = 0;
    let updated = 0;
    let cvProcessed = 0;
    let skippedNonPhoto = 0;
    let dedupMerged = 0;
    let cvSkipped = 0;
    let errors = 0;
    const startTime = Date.now();

    /**
     * Process a single animal: download image once, run CV + hash + dedup + DB upsert.
     * Skips Gemini CV for returning animals that already have assessments (same photo).
     */
    async function processAnimal(animal: ScrapedAnimal): Promise<void> {
        const shelterId = animal._shelterId || 'unknown';

        // Download image once (shared between CV and photo hash)
        let imageBuffer: Buffer | null = null;
        if (animal.photoUrl) {
            imageBuffer = await downloadImage(animal.photoUrl);
        }

        // Compute photo hash from the already-downloaded buffer (no re-fetch!)
        let photoHash: string | null = null;
        if (imageBuffer) {
            try {
                photoHash = await computePhotoHashFromBuffer(imageBuffer);
            } catch {
                // Non-fatal
            }
        }

        try {
            // Tier 1 + 2: DB-backed dedup (fast indexed queries)
            let match = await findDuplicate(prisma, animal.intakeId, shelterId, animal.photoUrl, null);

            // Tier 3: In-memory perceptual hash (skip the full-table-scan query)
            if (!match && photoHash) {
                for (const [candidateId, candidateHash] of existingHashes) {
                    const dist = hammingDistance(photoHash, candidateHash);
                    if (dist <= PHASH_THRESHOLD) {
                        match = {
                            animalId: candidateId,
                            tier: 3,
                            reason: `Perceptual hash match (hamming distance: ${dist}, threshold: ${PHASH_THRESHOLD})`,
                        };
                        break;
                    }
                }
            }

            const existing = match
                ? await (prisma as any).animal.findUnique({ where: { id: match.animalId } })
                : null;

            if (match && match.tier > 1) {
                console.log(`   🔗 Dedup T${match.tier}: ${animal.intakeId} → ${match.reason}`);
                dedupMerged++;
            }

            // CV age estimation — skip if existing record already has CV data with same photo
            let cvEstimate = null;
            const hasExistingCv = existing?.ageEstimatedLow != null;
            const photoUnchanged = existing?.photoUrl === animal.photoUrl;

            if (hasExistingCv && photoUnchanged) {
                // Reuse existing CV data — no Gemini call needed
                cvSkipped++;
            } else if (cvProvider && animal.photoUrl) {
                try {
                    cvEstimate = await cvProvider.estimateAge(animal.photoUrl, animal.photoUrls, {
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
            }

            // Skip non-photo images (drawings, sketches, illustrations)
            if (cvEstimate && cvEstimate.confidence === 'NONE') {
                skippedNonPhoto++;
                return;
            }

            // Life expectancy (only compute for new CV results)
            const lifeExp = cvEstimate?.detectedBreeds?.length
                ? lookupLifeExpectancy(cvEstimate.detectedBreeds, animal.species, animal.size)
                : null;

            const now = new Date();

            // Build data — only overwrite CV fields if we have a new estimate
            const data: Record<string, any> = {
                name: sanitizeText(animal.name),
                species: animal.species,
                breed: sanitizeText(animal.breed),
                sex: animal.sex,
                size: animal.size,
                photoUrl: animal.photoUrl,
                photoUrls: animal.photoUrls ?? [],
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

            // Only overwrite CV fields when we have a fresh estimate
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
                // No CV and no existing data — set defaults
                data.ageSource = animal.ageSource || 'SHELTER_REPORTED';
                data.ageConfidence = 'NONE';
            }

            let animalId: string;
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
                animalId = existing.id;
                updated++;
            } else {
                const record = await (prisma as any).animal.create({
                    data: { shelterId, intakeId: animal.intakeId, ...data, firstSeenAt: now, daysInShelter: 0 },
                });
                animalId = record.id;
                created++;

                // Add new hash to in-memory map so subsequent animals can match
                if (photoHash) existingHashes.set(animalId, photoHash);
            }

            // Create temporal snapshot with diff logging
            const cvDiff = (cvEstimate && existing)
                ? computeAssessmentDiff(existing, cvEstimate)
                : null;
            if (cvDiff?.hasChanges) {
                console.log(`      📊 CV diff: ${cvDiff.summary}`);
            }

            await (prisma as any).animalSnapshot.create({
                data: {
                    animalId,
                    listingSource: `rescuegroups:${shelterId}`,
                    status: animal.status,
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
            errors++;
            console.error(`   ❌ ${animal.intakeId}: ${(err as Error).message?.substring(0, 100)}`);
        }
    }

    // Process in batches of CONCURRENCY
    for (let i = 0; i < withPhotos.length; i += CONCURRENCY) {
        const batch = withPhotos.slice(i, i + CONCURRENCY);
        await Promise.allSettled(batch.map(animal => processAnimal(animal)));

        // Progress every 50 animals
        const processed = Math.min(i + CONCURRENCY, withPhotos.length);
        if (processed % 50 < CONCURRENCY || processed === withPhotos.length) {
            const elapsed = ((Date.now() - startTime) / 1000).toFixed(0);
            const rate = (processed / ((Date.now() - startTime) / 1000)).toFixed(1);
            const eta = processed > 0
                ? (((withPhotos.length - processed) / (processed / ((Date.now() - startTime) / 1000)))).toFixed(0)
                : '?';
            console.log(`   ... ${processed}/${withPhotos.length} processed (${created} new, ${updated} updated) — ${elapsed}s elapsed, ~${rate}/s, ETA ${eta}s`);
        }
    }

    // Step 5: Reconciliation — delist stale animals per shelter (48h grace period)
    const graceCutoff = new Date(Date.now() - 48 * 60 * 60 * 1000);
    let totalDelisted = 0;
    for (const [rgId] of shelters) {
        const dbId = `rg-${rgId}`;
        try {
            const delisted = await (prisma as any).animal.updateMany({
                where: {
                    shelterId: dbId,
                    status: { in: ['AVAILABLE', 'URGENT'] },
                    lastSeenAt: { lt: graceCutoff },
                },
                data: {
                    status: 'DELISTED',
                    delistedAt: new Date(),
                },
            });
            if (delisted.count > 0) {
                console.log(`   🔄 Delisted ${delisted.count} animals not seen for 48+ hours from ${dbId}`);
                totalDelisted += delisted.count;
            }
        } catch (err) {
            console.error(`   ⚠ Reconciliation failed for ${dbId}: ${(err as Error).message?.substring(0, 80)}`);
        }
    }

    console.log(`\n🏁 Done in ${((Date.now() - startTime) / 1000).toFixed(0)}s!`);
    console.log(`   Animals: ${created} created, ${updated} updated, ${totalDelisted} delisted, ${errors} errors`);
    console.log(`   CV: ${cvProcessed} new estimates, ${cvSkipped} reused from previous run`);
    console.log(`   Cross-source dedup merges: ${dedupMerged}`);
    console.log(`   Non-photo images skipped: ${skippedNonPhoto}`);
    console.log(`   Shelters: ${sheltersCreated}`);
    process.exit(0);
}

main();
