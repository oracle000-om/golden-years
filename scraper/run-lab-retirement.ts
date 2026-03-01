/**
 * Run Lab Animal Retirement / Beagle Bill Tracking
 *
 * Updates StatePolicy records with Beagle Bill data —
 * which states mandate labs offer animals for adoption.
 *
 * Usage:
 *   npx tsx scraper/run-lab-retirement.ts              # full update
 *   npx tsx scraper/run-lab-retirement.ts --dry-run    # preview only
 */

import 'dotenv/config';
import { createPrismaClient } from './lib/prisma';
import { fetchBeagleBillStates } from './adapters/lab-retirement';

async function main() {
    const dryRun = process.argv.includes('--dry-run');
    console.log(`🐕 Golden Years Club — Beagle Bill State Tracking${dryRun ? ' (DRY RUN)' : ''}`);

    const prisma = await createPrismaClient();
    const states = await fetchBeagleBillStates();

    const withBill = states.filter(s => s.hasBeagleBill);

    if (dryRun) {
        console.log(`\n📊 Summary:`);
        console.log(`   States with Beagle Bills: ${withBill.length}`);
        console.log(`\n   States:`);
        for (const s of withBill.sort((a, b) => (a.billYear || 0) - (b.billYear || 0))) {
            console.log(`      ${s.state} (${s.billYear || '?'}): ${s.details || 'No details'}`);
        }

        await prisma.$disconnect();
        return;
    }

    console.log(`\n💾 Updating ${withBill.length} state policies with Beagle Bill data...`);
    let updated = 0, errors = 0;

    for (const s of withBill) {
        try {
            await prisma.statePolicy.updateMany({
                where: { state: s.state },
                data: {
                    beagleBill: s.hasBeagleBill,
                    beagleBillYear: s.billYear,
                    beagleBillDetails: s.details,
                },
            });
            updated++;
        } catch (err: any) {
            errors++;
            if (errors <= 3) console.log(`   ❌ ${s.state}: ${err.message?.substring(0, 80)}`);
        }
    }

    console.log(`\n🏁 Beagle Bill update complete — ${updated} states updated, ${errors} errors`);
    await prisma.$disconnect();
}

main().catch(err => { console.error('Fatal:', err); process.exit(1); });
