/**
 * Run ShelterLuv — ShelterLuv Platform Scraper
 *
 * Fetches senior animals from shelters using the ShelterLuv
 * platform via their public embed API.
 *
 * Usage:
 *   npx tsx scraper/run-shelterluv.ts              # full pull
 *   npx tsx scraper/run-shelterluv.ts --dry-run     # preview only
 *   npx tsx scraper/run-shelterluv.ts --no-cv       # skip CV
 *   npx tsx scraper/run-shelterluv.ts --shelter=acct-philly  # single shelter
 */

import 'dotenv/config';
import { createPrismaClient } from './lib/prisma';
import { scrapeShelterLuv } from './adapters/shelterluv';
import { createAgeEstimationProvider, lookupLifeExpectancy, computeAssessmentDiff, type AgeEstimationProvider } from './cv';
import { findDuplicate, computePhotoHashFromBuffer, hammingDistance, PHASH_THRESHOLD } from './dedup';
import { sanitizeText } from './lib/sanitize-text';
import type { ScrapedAnimal } from './types';

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

    console.log(`🐾 Golden Years Club — ShelterLuv Sync${dryRun ? ' (DRY RUN)' : ''}${noCv ? ' (NO CV)' : ''}`);
    if (shelterArg) console.log(`   Shelter filter: ${shelterArg}`);

    // Step 1: Fetch from ShelterLuv API
    const { animals, shelters } = await scrapeShelterLuv({
        shelterIds: shelterArg ? [shelterArg] : undefined,
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

    // Init CV provider
    let cvProvider: AgeEstimationProvider | null = null;
    if (!noCv) {
        cvProvider = createAgeEstimationProvider();
        if (!cvProvider) {
            console.warn('⚠ CV disabled (no GEMINI_API_KEY). Proceeding without age estimation.');
        }
    }

    // Step 2: Upsert shelters
    let sheltersCreated = 0;
    for (const [slId, s] of shelters) {
        const embedUrl = `https://www.shelterluv.com/embed/${s.orgId}`;
        try {
            await (prisma as any).shelter.upsert({
                where: { id: slId },
                update: { lastScrapedAt: new Date(), state: s.state, websiteUrl: embedUrl },
                create: {
                    id: slId,
                    name: s.name,
                    county: s.city,
                    state: s.state,
                    websiteUrl: embedUrl,
                    totalIntakeAnnual: 0,
                    totalEuthanizedAnnual: 0,
                    dataYear: new Date().getFullYear(),
                    dataSourceName: 'ShelterLuv',
                    dataSourceUrl: 'https://www.shelterluv.com',
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
        const hashRecords = await (prisma as any).animal.findMany({
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

    async function processAnimal(animal: ScrapedAnimal): Promise<void> {
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
                ? await (prisma as any).animal.findUnique({ where: { id: match.animalId } })
                : null;

            if (match && match.tier > 1) { dedupMerged++; }

            let cvEstimate = null;
            const hasExistingCv = existing?.ageEstimatedLow != null;
            const photoUnchanged = existing?.photoUrl === animal.photoUrl;

            if (hasExistingCv && photoUnchanged) { cvSkipped++; }
            else if (cvProvider && animal.photoUrl) {
                try { cvEstimate = await cvProvider.estimateAge(animal.photoUrl, animal.photoUrls, { shelterSize: animal.size, shelterSpecies: animal.species, shelterAge: animal.ageKnownYears, shelterBreed: animal.breed, shelterNotes: animal.notes }); if (cvEstimate) cvProcessed++; } catch { /* skip */ }
            }

            if (cvEstimate && cvEstimate.confidence === 'NONE') { skippedNonPhoto++; return; }

            const lifeExp = cvEstimate?.detectedBreeds?.length
                ? lookupLifeExpectancy(cvEstimate.detectedBreeds, animal.species, animal.size) : null;

            const now = new Date();
            const data: Record<string, any> = {
                name: sanitizeText(animal.name), species: animal.species, breed: sanitizeText(animal.breed),
                sex: animal.sex, size: animal.size, photoUrl: animal.photoUrl,
                photoUrls: animal.photoUrls ?? [],
                photoHash, status: animal.status,
                ageKnownYears: animal.ageKnownYears != null ? Number(animal.ageKnownYears) : null,
                intakeReason: animal.intakeReason, intakeReasonDetail: sanitizeText(animal.intakeReasonDetail),
                euthScheduledAt: animal.euthScheduledAt, intakeDate: animal.intakeDate,
                notes: sanitizeText(animal.notes), lastSeenAt: now,
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
                });
            } else if (!hasExistingCv) {
                data.ageSource = animal.ageSource || 'SHELTER_REPORTED';
                data.ageConfidence = 'NONE';
            }

            let animalId: string;
            if (existing) {
                // Re-entry detection: animal was delisted but reappeared
                if (existing.status === 'DELISTED') {
                    data.shelterEntryCount = (existing.shelterEntryCount || 1) + 1;
                    console.log(`      🔄 Re-entry #${data.shelterEntryCount}: ${animal.name || animal.intakeId}`);
                }
                await (prisma as any).animal.update({
                    where: { id: existing.id }, data: {
                        ...data,
                        daysInShelter: existing.firstSeenAt
                            ? Math.floor((now.getTime() - new Date(existing.firstSeenAt).getTime()) / (1000 * 60 * 60 * 24)) : 0,
                    }
                });
                animalId = existing.id; updated++;
            } else {
                const record = await (prisma as any).animal.create({
                    data: { shelterId, intakeId: animal.intakeId, ...data, firstSeenAt: now, daysInShelter: 0 },
                });
                animalId = record.id; created++;
                if (photoHash) existingHashes.set(animalId, photoHash);
            }

            const cvDiff = (cvEstimate && existing)
                ? computeAssessmentDiff(existing, cvEstimate)
                : null;
            if (cvDiff?.hasChanges) {
                console.log(`      📊 CV diff: ${cvDiff.summary}`);
            }

            await (prisma as any).animalSnapshot.create({
                data: {
                    animalId, listingSource: `shelterluv:${shelterId}`,
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
                }
            });
        } catch (err) { errors++; console.error(`   ❌ ${animal.intakeId}: ${(err as Error).message?.substring(0, 100)}`); }
    }

    for (let i = 0; i < withPhotos.length; i += CONCURRENCY) {
        const batch = withPhotos.slice(i, i + CONCURRENCY);
        await Promise.allSettled(batch.map(a => processAnimal(a)));
        const processed = Math.min(i + CONCURRENCY, withPhotos.length);
        if (processed % 50 < CONCURRENCY || processed === withPhotos.length) {
            const elapsed = ((Date.now() - startTime) / 1000).toFixed(0);
            console.log(`   ... ${processed}/${withPhotos.length} (${created} new, ${updated} updated) — ${elapsed}s`);
        }
    }

    // Step 5: Reconciliation — delist stale animals per shelter (48h grace period)
    const graceCutoff = new Date(Date.now() - 48 * 60 * 60 * 1000);
    let totalDelisted = 0;
    for (const [slId] of shelters) {
        try {
            const delisted = await (prisma as any).animal.updateMany({
                where: {
                    shelterId: slId,
                    status: { in: ['AVAILABLE', 'URGENT'] },
                    lastSeenAt: { lt: graceCutoff },
                },
                data: {
                    status: 'DELISTED',
                    delistedAt: new Date(),
                },
            });
            if (delisted.count > 0) {
                console.log(`   🔄 Delisted ${delisted.count} animals not seen for 48+ hours from ${slId}`);
                totalDelisted += delisted.count;
            }
        } catch (err) {
            console.error(`   ⚠ Reconciliation failed for ${slId}: ${(err as Error).message?.substring(0, 80)}`);
        }
    }

    console.log(`\n🏁 Done in ${((Date.now() - startTime) / 1000).toFixed(0)}s!`);
    console.log(`   Animals: ${created} created, ${updated} updated, ${totalDelisted} delisted, ${errors} errors`);
    console.log(`   CV: ${cvProcessed} new, ${cvSkipped} reused | Dedup: ${dedupMerged} | Non-photo: ${skippedNonPhoto}`);
    console.log(`   Shelters: ${sheltersCreated}`);
    process.exit(0);
}

main();
