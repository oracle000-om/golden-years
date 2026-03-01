/**
 * Run Breed DB — Populate breed health profiles
 *
 * Fetches breed data from TheDogAPI + TheCatAPI, parses life
 * expectancy, and upserts to the breed_profiles table.
 *
 * Intended to run monthly or as-needed.
 *
 * Usage:
 *   npx tsx scraper/run-breed-db.ts              # full run
 *   npx tsx scraper/run-breed-db.ts --dry-run     # preview only
 */

import 'dotenv/config';
import { createPrismaClient } from './lib/prisma';
import { fetchAllBreeds } from './adapters/breed-db';



async function main() {
    const dryRun = process.argv.includes('--dry-run');

    console.log(`🧬 Golden Years Club — Breed Health Database${dryRun ? ' (DRY RUN)' : ''}`);
    console.log('   Sources: TheDogAPI + TheCatAPI\n');

    // ── Step 1: Fetch all breeds ──
    const breeds = await fetchAllBreeds();

    const dogs = breeds.filter(b => b.species === 'DOG');
    const cats = breeds.filter(b => b.species === 'CAT');

    console.log(`\n📊 Total: ${breeds.length} breeds (${dogs.length} dogs, ${cats.length} cats)`);

    // ── Show stats ──
    const withLifeExp = breeds.filter(b => b.lifeExpectancyLow != null && b.lifeExpectancyHigh != null);
    console.log(`   With life expectancy data: ${withLifeExp.length}/${breeds.length}`);

    const withHealthScore = breeds.filter(b => b.healthRiskScore != null);
    console.log(`   With health risk score: ${withHealthScore.length}/${breeds.length}`);

    if (dryRun) {
        console.log(`\n--- Dog Breeds (first 30) ---`);
        for (const b of dogs.slice(0, 30)) {
            const lifeExp = b.lifeExpectancyLow && b.lifeExpectancyHigh
                ? `${b.lifeExpectancyLow}-${b.lifeExpectancyHigh}y`
                : '??';
            const senior = b.seniorAgeThreshold ? `senior@${b.seniorAgeThreshold}y` : '';
            const group = b.breedGroup ? ` [${b.breedGroup}]` : '';
            console.log(`   🐕 ${b.name}${group} | ${lifeExp} | ${senior}`);
        }

        console.log(`\n--- Cat Breeds (first 30) ---`);
        for (const b of cats.slice(0, 30)) {
            const lifeExp = b.lifeExpectancyLow && b.lifeExpectancyHigh
                ? `${b.lifeExpectancyLow}-${b.lifeExpectancyHigh}y`
                : '??';
            const senior = b.seniorAgeThreshold ? `senior@${b.seniorAgeThreshold}y` : '';
            const health = b.healthRiskScore ? ` health:${b.healthRiskScore}/5` : '';
            console.log(`   🐱 ${b.name} | ${lifeExp} | ${senior}${health}`);
        }

        console.log(`\n✅ Dry run complete. ${breeds.length} breeds would be upserted.`);
        process.exit(0);
    }

    // ── Step 2: Upsert to DB ──
    const prisma = await createPrismaClient();

    let upserted = 0;
    let errors = 0;

    for (const breed of breeds) {
        try {
            await prisma.breedProfile.upsert({
                where: {
                    name_species: {
                        name: breed.name,
                        species: breed.species,
                    },
                },
                update: {
                    breedGroup: breed.breedGroup,
                    lifeExpectancyLow: breed.lifeExpectancyLow,
                    lifeExpectancyHigh: breed.lifeExpectancyHigh,
                    temperament: breed.temperament,
                    healthRiskScore: breed.healthRiskScore,
                    commonConditions: breed.commonConditions,
                    seniorAgeThreshold: breed.seniorAgeThreshold,
                    careNotes: breed.careNotes,
                    sourceApi: breed.sourceApi,
                    lastFetchedAt: new Date(),
                },
                create: {
                    name: breed.name,
                    species: breed.species,
                    breedGroup: breed.breedGroup,
                    lifeExpectancyLow: breed.lifeExpectancyLow,
                    lifeExpectancyHigh: breed.lifeExpectancyHigh,
                    temperament: breed.temperament,
                    healthRiskScore: breed.healthRiskScore,
                    commonConditions: breed.commonConditions,
                    seniorAgeThreshold: breed.seniorAgeThreshold,
                    careNotes: breed.careNotes,
                    sourceApi: breed.sourceApi,
                },
            });
            upserted++;
        } catch (err) {
            console.error(`   ❌ ${breed.name} (${breed.species}): ${(err as Error).message?.substring(0, 80)}`);
            errors++;
        }
    }

    console.log(`\n🏁 Done!`);
    console.log(`   Upserted: ${upserted} breed profiles`);
    if (errors > 0) console.log(`   Errors: ${errors}`);
    process.exit(0);
}

main();
