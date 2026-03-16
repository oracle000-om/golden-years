/**
 * Run Petfinder — Petfinder Web Scraper (GraphQL)
 *
 * Fetches senior animals from shelters via Petfinder's internal
 * GraphQL endpoint. No API keys needed (sunset API replaced).
 *
 * Usage:
 *   npx tsx scraper/run-petfinder.ts              # full pull
 *   npx tsx scraper/run-petfinder.ts --dry-run     # preview only
 *   npx tsx scraper/run-petfinder.ts --no-cv       # skip CV
 *   npx tsx scraper/run-petfinder.ts --shelter=muttville-ca  # single shelter
 */

import 'dotenv/config';
import { createPrismaClient } from './lib/prisma';
import { scrapePetfinder } from './adapters/petfinder';
import { createAgeEstimationProvider, lookupLifeExpectancy, computeAssessmentDiff, extractKeyFrames, type AgeEstimationProvider } from './cv';
import { findDuplicate, computePhotoHashFromBuffer, hammingDistance, PHASH_THRESHOLD } from './dedup';
import { sanitizeText } from './lib/sanitize-text';
import { enqueueFailure } from './lib/retry-queue';
import { checkScrapeHealth } from './lib/alert';
import { reconcileAnimals } from './lib/reconcile';
import { startRun, finishRun, failRun } from './lib/scrape-run';
import { shouldScrape } from './lib/should-scrape';
import type { ScrapedAnimal } from './types';
import { upsertAnimalChildren, stripChildFields } from './lib/upsert-children';
import { createEmbeddingHelper, type EmbeddingHelper } from './lib/embed-helper';
import { maybeCreateSnapshot } from './lib/snapshot-dedup';

