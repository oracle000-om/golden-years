/**
 * Run openFDA — Drug Adverse Event Enrichment
 *
 * Queries the openFDA Animal Drug Adverse Events API for each breed
 * in the BreedProfile table and stores:
 *   - Top adverse reactions (VeDDRA coded)
 *   - Top drugs involved in adverse events
 *   - Total event count
 *
 * API: https://api.fda.gov/animalandveterinary/event.json
 * No auth required. 1.32M+ records, 1987–2026.
 *
 * Usage:
 *   npx tsx scraper/run-openfda.ts              # full run
 *   npx tsx scraper/run-openfda.ts --dry-run     # preview only
 *   npx tsx scraper/run-openfda.ts --breed "Golden Retriever"  # single breed
 *   npx tsx scraper/run-openfda.ts --limit 10    # first N breeds
 */

import 'dotenv/config';
import { createPrismaClient } from './lib/prisma';
import { fetchFdaBreedData, mapBreedToFda } from './adapters/openfda';

// ── CLI Args ──

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');

function getArgValue(flag: string): string | null {
    const idx = args.indexOf(flag);
    return idx >= 0 && idx + 1 < args.length ? args[idx + 1] : null;
}

const breedFilter = getArgValue('--breed');
const limitStr = getArgValue('--limit');
const limit = limitStr ? parseInt(limitStr, 10) : undefined;

// ── Main ──

async function main() {
    console.log(`💊 Golden Years Club — openFDA Drug Adverse Event Enrichment${dryRun ? ' (DRY RUN)' : ''}`);
    console.log(`   Source: api.fda.gov/animalandveterinary/event.json`);
    console.log(`   Data: 1.32M+ adverse event reports (1987–2026)\n`);

    const prisma = await createPrismaClient();

    // ── Load breeds ──
    const where: Record<string, any> = {};
    if (breedFilter) {
        where.name = { contains: breedFilter, mode: 'insensitive' };
    }

    let breeds = await prisma.breedProfile.findMany({
        where,
        select: {
            id: true,
            name: true,
            species: true,
            fdaEventCount: true,
            fdaLastEnriched: true,
        },
        orderBy: { name: 'asc' },
    });

    if (limit) breeds = breeds.slice(0, limit);

    console.log(`   📋 ${breeds.length} breeds to process${breedFilter ? ` (filter: "${breedFilter}")` : ''}\n`);

    let enriched = 0;
    let skipped = 0;
    let noData = 0;
    let errors = 0;

    for (let i = 0; i < breeds.length; i++) {
        const breed = breeds[i];
        const fdaTerm = mapBreedToFda(breed.name);
        const progress = `[${i + 1}/${breeds.length}]`;

        if (!fdaTerm) {
            console.log(`   ${progress} ⚪ ${breed.name} — no FDA mapping`);
            skipped++;
            continue;
        }

        // Skip if already enriched within last 30 days
        if (breed.fdaLastEnriched && !breedFilter) {
            const daysSince = (Date.now() - new Date(breed.fdaLastEnriched).getTime()) / (1000 * 60 * 60 * 24);
            if (daysSince < 30) {
                skipped++;
                continue;
            }
        }

        try {
            const data = await fetchFdaBreedData(breed.name, breed.species);

            if (!data) {
                console.log(`   ${progress} ⚪ ${breed.name} — <10 events in FDA (skipped)`);
                noData++;
                continue;
            }

            if (dryRun) {
                console.log(`   ${progress} 🔍 ${breed.name} (${breed.species})`);
                console.log(`      FDA term: "${data.fdaBreedTerm}" | Events: ${data.eventCount.toLocaleString()}`);
                if (data.topReactions.length > 0) {
                    console.log(`      Top reactions: ${data.topReactions.slice(0, 5).map(r => `${r.reaction} (${r.count})`).join(', ')}`);
                }
                if (data.topDrugs.length > 0) {
                    console.log(`      Top drugs: ${data.topDrugs.slice(0, 5).map(d => `${d.drug} (${d.count})`).join(', ')}`);
                }
                enriched++;
                continue;
            }

            await prisma.breedProfile.update({
                where: { id: breed.id },
                data: {
                    fdaAdverseReactions: data.topReactions as any,
                    fdaDrugWarnings: data.topDrugs as any,
                    fdaEventCount: data.eventCount,
                    fdaLastEnriched: new Date(),
                },
            });

            console.log(`   ${progress} ✅ ${breed.name} — ${data.eventCount.toLocaleString()} events, ${data.topReactions.length} reactions, ${data.topDrugs.length} drugs`);
            enriched++;
        } catch (err) {
            console.error(`   ${progress} ❌ ${breed.name}: ${(err as Error).message?.substring(0, 80)}`);
            errors++;
        }
    }

    console.log(`\n🏁 openFDA enrichment complete`);
    console.log(`   ✅ ${enriched} breeds enriched with FDA adverse event data`);
    console.log(`   ⚪ ${skipped} breeds skipped (no FDA mapping or recently enriched)`);
    console.log(`   ⚫ ${noData} breeds with insufficient FDA data (<10 events)`);
    if (errors > 0) console.log(`   ❌ ${errors} errors`);

    await prisma.$disconnect();
}

main().catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
});
