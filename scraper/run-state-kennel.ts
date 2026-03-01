/**
 * Run State Kennel Records Scraper
 *
 * Fetches kennel inspection/licensing data from state agriculture
 * databases (PA, MO, KS). Each state has its own data format.
 *
 * Usage:
 *   npx tsx scraper/run-state-kennel.ts              # all states
 *   npx tsx scraper/run-state-kennel.ts --state=PA   # single state
 *   npx tsx scraper/run-state-kennel.ts --dry-run    # preview only
 */

import 'dotenv/config';
import { createPrismaClient } from './lib/prisma';
import { fetchStateKennelRecords } from './adapters/state-kennel';

async function main() {
    const dryRun = process.argv.includes('--dry-run');
    const stateArg = process.argv.find(a => a.startsWith('--state='));
    const states = stateArg ? [stateArg.split('=')[1].toUpperCase()] : undefined;

    const label = states ? states.join(', ') : 'all states';
    console.log(`🏭 Golden Years Club — State Kennel Records (${label})${dryRun ? ' (DRY RUN)' : ''}`);

    const prisma = await createPrismaClient();

    // ── Fetch records ──
    const inspections = await fetchStateKennelRecords(states);

    if (inspections.length === 0) {
        console.log(`\n⚠️  No kennel records found. State data sources may need manual extraction.`);
        await prisma.$disconnect();
        return;
    }

    if (dryRun) {
        const byState: Record<string, number> = {};
        for (const i of inspections) {
            byState[i.state] = (byState[i.state] || 0) + 1;
        }

        console.log(`\n📊 Summary:`);
        console.log(`   Total records: ${inspections.length}`);
        console.log(`   States: ${Object.keys(byState).join(', ')}`);
        for (const [state, count] of Object.entries(byState)) {
            console.log(`      ${state}: ${count} records`);
        }

        console.log(`\n   Sample records:`);
        for (const i of inspections.slice(0, 5)) {
            console.log(`      ${i.legalName} (${i.state}) — ${i.dataSource}, ${i.animalCount || '?'} animals`);
        }

        await prisma.$disconnect();
        return;
    }

    // ── Upsert into BreederInspection ──
    console.log(`\n💾 Upserting ${inspections.length} state kennel records...`);

    let created = 0;
    let errors = 0;

    for (const insp of inspections) {
        try {
            await prisma.breederInspection.upsert({
                where: {
                    certNumber_inspectionDate: {
                        certNumber: insp.certNumber,
                        inspectionDate: insp.inspectionDate,
                    },
                },
                update: {
                    criticalViolations: insp.criticalViolations,
                    nonCritical: insp.nonCritical,
                    animalCount: insp.animalCount,
                    inspectionType: insp.inspectionType,
                    narrativeExcerpt: insp.narrativeExcerpt,
                    reportUrl: insp.reportUrl,
                    dataSource: insp.dataSource,
                    lastScrapedAt: new Date(),
                },
                create: {
                    certNumber: insp.certNumber,
                    licenseType: insp.licenseType,
                    legalName: insp.legalName,
                    siteName: insp.siteName,
                    city: insp.city,
                    state: insp.state,
                    zipCode: insp.zipCode,
                    inspectionDate: insp.inspectionDate,
                    inspectionType: insp.inspectionType,
                    criticalViolations: insp.criticalViolations,
                    nonCritical: insp.nonCritical,
                    animalCount: insp.animalCount,
                    narrativeExcerpt: insp.narrativeExcerpt,
                    reportUrl: insp.reportUrl,
                    dataSource: insp.dataSource,
                },
            });

            created++;
        } catch (err: any) {
            errors++;
            if (errors <= 5) {
                console.log(`   ❌ Error: ${insp.certNumber} (${insp.state}): ${err.message?.substring(0, 100)}`);
            }
        }
    }

    console.log(`\n🏁 State kennel import complete`);
    console.log(`   ✅ ${created} records upserted`);
    console.log(`   ❌ ${errors} errors`);

    await prisma.$disconnect();
}

main().catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
});