const CONCURRENCY = 5;

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
    const shelterArg = process.argv.find(a => a.startsWith('--shelter='))?.split('=')[1];
    const shardArg = process.argv.find(a => a.startsWith('--shard='))?.split('=')[1];
    const totalShardsArg = process.argv.find(a => a.startsWith('--total-shards='))?.split('=')[1];
    const shard = shardArg != null ? parseInt(shardArg, 10) : undefined;
    const totalShards = totalShardsArg != null ? parseInt(totalShardsArg, 10) : undefined;

    // Conditional scrape: skip if last successful run was recent
    if (!dryRun && !shelterArg) {
        const proceed = await shouldScrape('petfinder', { shard, minIntervalMs: 6 * 60 * 60 * 1000 });
        if (!proceed) process.exit(0);
    }

    console.log(`🐾 Golden Years Club — Petfinder Sync${dryRun ? ' (DRY RUN)' : ''}${noCv ? ' (NO CV)' : ''}${shard != null ? ` (SHARD ${shard + 1}/${totalShards})` : ''}`);
    if (shelterArg) console.log(`   Shelter filter: ${shelterArg}`);

    // Step 1: Fetch from Petfinder API
    const { animals, shelters } = await scrapePetfinder({
        shelterIds: shelterArg ? [shelterArg] : undefined,
        shard,
        totalShards,
    });

    console.log(`\n📊 Fetched ${animals.length} senior animals from ${shelters.size} shelters`);

    const withPhotos = animals.filter(a => a.photoUrl && a.species !== 'OTHER');
    console.log(`   ${withPhotos.length} with photos (dropped ${animals.length - withPhotos.length} without)`);

    if (dryRun) {
        console.log(`\n--- Sample (first 20) ---`);
        for (const a of withPhotos.slice(0, 20)) {
            console.log(`   📷 ${a.intakeId} | ${a.name || 'Unnamed'} | ${a.species} | ${a.breed} | ${a.ageKnownYears ?? '?'}yr | ${a.sex} | ${a._shelterName || 'Unknown'} (${a._shelterState})`);
        }
        console.log(`\n--- Shelters found ---`);
        for (const [_id, s] of shelters) {
            console.log(`   🏠 ${s.name} — ${s.city}, ${s.state}`);
        }
        console.log(`\n✅ Dry run complete. ${withPhotos.length} animals ready to sync.`);
        process.exit(0);
    }

    const prisma = await createPrismaClient();
    const runId = await startRun('petfinder', { shard, totalShards, shelterArg });

    // Init CV provider
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
    let sheltersCreated = 0;
    for (const [pfId, s] of shelters) {
        try {
            await prisma.shelter.upsert({
                where: { id: pfId },
                update: { lastScrapedAt: new Date(), state: s.state },
                create: {
                    id: pfId,
                    name: s.name,
                    county: s.city,
                    state: s.state,
                    totalIntakeAnnual: 0,
                    totalEuthanizedAnnual: 0,
                    dataYear: new Date().getFullYear(),
                    dataSourceName: 'Petfinder',
                    dataSourceUrl: 'https://www.petfinder.com',
                    shelterType: 'NO_KILL',
                },
            });
            sheltersCreated++;
        } catch (err) {
            console.error(`   ❌ Shelter upsert failed for ${s.name}: ${(err as Error).message?.substring(0, 100)}`);
        }
    }
    console.log(`\n🏠 ${sheltersCreated} shelters upserted`);

    // Step 3: Preload photo hashes for dedup
    const existingHashes: Map<string, string> = new Map();
    try {
        const hashRecords = await prisma.animal.findMany({
            where: { photoHash: { not: null } },
            select: { id: true, photoHash: true },
        });
        for (const r of hashRecords) {
            if (r.photoHash) existingHashes.set(r.id, r.photoHash);
        }
        console.log(`   Preloaded ${existingHashes.size} photo hashes for dedup`);
    } catch (err) {
        console.warn(`   ⚠ Could not preload hashes: ${(err as Error).message?.substring(0, 80)}`);
    }

    // Step 4: Upsert animals with concurrency
    let created = 0, updated = 0, cvProcessed = 0, skippedNonPhoto = 0, dedupMerged = 0, cvSkipped = 0, errors = 0;
    const startTime = Date.now();

    async function processAnimal(animal: ScrapedAnimal): Promise<{ newHash?: [string, string] }> {
        const shelterId = animal._shelterId || 'unknown';
        let imageBuffer: Buffer | null = null;
        if (animal.photoUrl) imageBuffer = await downloadImage(animal.photoUrl);

        let photoHash: string | null = null;
        if (imageBuffer) {
            try { photoHash = await computePhotoHashFromBuffer(imageBuffer); } catch { /* Non-fatal */ }
        }

        try {
            let match = await findDuplicate(prisma, animal.intakeId, shelterId, animal.photoUrl, null);
            if (!match && photoHash) {
                for (const [candidateId, candidateHash] of existingHashes) {
                    const dist = hammingDistance(photoHash, candidateHash);
                    if (dist <= PHASH_THRESHOLD) {
                        match = { animalId: candidateId, tier: 3, reason: `Perceptual hash match (hamming: ${dist})` };
                        break;
                    }
                }
            }

            const existing = match
                ? await prisma.animal.findUnique({ where: { id: match.animalId }, include: { assessment: true } })
                : null;

            if (match && match.tier > 1) { dedupMerged++; }

            let cvEstimate = null;
            const hasExistingCv = (existing as any)?.assessment?.ageEstimatedLow != null;
            const photoUnchanged = existing?.photoUrl === animal.photoUrl;
            // Photo quality re-scrape: re-run CV if previous quality was poor
            // and new photos are available (primary changed or more photos added)
            const needsReassess = hasExistingCv && (existing as any)?.assessment?.photoQuality === 'poor' && (
                !photoUnchanged ||
                (animal.photoUrls?.length ?? 0) > (existing?.photoUrls?.length ?? 0)
            );

            if (needsReassess) {
                console.log(`      📸 Re-assessing (previous quality: poor, ${!photoUnchanged ? 'new primary photo' : 'new photos added'})`);
            }

            if (hasExistingCv && photoUnchanged && !needsReassess) { cvSkipped++; }
            else if (cvProvider && animal.photoUrl) {
                try {
                    // Extract key frames from video for enriched behavioral analysis
                    let videoFrames: Buffer[] = [];
                    if (animal.videoUrl) {
                        try { videoFrames = await extractKeyFrames(animal.videoUrl, 4); } catch { /* non-fatal */ }
                    }
                    cvEstimate = await cvProvider.estimateAge(animal.photoUrl, animal.photoUrls, { shelterSize: animal.size, shelterSpecies: animal.species, shelterAge: animal.ageKnownYears, shelterBreed: animal.breed, shelterNotes: animal.description || animal.notes }, undefined, videoFrames.length > 0 ? videoFrames : undefined);
                    if (cvEstimate) cvProcessed++;
                } catch { /* skip */ }
            }

            if (cvEstimate && cvEstimate.confidence === 'NONE') { skippedNonPhoto++; return {}; }

            const lifeExp = cvEstimate?.detectedBreeds?.length
                ? lookupLifeExpectancy(cvEstimate.detectedBreeds, animal.species, animal.size) : null;

            const now = new Date();
            const data: Record<string, any> = {
                name: sanitizeText(animal.name), species: animal.species, breed: sanitizeText(animal.breed),
                sex: animal.sex, size: animal.size, photoUrl: animal.photoUrl,
                photoUrls: animal.photoUrls ?? [],
                photoHash, status: animal.status,
                videoUrl: animal.videoUrl ?? null,
                ageKnownYears: animal.ageKnownYears != null ? Number(animal.ageKnownYears) : null,
                intakeReason: animal.intakeReason, intakeReasonDetail: sanitizeText(animal.intakeReasonDetail),
                euthScheduledAt: animal.euthScheduledAt, intakeDate: animal.intakeDate,
                notes: sanitizeText(animal.notes), lastSeenAt: now,
                ageSegment: animal.ageSegment || 'UNKNOWN',
                // v10: Reset listing protection counters
                consecutiveMisses: 0, staleSince: null,
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
                    ageSource: 'CV_ESTIMATED', ageEstimatedLow: cvEstimate.estimatedAgeLow,
                    ageEstimatedHigh: cvEstimate.estimatedAgeHigh, ageConfidence: cvEstimate.confidence,
                    ageIndicators: cvEstimate.indicators ?? [], detectedBreeds: cvEstimate.detectedBreeds ?? [],
                    breedConfidence: cvEstimate.detectedBreeds?.length ? cvEstimate.confidence : 'NONE',
                    lifeExpectancyLow: lifeExp?.low ?? null, lifeExpectancyHigh: lifeExp?.high ?? null,
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
                    // v8: Physical assessment from CV
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

            let animalId: string;
            let newHashPair: [string, string] | undefined;
            if (existing) {
                // Re-entry detection: animal was delisted/stale but reappeared
                if (existing.status === 'DELISTED' || existing.status === 'STALE') {
                    const wasDelistedLongAgo = existing.delistedAt &&
                        (now.getTime() - new Date(existing.delistedAt).getTime()) > 48 * 60 * 60 * 1000;
                    if (wasDelistedLongAgo) {
                        data.shelterEntryCount = (existing.shelterEntryCount || 1) + 1;
                        console.log(`      🔄 Re-entry #${data.shelterEntryCount}: ${animal.name || animal.intakeId}`);
                    } else if (existing.status === 'STALE') {
                        console.log(`      ↩️ Restoring from STALE: ${animal.name || animal.intakeId}`);
                    }
                    // Auto-recovery: restore status
                    data.status = animal.status;
                }
                await prisma.animal.update({
                    where: { id: existing.id }, data: {
                        ...stripChildFields(data),
                        daysInShelter: existing.firstSeenAt
                            ? Math.floor((now.getTime() - new Date(existing.firstSeenAt).getTime()) / (1000 * 60 * 60 * 24)) : 0,
                    }
                });
                animalId = existing.id; updated++;
                await upsertAnimalChildren(prisma, animalId, data);
            } else {
                const record = await prisma.animal.create({
                    data: { shelterId, intakeId: animal.intakeId, ...stripChildFields(data), firstSeenAt: now, daysInShelter: 0 },
                });
                animalId = record.id; created++;
                await upsertAnimalChildren(prisma, animalId, data);
                // Buffer hash for post-batch merge (avoids race condition)
                if (photoHash) newHashPair = [animalId, photoHash];
            }

            // Generate visual embedding (Phase 2 — Zilliz Cloud)
            if (embedHelper) {
                await embedHelper.embedAnimal(animalId, animal.photoUrl, {
                    species: animal.species,
                    shelterId: animal._shelterId || undefined,
                    ageSegment: animal.ageSegment,
                });
            }

            const cvDiff = (cvEstimate && existing)
                ? computeAssessmentDiff(existing, cvEstimate)
                : null;
            if (cvDiff?.hasChanges) {
                console.log(`      📊 CV diff: ${cvDiff.summary}`);
            }

            await maybeCreateSnapshot(prisma, {
                animalId, listingSource: `petfinder:${shelterId}`,
                status: animal.status, name: animal.name, photoUrl: animal.photoUrl,
                notes: animal.notes, euthScheduledAt: animal.euthScheduledAt,
                bodyConditionScore: cvEstimate?.bodyConditionScore ?? null,
                coatCondition: cvEstimate?.coatCondition ?? null,
                aggressionRisk: cvEstimate?.aggressionRisk ?? null,
                stressLevel: cvEstimate?.stressLevel ?? null,
                photoQuality: cvEstimate?.photoQuality ?? null,
                rawAssessment: cvEstimate
                    ? JSON.parse(JSON.stringify({ assessment: cvEstimate, diff: cvDiff }))
                    : null,
            });
            return { newHash: newHashPair };
        } catch (err) {
            errors++;
            console.error(`   ❌ ${animal.intakeId}: ${(err as Error).message?.substring(0, 100)}`);
            await enqueueFailure('petfinder', shelterId, animal.intakeId, (err as Error).message);
            return {};
        }
    }

    // Process in batches — merge new hashes after each batch to prevent
    // race conditions where concurrent tasks miss each other's hashes.
    for (let i = 0; i < withPhotos.length; i += CONCURRENCY) {
        const batch = withPhotos.slice(i, i + CONCURRENCY);
        const results = await Promise.allSettled(batch.map(a => processAnimal(a)));

        // Merge new hashes into the shared map after the batch completes
        for (const result of results) {
            if (result.status === 'fulfilled' && result.value.newHash) {
                const [id, hash] = result.value.newHash;
                existingHashes.set(id, hash);
            }
        }

        const processed = Math.min(i + CONCURRENCY, withPhotos.length);
        if (processed % 50 < CONCURRENCY || processed === withPhotos.length) {
            const elapsed = ((Date.now() - startTime) / 1000).toFixed(0);
            console.log(`   ... ${processed}/${withPhotos.length} (${created} new, ${updated} updated) — ${elapsed}s`);
        }
    }

    // Step 5: Reconciliation — delist stale animals with safeguards
    const reconcileResult = await reconcileAnimals({
        pipeline: 'petfinder',
        prisma,
        shelterIds: Array.from(shelters.keys()),
        created,
        updated,
    });
    const totalDelisted = reconcileResult.totalDelisted;

    console.log(`\n🏁 Done in ${((Date.now() - startTime) / 1000).toFixed(0)}s!`);
    console.log(`   Animals: ${created} created, ${updated} updated, ${totalDelisted} delisted, ${errors} errors`);
    console.log(`   CV: ${cvProcessed} new, ${cvSkipped} reused | Dedup: ${dedupMerged} | Non-photo: ${skippedNonPhoto}`);
    if (embedHelper) {
        const es = embedHelper.stats();
        console.log(`   Embeddings: ${es.generated} new, ${es.skipped} skipped, ${es.failed} failed`);
        await embedHelper.shutdown();
    }
    console.log(`   Shelters: ${sheltersCreated}`);
    checkScrapeHealth('petfinder', created + updated, errors, Date.now() - startTime);
    await finishRun(runId, { created, updated, errors, delisted: totalDelisted, errorSummary: errors > 0 ? `${errors} animal upsert failures` : undefined });
    process.exit(errors > 0 ? 1 : 0);
}

main().catch(async (err) => {
    console.error('💀 Fatal error:', err);
    // Best-effort: mark the run as failed so it doesn't stay stuck in RUNNING
    try {
        const pg = await import('pg');
        const pool = new pg.default.Pool({ connectionString: process.env.DATABASE_URL });
        await pool.query(
            `UPDATE scrape_runs SET status = 'FAILED', finished_at = NOW(), error_summary = $1
             WHERE pipeline = 'petfinder' AND status = 'RUNNING' AND started_at > NOW() - INTERVAL '6 hours'`,
            [`Fatal: ${(err as Error).message?.substring(0, 200)}`],
        );
        await pool.end();
    } catch { /* last resort */ }
    process.exit(1);
});
