/**
 * Shelter Animals Count — Stats Enrichment Runner
 *
 * Enriches existing Shelter records with real intake/outcome statistics
 * from Shelter Animals Count (ASPCA). Unlike animal scraper runners,
 * this updates shelter-level data, not individual animal listings.
 *
 * Usage:
 *   npx tsx scraper/run-shelter-stats.ts              # full update
 *   npx tsx scraper/run-shelter-stats.ts --dry-run     # preview matches
 */

import 'dotenv/config';
import { createPrismaClient } from './lib/prisma';
import { SAC_SHELTER_STATS, fuzzyMatchShelterName } from './adapters/shelter-animals-count';



async function main() {
    const dryRun = process.argv.includes('--dry-run');

    console.log(`📊 Golden Years Club — Shelter Animals Count Stats Enrichment${dryRun ? ' (DRY RUN)' : ''}`);
    console.log(`   Source: Shelter Animals Count (ASPCA) 2025 Annual Report\n`);

    const prisma = await createPrismaClient();

    // Fetch all existing shelters from DB
    const shelters = await (prisma as any).shelter.findMany({
        select: {
            id: true,
            name: true,
            state: true,
            county: true,
            totalIntakeAnnual: true,
            totalEuthanizedAnnual: true,
            dataYear: true,
        },
    });

    console.log(`   ${shelters.length} shelters in database`);
    console.log(`   ${SAC_SHELTER_STATS.length} shelters in SAC dataset\n`);

    let matched = 0;
    let updated = 0;
    let unmatched = 0;

    for (const sacShelter of SAC_SHELTER_STATS) {
        // Find matching DB shelter by state + (city match OR name match)
        const match = shelters.find((db: any) => {
            if (db.state !== sacShelter.state) return false;

            // Check city match (county field often stores city)
            const dbCity = (db.county || '').toLowerCase().trim();
            const sacCity = (sacShelter.city || '').toLowerCase().trim();
            const cityMatch = sacCity && dbCity && (
                dbCity.includes(sacCity) || sacCity.includes(dbCity)
            );

            // Require BOTH city match and name similarity for high confidence
            if (cityMatch && fuzzyMatchShelterName(sacShelter.sacName, db.name)) {
                return true;
            }

            // Fall back to exact name match (after basic normalization)
            const normA = sacShelter.sacName.toLowerCase().replace(/[^a-z0-9\s]/g, '').trim();
            const normB = db.name.toLowerCase().replace(/[^a-z0-9\s]/g, '').trim();
            return normA === normB || normA.includes(normB) || normB.includes(normA);
        });

        if (match) {
            matched++;
            const liveReleaseRate = sacShelter.totalIntake > 0
                ? Math.round(((sacShelter.totalIntake - sacShelter.totalEuthanized) / sacShelter.totalIntake) * 100)
                : 0;

            if (dryRun) {
                console.log(`   ✅ MATCH: "${sacShelter.sacName}" → "${match.name}" (${match.id})`);
                console.log(`      Intake: ${sacShelter.totalIntake.toLocaleString()} | Euth: ${sacShelter.totalEuthanized.toLocaleString()} | LRR: ${liveReleaseRate}% | Year: ${sacShelter.dataYear}`);
                if (match.totalIntakeAnnual > 0 && match.dataYear && sacShelter.dataYear <= match.dataYear) {
                    console.log(`      ⚠ Skipping: DB has real stats from ${match.dataYear}`);
                }
            } else {
                // Only skip if DB has REAL stats (non-zero intake) from a newer year
                if (match.totalIntakeAnnual > 0 && match.dataYear && sacShelter.dataYear <= match.dataYear) {
                    console.log(`   ⏭ ${match.name}: DB has real stats from ${match.dataYear}, SAC has ${sacShelter.dataYear}`);
                    continue;
                }

                try {
                    await (prisma as any).shelter.update({
                        where: { id: match.id },
                        data: {
                            totalIntakeAnnual: sacShelter.totalIntake,
                            totalEuthanizedAnnual: sacShelter.totalEuthanized,
                            dataYear: sacShelter.dataYear,
                            dataSourceName: 'Shelter Animals Count (ASPCA)',
                            dataSourceUrl: 'https://shelteranimalscount.org',
                        },
                    });
                    updated++;
                    console.log(`   ✅ Updated: ${match.name} — Intake: ${sacShelter.totalIntake.toLocaleString()}, Euth: ${sacShelter.totalEuthanized.toLocaleString()}, LRR: ${liveReleaseRate}%`);
                } catch (err) {
                    console.error(`   ❌ Failed to update ${match.name}: ${(err as Error).message?.substring(0, 100)}`);
                }
            }
        } else {
            unmatched++;
            if (dryRun) {
                console.log(`   ❌ NO MATCH: "${sacShelter.sacName}" (${sacShelter.state}) — no matching shelter in DB`);
            }
        }
    }

    console.log(`\n🏁 Done!`);
    console.log(`   SAC shelters: ${SAC_SHELTER_STATS.length}`);
    console.log(`   Matched to DB: ${matched}`);
    console.log(`   Updated: ${dryRun ? '(dry run)' : updated}`);
    console.log(`   Unmatched: ${unmatched}`);

    if (unmatched > 0 && !dryRun) {
        console.log(`\n   💡 Unmatched shelters will match once those shelters are added via scraper runs.`);
    }

    process.exit(0);
}

main();
