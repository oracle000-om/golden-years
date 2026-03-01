/**
 * Run USDA APHIS Enforcement Actions
 *
 * Downloads citation data from the Data Liberation Project,
 * identifies enforcement-worthy patterns, and upserts into
 * the breeder_enforcements table.
 *
 * Usage:
 *   npx tsx scraper/run-aphis-enforcement.ts              # full import
 *   npx tsx scraper/run-aphis-enforcement.ts --dry-run    # preview only
 */

import 'dotenv/config';
import { createPrismaClient } from './lib/prisma';
import { fetchAphisEnforcement } from './adapters/aphis-enforcement';

async function main() {
    const dryRun = process.argv.includes('--dry-run');
    console.log(`⚖️  Golden Years Club — USDA APHIS Enforcement Actions${dryRun ? ' (DRY RUN)' : ''}`);

    const prisma = await createPrismaClient();

    // ── Download and parse ──
    const actions = await fetchAphisEnforcement();

    if (dryRun) {
        const byType: Record<string, number> = {};
        const byState: Record<string, number> = {};
        for (const a of actions) {
            byType[a.actionType] = (byType[a.actionType] || 0) + 1;
            byState[a.state] = (byState[a.state] || 0) + 1;
        }

        console.log(`\n📊 Summary:`);
        console.log(`   Total enforcement actions: ${actions.length}`);
        console.log(`\n   By type:`);
        for (const [type, count] of Object.entries(byType).sort((a, b) => b[1] - a[1])) {
            console.log(`      ${type}: ${count}`);
        }
        console.log(`\n   Top 10 states:`);
        const sortedStates = Object.entries(byState).sort((a, b) => b[1] - a[1]).slice(0, 10);
        for (const [state, count] of sortedStates) {
            console.log(`      ${state}: ${count}`);
        }

        console.log(`\n   Sample records:`);
        for (const a of actions.slice(0, 5)) {
            console.log(`      ${a.legalName} (${a.state}) — ${a.actionType}, ${a.citationCodes.length} citations, ${a.actionDate.toISOString().split('T')[0]}`);
        }

        await prisma.$disconnect();
        return;
    }

    // ── Upsert into DB ──
    console.log(`\n💾 Upserting ${actions.length} enforcement actions...`);

    let created = 0;
    let updated = 0;
    let errors = 0;
    const batchSize = 100;

    for (let i = 0; i < actions.length; i += batchSize) {
        const batch = actions.slice(i, i + batchSize);

        for (const action of batch) {
            try {
                await prisma.breederEnforcement.upsert({
                    where: {
                        certNumber_actionDate_actionType: {
                            certNumber: action.certNumber,
                            actionDate: action.actionDate,
                            actionType: action.actionType,
                        },
                    },
                    update: {
                        citationCodes: action.citationCodes,
                        narrative: action.narrative,
                        dataSource: 'USDA_APHIS',
                        lastScrapedAt: new Date(),
                    },
                    create: {
                        certNumber: action.certNumber,
                        legalName: action.legalName,
                        state: action.state,
                        actionType: action.actionType,
                        actionDate: action.actionDate,
                        fineAmount: action.fineAmount,
                        citationCodes: action.citationCodes,
                        narrative: action.narrative,
                        dataSource: 'USDA_APHIS',
                    },
                });

                created++;
            } catch (err: any) {
                errors++;
                if (errors <= 5) {
                    console.log(`   ❌ Error: ${action.certNumber} ${action.actionDate.toISOString().split('T')[0]}: ${err.message?.substring(0, 100)}`);
                }
            }
        }

        if ((i + batchSize) % 5000 === 0 || i + batchSize >= actions.length) {
            console.log(`   📦 Progress: ${Math.min(i + batchSize, actions.length)}/${actions.length} (${created} upserted, ${errors} errors)`);
        }
    }

    console.log(`\n🏁 Enforcement import complete`);
    console.log(`   ✅ ${created} enforcement actions upserted`);
    console.log(`   ❌ ${errors} errors`);

    await prisma.$disconnect();
}

main().catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
});
