/**
 * Run Housing Pressure Analysis
 *
 * Fetches HUD Fair Market Rent data and computes rent YoY changes
 * by county to correlate with shelter intake trends.
 *
 * Usage:
 *   npx tsx scraper/run-housing-pressure.ts              # full import
 *   npx tsx scraper/run-housing-pressure.ts --dry-run    # preview only
 *   npx tsx scraper/run-housing-pressure.ts --year=2024  # specific year
 */

import 'dotenv/config';
import { createPrismaClient } from './lib/prisma';
import { fetchHousingPressure } from './adapters/housing-pressure';

async function main() {
    const dryRun = process.argv.includes('--dry-run');
    const yearArg = process.argv.find(a => a.startsWith('--year='));
    const year = yearArg ? parseInt(yearArg.split('=')[1], 10) : undefined;

    console.log(`🏠 Golden Years Club — Housing Pressure Analysis${year ? ` (${year})` : ''}${dryRun ? ' (DRY RUN)' : ''}`);

    const prisma = await createPrismaClient();
    const records = await fetchHousingPressure(year);

    if (records.length === 0) {
        console.log(`\n⚠️  No housing data fetched. HUD API may require registration.`);
        await prisma.$disconnect();
        return;
    }

    if (dryRun) {
        const states = [...new Set(records.map(r => r.state))];
        const avgRent = Math.round(records.filter(r => r.medianRent).reduce((s, r) => s + (r.medianRent || 0), 0) / records.filter(r => r.medianRent).length);
        const increasing = records.filter(r => r.rentChangeYoY !== null && r.rentChangeYoY > 0).length;

        console.log(`\n📊 Summary:`);
        console.log(`   Counties tracked: ${records.length}`);
        console.log(`   States: ${states.length}`);
        console.log(`   Avg 2BR FMR: $${avgRent}/mo`);
        console.log(`   Counties with rent increases: ${increasing} (${Math.round(increasing / records.length * 100)}%)`);

        await prisma.$disconnect();
        return;
    }

    console.log(`\n💾 Upserting ${records.length} housing pressure records...`);
    let created = 0, errors = 0;

    for (const r of records) {
        try {
            await prisma.housingPressure.upsert({
                where: { county_state_year: { county: r.county, state: r.state, year: r.year } },
                update: { medianRent: r.medianRent, rentChangeYoY: r.rentChangeYoY, evictionRate: r.evictionRate, shelterIntakeChange: r.shelterIntakeChange, correlationScore: r.correlationScore, lastScrapedAt: new Date() },
                create: { county: r.county, state: r.state, year: r.year, medianRent: r.medianRent, rentChangeYoY: r.rentChangeYoY, evictionRate: r.evictionRate, shelterIntakeChange: r.shelterIntakeChange, correlationScore: r.correlationScore },
            });
            created++;
        } catch (err: any) {
            errors++;
            if (errors <= 3) console.log(`   ❌ ${r.county}, ${r.state}: ${err.message?.substring(0, 80)}`);
        }
    }

    console.log(`\n🏁 Housing pressure import complete — ${created} upserted, ${errors} errors`);
    await prisma.$disconnect();
}

main().catch(err => { console.error('Fatal:', err); process.exit(1); });
