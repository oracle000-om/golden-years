/**
 * Run Confiscation Event Tracking
 *
 * Loads confiscation/cruelty case data from ALDF + seed files
 * and upserts into the confiscation_events table.
 *
 * Usage:
 *   npx tsx scraper/run-confiscation.ts              # full import
 *   npx tsx scraper/run-confiscation.ts --dry-run    # preview only
 */

import 'dotenv/config';
import { createPrismaClient } from './lib/prisma';
import { fetchConfiscationEvents } from './adapters/confiscation-events';

async function main() {
    const dryRun = process.argv.includes('--dry-run');
    console.log(`⚖️  Golden Years Club — Confiscation Event Tracking${dryRun ? ' (DRY RUN)' : ''}`);

    const prisma = await createPrismaClient();
    const events = await fetchConfiscationEvents();

    if (events.length === 0) {
        console.log(`\n⚠️  No confiscation events found. Create data/confiscation-events.json for seed data.`);
        await prisma.$disconnect();
        return;
    }

    if (dryRun) {
        const byType: Record<string, number> = {};
        const byState: Record<string, number> = {};
        let totalAnimals = 0;
        for (const e of events) {
            if (e.chargeType) byType[e.chargeType] = (byType[e.chargeType] || 0) + 1;
            byState[e.state] = (byState[e.state] || 0) + 1;
            totalAnimals += e.animalCount;
        }

        console.log(`\n📊 Summary:`);
        console.log(`   Events: ${events.length}`);
        console.log(`   Total animals seized: ${totalAnimals.toLocaleString()}`);
        console.log(`\n   By charge type:`);
        Object.entries(byType).sort((a, b) => b[1] - a[1]).forEach(([t, n]) => console.log(`      ${t}: ${n}`));
        console.log(`\n   By state:`);
        Object.entries(byState).sort((a, b) => b[1] - a[1]).slice(0, 10).forEach(([s, n]) => console.log(`      ${s}: ${n}`));

        await prisma.$disconnect();
        return;
    }

    console.log(`\n💾 Upserting ${events.length} confiscation events...`);
    let created = 0, errors = 0;

    for (const e of events) {
        try {
            await prisma.confiscationEvent.create({
                data: {
                    state: e.state,
                    county: e.county,
                    date: e.date,
                    animalCount: e.animalCount,
                    species: e.species,
                    chargeType: e.chargeType,
                    narrative: e.narrative,
                    sourceUrl: e.sourceUrl,
                },
            });
            created++;
        } catch (err: any) {
            errors++;
            if (errors <= 3) console.log(`   ❌ ${e.state} ${e.date.toISOString().split('T')[0]}: ${err.message?.substring(0, 80)}`);
        }
    }

    console.log(`\n🏁 Confiscation import complete — ${created} created, ${errors} errors`);
    await prisma.$disconnect();
}

main().catch(err => { console.error('Fatal:', err); process.exit(1); });
