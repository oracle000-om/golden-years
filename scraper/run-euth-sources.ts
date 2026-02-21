/**
 * Run Euthanasia-Source Scrapers
 *
 * Separate from the RescueGroups bulk sync. This script fetches
 * animals from shelters that publish actual euthanasia lists with
 * real dates — the heart of the Golden Years Club mission.
 *
 * These animals get euthScheduledAt populated, which activates:
 *   - < 24h / < 48h / < 72h urgency badges
 *   - Timeframe filter (when re-enabled)
 *   - Priority sort ordering
 *
 * Usage:
 *   npx tsx scraper/run-euth-sources.ts              # full run
 *   npx tsx scraper/run-euth-sources.ts --dry-run     # preview only
 *   npx tsx scraper/run-euth-sources.ts --no-cv       # skip CV
 *
 * Run this on a cron schedule (e.g., every 6 hours) to keep
 * euthanasia dates current.
 */

import 'dotenv/config';
import { PrismaClient } from '../src/generated/prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import pg from 'pg';
import { scrapeMemphisEuthList } from './adapters/memphis';
import { createAgeEstimationProvider, lookupLifeExpectancy, type AgeEstimationProvider } from './cv';
import type { ScrapedAnimal } from './types';

// ── Shelter metadata for euthanasia-source shelters ──
// These are shelters we scrape directly for kill list data.
const EUTH_SHELTERS: Record<string, {
    name: string;
    county: string;
    state: string;
    phone: string | null;
    websiteUrl: string | null;
    totalIntakeAnnual: number;
    totalEuthanizedAnnual: number;
    dataYear: number;
    dataSourceName: string;
    dataSourceUrl: string;
}> = {
    'memphis-animal-services': {
        name: 'Memphis Animal Services',
        county: 'Shelby',
        state: 'TN',
        phone: '(901) 636-1416',
        websiteUrl: 'https://www.memphisanimalservices.com',
        totalIntakeAnnual: 15200,
        totalEuthanizedAnnual: 4560,
        dataYear: 2024,
        dataSourceName: 'Memphis Animal Services',
        dataSourceUrl: 'https://www.memphisanimalservices.com',
    },
};

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

    console.log(`🔴 Golden Years Club — Euthanasia Source Sync${dryRun ? ' (DRY RUN)' : ''}${noCv ? ' (NO CV)' : ''}`);
    console.log('   These are animals on REAL euthanasia lists with actual dates.\n');

    // ── Step 1: Scrape all euthanasia sources ──
    const allAnimals: ScrapedAnimal[] = [];

    // Memphis
    try {
        const memphis = await scrapeMemphisEuthList();
        allAnimals.push(...memphis);
        console.log(`   ✅ Memphis: ${memphis.length} animals on today's list`);
    } catch (err) {
        console.error(`   ❌ Memphis: ${(err as Error).message}`);
    }

    // (Add more sources here as adapters are built)
    // try {
    //     const maricopa = await scrapeMaricopaPriorityPlacement();
    //     allAnimals.push(...maricopa);
    // } catch (err) { ... }

    console.log(`\n📊 Total: ${allAnimals.length} animals on euthanasia lists`);

    // Filter: photo required
    const withPhotos = allAnimals.filter(a => a.photoUrl);
    console.log(`   ${withPhotos.length} with photos`);

    if (dryRun) {
        console.log(`\n--- Preview ---`);
        for (const a of withPhotos.slice(0, 20)) {
            const dateStr = a.euthScheduledAt
                ? a.euthScheduledAt.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
                : 'TBD';
            console.log(`   🔴 ${a.intakeId} | ${a.name || 'Unnamed'} | ${a.species} | ${a.breed} | Euth: ${dateStr} | ${a._shelterName}`);
        }
        console.log(`\n✅ Dry run complete.`);
        process.exit(0);
    }

    // ── Step 2: Init DB ──
    const prisma = await createPrisma();

    // Init CV provider
    let cvProvider: AgeEstimationProvider | null = null;
    if (!noCv) {
        cvProvider = createAgeEstimationProvider();
        if (!cvProvider) {
            console.warn('⚠ CV disabled (no GEMINI_API_KEY).');
        }
    }

    // ── Step 3: Upsert shelters ──
    for (const [shelterId, config] of Object.entries(EUTH_SHELTERS)) {
        try {
            await (prisma as any).shelter.upsert({
                where: { id: shelterId },
                update: { lastScrapedAt: new Date() },
                create: {
                    id: shelterId,
                    name: config.name,
                    county: config.county,
                    state: config.state,
                    phone: config.phone,
                    websiteUrl: config.websiteUrl,
                    totalIntakeAnnual: config.totalIntakeAnnual,
                    totalEuthanizedAnnual: config.totalEuthanizedAnnual,
                    dataYear: config.dataYear,
                    dataSourceName: config.dataSourceName,
                    dataSourceUrl: config.dataSourceUrl,
                },
            });
        } catch (err) {
            console.error(`   ❌ Shelter upsert failed for ${config.name}: ${(err as Error).message?.substring(0, 100)}`);
        }
    }

    // ── Step 4: Upsert animals ──
    let created = 0;
    let updated = 0;
    let cvProcessed = 0;

    for (let i = 0; i < withPhotos.length; i++) {
        const animal = withPhotos[i];
        const shelterId = animal._shelterId || 'unknown';

        // CV age estimation
        let cvEstimate = null;
        if (cvProvider && animal.photoUrl) {
            try {
                cvEstimate = await cvProvider.estimateAge(animal.photoUrl);
                if (cvEstimate) cvProcessed++;
            } catch {
                // Silently skip CV errors
            }
            await new Promise(r => setTimeout(r, 250));
        }

        // Life expectancy
        const lifeExp = cvEstimate?.detectedBreeds?.length
            ? lookupLifeExpectancy(cvEstimate.detectedBreeds, animal.species)
            : null;

        try {
            const existing = await (prisma as any).animal.findFirst({
                where: { shelterId, intakeId: animal.intakeId },
            });

            const data = {
                name: animal.name,
                species: animal.species,
                breed: animal.breed,
                sex: animal.sex,
                size: animal.size,
                photoUrl: animal.photoUrl,
                status: 'URGENT',
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
                intakeReason: animal.intakeReason,
                intakeReasonDetail: animal.intakeReasonDetail,
                euthScheduledAt: animal.euthScheduledAt,
                intakeDate: animal.intakeDate,
                notes: animal.notes,
            };

            if (existing) {
                await (prisma as any).animal.update({ where: { id: existing.id }, data });
                updated++;
            } else {
                await (prisma as any).animal.create({
                    data: { shelterId, intakeId: animal.intakeId, ...data },
                });
                created++;
            }
        } catch (err) {
            console.error(`   ❌ ${animal.intakeId}: ${(err as Error).message?.substring(0, 100)}`);
        }
    }

    console.log(`\n🏁 Done!`);
    console.log(`   Animals on kill lists: ${created} created, ${updated} updated`);
    console.log(`   CV estimates: ${cvProcessed}/${withPhotos.length}`);
    console.log(`   These animals now have euthScheduledAt set → urgency badges active`);
    process.exit(0);
}

main();
