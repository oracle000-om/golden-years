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
import { PrismaClient } from '../src/generated/prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import pg from 'pg';
import { shelterConfigs } from './shelters';
import { createAgeEstimationProvider, lookupLifeExpectancy, type AgeEstimationProvider } from './cv';

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
        prisma = await createPrisma();
    }

    console.log(`🐾 Golden Years Club — Scraper${dryRun ? ' (DRY RUN)' : ''}${noCv ? ' (NO CV)' : ''}`);
    console.log(`   Shelters: ${shelters.map(s => s.id).join(', ')}\n`);

    let grandTotalCreated = 0;
    let grandTotalUpdated = 0;
    let grandTotalCvProcessed = 0;

    for (const shelter of shelters) {
        console.log(`🏠 ${shelter.name}`);

        // Step 1: Scrape
        let animals;
        try {
            animals = await shelter.adapter();
        } catch (error) {
            console.error(`   ❌ Scrape failed: ${(error as Error).message}`);
            continue;
        }

        // Filter: photo required
        const withPhotos = animals.filter(a => a.photoUrl);
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
                lastScrapedAt: new Date(),
            },
            create: {
                id: shelter.id,
                name: shelter.name,
                county: shelter.county,
                state: shelter.state,
                address: shelter.address,
                phone: shelter.phone,
                websiteUrl: shelter.websiteUrl,
                totalIntakeAnnual: shelter.totalIntakeAnnual,
                totalEuthanizedAnnual: shelter.totalEuthanizedAnnual,
                dataYear: shelter.dataYear,
                dataSourceName: shelter.dataSourceName,
                dataSourceUrl: shelter.dataSourceUrl,
            },
        });

        let created = 0;
        let updated = 0;
        let cvProcessed = 0;

        for (const animal of withPhotos) {
            // Step 3: CV age estimation
            let cvEstimate = null;
            if (cvProvider && animal.photoUrl) {
                try {
                    console.log(`   🔬 CV: ${animal.name || animal.intakeId}...`);
                    cvEstimate = await cvProvider.estimateAge(animal.photoUrl);
                    if (cvEstimate) {
                        cvProcessed++;
                        const breeds = cvEstimate.detectedBreeds.length > 0
                            ? cvEstimate.detectedBreeds.join(' / ')
                            : 'unknown breed';
                        console.log(`      → ${cvEstimate.estimatedAgeLow}–${cvEstimate.estimatedAgeHigh}yr (${cvEstimate.confidence}) | ${breeds} [${cvEstimate.indicators.join(', ')}]`);
                    }
                } catch (err) {
                    console.log(`      ⚠ CV error: ${(err as Error).message}`);
                }

                // Rate limit: 250ms between CV calls
                await new Promise(r => setTimeout(r, 250));
            }

            // Life expectancy lookup from breed data
            const lifeExp = cvEstimate?.detectedBreeds?.length
                ? lookupLifeExpectancy(cvEstimate.detectedBreeds, animal.species)
                : null;

            // Step 4: Upsert animal
            try {
                const existing = await prisma.animal.findFirst({
                    where: { shelterId: shelter.id, intakeId: animal.intakeId },
                });

                const data = {
                    name: animal.name,
                    species: animal.species,
                    breed: animal.breed,
                    sex: animal.sex,
                    size: animal.size,
                    photoUrl: animal.photoUrl,
                    status: animal.status,
                    ageKnownYears: animal.ageKnownYears != null ? Number(animal.ageKnownYears) : null,
                    ageSource: cvEstimate ? 'CV_ESTIMATED' as const : (animal.ageSource || 'SHELTER_REPORTED' as const),
                    ageEstimatedLow: cvEstimate?.estimatedAgeLow ?? null,
                    ageEstimatedHigh: cvEstimate?.estimatedAgeHigh ?? null,
                    ageConfidence: cvEstimate?.confidence ?? 'NONE' as const,
                    ageIndicators: cvEstimate?.indicators ?? [],
                    detectedBreeds: cvEstimate?.detectedBreeds ?? [],
                    breedConfidence: cvEstimate?.detectedBreeds?.length ? cvEstimate.confidence : 'NONE' as const,
                    lifeExpectancyLow: lifeExp?.low ?? null,
                    lifeExpectancyHigh: lifeExp?.high ?? null,
                    intakeReason: animal.intakeReason,
                    intakeReasonDetail: animal.intakeReasonDetail,
                    euthScheduledAt: animal.euthScheduledAt,
                    intakeDate: animal.intakeDate,
                    notes: animal.notes,
                };

                if (existing) {
                    await prisma.animal.update({
                        where: { id: existing.id },
                        data,
                    });
                    updated++;
                } else {
                    await prisma.animal.create({
                        data: {
                            shelterId: shelter.id,
                            intakeId: animal.intakeId,
                            ...data,
                        },
                    });
                    created++;
                }
            } catch (err) {
                console.error(`      ❌ DB error for ${animal.intakeId}: ${(err as Error).message?.substring(0, 120)}`);
            }
        }

        grandTotalCreated += created;
        grandTotalUpdated += updated;
        grandTotalCvProcessed += cvProcessed;

        console.log(`   ✅ Created: ${created}, Updated: ${updated}, CV: ${cvProcessed}/${withPhotos.length}\n`);
    }

    console.log(`🏁 Done. Total: ${grandTotalCreated} created, ${grandTotalUpdated} updated, ${grandTotalCvProcessed} CV estimates.`);
    process.exit(0);
}

main();
