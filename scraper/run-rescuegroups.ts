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
import { PrismaClient } from '../src/generated/prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import pg from 'pg';
import { scrapeRescueGroups } from './adapters/rescuegroups';
import { createAgeEstimationProvider, lookupLifeExpectancy, type AgeEstimationProvider } from './cv';
import { findDuplicate, computePhotoHash } from './dedup';

async function createPrisma() {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error('DATABASE_URL required. Set it in .env');
    const pool = new pg.Pool({ connectionString: url });
    const adapter = new PrismaPg(pool);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return new (PrismaClient as any)({ adapter }) as PrismaClient;
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
    const withPhotos = animals.filter(a => a.photoUrl);
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
    const prisma = await createPrisma();

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
        // Already a 2-letter code?
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
                update: { lastScrapedAt: new Date(), state: stateNormalized },
                create: {
                    id: dbId,
                    name: s.name,
                    county: s.city, // RescueGroups doesn't provide county, use city
                    state: stateNormalized,
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

    // Step 3: Upsert animals
    let created = 0;
    let updated = 0;
    let cvProcessed = 0;
    let skippedNonPhoto = 0;
    let dedupMerged = 0;

    for (let i = 0; i < withPhotos.length; i++) {
        const animal = withPhotos[i];
        const shelterId = animal._shelterId || 'unknown';

        // CV age estimation
        let cvEstimate = null;
        if (cvProvider && animal.photoUrl) {
            try {
                cvEstimate = await cvProvider.estimateAge(animal.photoUrl);
                if (cvEstimate) cvProcessed++;
            } catch (err) {
                // Silently skip CV errors
            }
            await new Promise(r => setTimeout(r, 250));
        }

        // Skip non-photo images (drawings, sketches, illustrations)
        if (cvEstimate && cvEstimate.confidence === 'NONE') {
            skippedNonPhoto++;
            continue;
        }

        // Life expectancy
        const lifeExp = cvEstimate?.detectedBreeds?.length
            ? lookupLifeExpectancy(cvEstimate.detectedBreeds, animal.species)
            : null;

        // Compute photo hash for dedup
        let photoHash: string | null = null;
        if (animal.photoUrl) {
            try {
                photoHash = await computePhotoHash(animal.photoUrl);
            } catch {
                // Non-fatal
            }
        }

        try {
            const match = await findDuplicate(prisma, animal.intakeId, shelterId, animal.photoUrl, photoHash);
            const existing = match
                ? await (prisma as any).animal.findUnique({ where: { id: match.animalId } })
                : null;

            if (match && match.tier > 1) {
                console.log(`   🔗 Dedup T${match.tier}: ${animal.intakeId} → ${match.reason}`);
                dedupMerged++;
            }

            const now = new Date();
            const data = {
                name: animal.name,
                species: animal.species,
                breed: animal.breed,
                sex: animal.sex,
                size: animal.size,
                photoUrl: animal.photoUrl,
                photoHash,
                status: animal.status,
                ageKnownYears: animal.ageKnownYears != null ? Number(animal.ageKnownYears) : null,
                ageSource: cvEstimate ? 'CV_ESTIMATED' : (animal.ageSource || 'SHELTER_REPORTED'),
                ageEstimatedLow: cvEstimate?.estimatedAgeLow ?? null,
                ageEstimatedHigh: cvEstimate?.estimatedAgeHigh ?? null,
                ageConfidence: cvEstimate?.confidence ?? 'NONE',
                ageIndicators: cvEstimate?.indicators ?? [],
                detectedBreeds: cvEstimate?.detectedBreeds ?? [],
                breedConfidence: cvEstimate?.detectedBreeds?.length ? cvEstimate.confidence : 'NONE',
                lifeExpectancyLow: lifeExp?.low ?? null,
                lifeExpectancyHigh: lifeExp?.high ?? null,
                // v2: health assessment
                bodyConditionScore: cvEstimate?.bodyConditionScore ?? null,
                coatCondition: cvEstimate?.coatCondition ?? null,
                visibleConditions: cvEstimate?.visibleConditions ?? [],
                healthNotes: cvEstimate?.healthNotes ?? null,
                // v2: behavioral signals
                aggressionRisk: cvEstimate?.aggressionRisk ?? null,
                fearIndicators: cvEstimate?.fearIndicators ?? [],
                stressLevel: cvEstimate?.stressLevel ?? null,
                behaviorNotes: cvEstimate?.behaviorNotes ?? null,
                // v2: photo quality
                photoQuality: cvEstimate?.photoQuality ?? null,
                // v2: care guidance
                likelyCareNeeds: cvEstimate?.likelyCareNeeds ?? [],
                estimatedCareLevel: cvEstimate?.estimatedCareLevel ?? null,
                intakeReason: animal.intakeReason,
                intakeReasonDetail: animal.intakeReasonDetail,
                euthScheduledAt: animal.euthScheduledAt,
                intakeDate: animal.intakeDate,
                notes: animal.notes,
                // v2: temporal tracking
                lastSeenAt: now,
            };

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
            }

            // v2: Create temporal snapshot
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
                    rawAssessment: cvEstimate ? JSON.parse(JSON.stringify(cvEstimate)) : null,
                },
            });
        } catch (err) {
            console.error(`   ❌ ${animal.intakeId}: ${(err as Error).message?.substring(0, 100)}`);
        }

        // Progress every 50
        if ((i + 1) % 50 === 0) {
            console.log(`   ... ${i + 1}/${withPhotos.length} processed (${created} new, ${updated} updated)`);
        }
    }

    console.log(`\n🏁 Done!`);
    console.log(`   Animals: ${created} created, ${updated} updated`);
    console.log(`   CV estimates: ${cvProcessed}/${withPhotos.length}`);
    console.log(`   Cross-source dedup merges: ${dedupMerged}`);
    console.log(`   Non-photo images skipped: ${skippedNonPhoto}`);
    console.log(`   Shelters: ${sheltersCreated}`);
    process.exit(0);
}

main();
