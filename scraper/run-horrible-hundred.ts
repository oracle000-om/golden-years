/**
 * Run Horrible Hundred Import
 *
 * Reads curated JSON seed data from the Humane Society's
 * "Horrible Hundred" annual report and upserts into the
 * horrible_hundred_entries table.
 *
 * Usage:
 *   npx tsx scraper/run-horrible-hundred.ts              # full import
 *   npx tsx scraper/run-horrible-hundred.ts --dry-run    # preview only
 *   npx tsx scraper/run-horrible-hundred.ts --year=2023  # specific year
 */

import 'dotenv/config';
import { createPrismaClient } from './lib/prisma';
import { fetchHorribleHundred } from './adapters/horrible-hundred';

async function main() {
    const dryRun = process.argv.includes('--dry-run');
    const backfill = process.argv.includes('--backfill');
    const yearArg = process.argv.find(a => a.startsWith('--year='));
    const singleYear = yearArg ? parseInt(yearArg.split('=')[1], 10) : undefined;

    // Backfill: try every year from 2013 (first report) to current
    const BACKFILL_START = 2013;
    const currentYear = new Date().getFullYear();
    const years = backfill
        ? Array.from({ length: currentYear - BACKFILL_START + 1 }, (_, i) => BACKFILL_START + i)
        : [singleYear || currentYear];

    console.log(`🔴 Golden Years Club — Horrible Hundred${backfill ? ` (backfill ${BACKFILL_START}–${currentYear})` : ` ${years[0]}`}${dryRun ? ' (DRY RUN)' : ''}`);

    const prisma = await createPrismaClient();

    // ── Load seed data for all applicable years ──
    let allEntries: Awaited<ReturnType<typeof fetchHorribleHundred>> = [];
    for (const year of years) {
        const entries = await fetchHorribleHundred(year);
        if (entries.length > 0) {
            console.log(`   📅 ${year}: ${entries.length} entries`);
            allEntries.push(...entries);
        }
    }
    const entries = allEntries;

    if (entries.length === 0) {
        console.log(`\n⚠️  No entries found. Create data/horrible-hundred-<year>.json to populate.`);
        await prisma.$disconnect();
        return;
    }

    if (dryRun) {
        const byState: Record<string, number> = {};
        for (const e of entries) {
            byState[e.state] = (byState[e.state] || 0) + 1;
        }
        const repeatOffenders = entries.filter(e => e.yearsOnList > 1);

        console.log(`\n📊 Summary:`);
        console.log(`   Total entries: ${entries.length}`);
        console.log(`   Repeat offenders (>1 year): ${repeatOffenders.length}`);
        console.log(`   With USDA license: ${entries.filter(e => e.certNumber).length}`);
        console.log(`   States: ${Object.keys(byState).length}`);
        console.log(`\n   By state:`);
        for (const [state, count] of Object.entries(byState).sort((a, b) => b[1] - a[1])) {
            console.log(`      ${state}: ${count}`);
        }

        console.log(`\n   Sample entries:`);
        for (const e of entries.slice(0, 5)) {
            console.log(`      ${e.facilityName} (${e.state}) — ${e.yearsOnList}yr on list, ${e.violationTypes.length} violation types`);
        }

        await prisma.$disconnect();
        return;
    }

    // ── Upsert into DB ──
    console.log(`\n💾 Upserting ${entries.length} Horrible Hundred entries...`);

    let created = 0;
    let errors = 0;

    for (const entry of entries) {
        try {
            await prisma.horribleHundredEntry.upsert({
                where: {
                    facilityName_state_reportYear: {
                        facilityName: entry.facilityName,
                        state: entry.state,
                        reportYear: entry.reportYear,
                    },
                },
                update: {
                    certNumber: entry.certNumber,
                    city: entry.city,
                    yearsOnList: entry.yearsOnList,
                    narrative: entry.narrative,
                    violationTypes: entry.violationTypes,
                    lastScrapedAt: new Date(),
                },
                create: {
                    certNumber: entry.certNumber,
                    facilityName: entry.facilityName,
                    state: entry.state,
                    city: entry.city,
                    reportYear: entry.reportYear,
                    yearsOnList: entry.yearsOnList,
                    narrative: entry.narrative,
                    violationTypes: entry.violationTypes,
                },
            });

            created++;
        } catch (err: any) {
            errors++;
            if (errors <= 5) {
                console.log(`   ❌ Error: ${entry.facilityName} (${entry.state}): ${err.message?.substring(0, 100)}`);
            }
        }
    }

    console.log(`\n🏁 Horrible Hundred import complete`);
    console.log(`   ✅ ${created} entries upserted`);
    console.log(`   ❌ ${errors} errors`);

    await prisma.$disconnect();
}

main().catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
});
