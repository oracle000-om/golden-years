/**
 * Run USDA APHIS Breeder/Dealer Inspections
 *
 * Downloads inspection data from the Data Liberation Project (GitHub),
 * filters to breeder (A) and dealer (B) license types, and upserts
 * into the breeder_inspections table.
 *
 * Usage:
 *   npx tsx scraper/run-aphis.ts              # full import
 *   npx tsx scraper/run-aphis.ts --dry-run    # preview only
 */

import 'dotenv/config';
import { createPrismaClient } from './lib/prisma';
import { fetchAphisInspections } from './adapters/aphis-inspections';

async function main() {
    const dryRun = process.argv.includes('--dry-run');
    console.log(`🏭 Golden Years Club — USDA APHIS Breeder/Dealer Inspections${dryRun ? ' (DRY RUN)' : ''}`);

    const prisma = await createPrismaClient();

    // ── Download and parse ──
    const inspections = await fetchAphisInspections();

    if (dryRun) {
        // Show a sample and state breakdown
        const byState: Record<string, number> = {};
        const withViolations = inspections.filter(i => i.criticalViolations > 0);
        for (const i of inspections) {
            byState[i.state] = (byState[i.state] || 0) + 1;
        }

        console.log(`\n📊 Summary:`);
        console.log(`   Total inspections: ${inspections.length}`);
        console.log(`   With critical violations: ${withViolations.length} (${((withViolations.length / inspections.length) * 100).toFixed(1)}%)`);
        console.log(`   States covered: ${Object.keys(byState).length}`);
        console.log(`\n   Top 10 states by inspection count:`);
        const sorted = Object.entries(byState).sort((a, b) => b[1] - a[1]).slice(0, 10);
        for (const [state, count] of sorted) {
            const violations = inspections.filter(i => i.state === state && i.criticalViolations > 0).length;
            console.log(`      ${state}: ${count} inspections (${violations} with critical violations)`);
        }

        console.log(`\n   Sample records:`);
        for (const i of withViolations.slice(0, 5)) {
            console.log(`      ${i.legalName} (${i.state}) — ${i.criticalViolations} critical, ${i.animalCount || '?'} animals, ${i.inspectionDate.toISOString().split('T')[0]}`);
        }

        await prisma.$disconnect();
        return;
    }

    // ── Upsert into DB ──
    console.log(`\n💾 Upserting ${inspections.length} inspections...`);

    let created = 0;
    let updated = 0;
    let errors = 0;
    const batchSize = 100;

    for (let i = 0; i < inspections.length; i += batchSize) {
        const batch = inspections.slice(i, i + batchSize);

        for (const insp of batch) {
            try {
                const result = await prisma.breederInspection.upsert({
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
                    },
                });

                created++;
            } catch (err: any) {
                errors++;
                if (errors <= 5) {
                    console.log(`   ❌ Error: ${insp.certNumber} ${insp.inspectionDate.toISOString().split('T')[0]}: ${err.message?.substring(0, 100)}`);
                }
            }
        }

        if ((i + batchSize) % 5000 === 0 || i + batchSize >= inspections.length) {
            console.log(`   📦 Progress: ${Math.min(i + batchSize, inspections.length)}/${inspections.length} (${created} created, ${updated} updated, ${errors} errors)`);
        }
    }

    console.log(`\n🏁 APHIS import complete`);
    console.log(`   ✅ ${created} new inspections`);
    console.log(`   🔄 ${updated} updated`);
    console.log(`   ❌ ${errors} errors`);

    await prisma.$disconnect();
}

main().catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
});
