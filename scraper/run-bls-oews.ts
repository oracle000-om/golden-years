/**
 * Run BLS OEWS Vet Density Import
 *
 * Matches each shelter to its nearest metro area and updates
 * vetDensityPer10k + metroAvgVetSalary.
 *
 * Usage:
 *   npx tsx scraper/run-bls-oews.ts              # full import
 *   npx tsx scraper/run-bls-oews.ts --dry-run    # preview only
 */

import 'dotenv/config';
import { createPrismaClient } from './lib/prisma';
import { getVetDensityData, findNearestMetro } from './adapters/bls-oews';

async function main() {
    const dryRun = process.argv.includes('--dry-run');
    console.log(`🩺 Golden Years Club — BLS OEWS Vet Density Import${dryRun ? ' (DRY RUN)' : ''}`);

    // ── Load vet density data ──
    const vetData = getVetDensityData();

    const avgDensity = vetData.reduce((s, r) => s + r.vetDensityPer10k, 0) / vetData.length;

    if (dryRun) {
        console.log(`\n   Top 10 metros by vet density:`);
        const sorted = [...vetData].sort((a, b) => b.vetDensityPer10k - a.vetDensityPer10k);
        for (const v of sorted.slice(0, 10)) {
            const label = v.vetDensityPer10k > avgDensity ? '↑ above avg' : '↓ below avg';
            console.log(`      ${v.metroName}: ${v.vetDensityPer10k} vets/10K (${v.employment} vets, avg salary $${v.meanWage.toLocaleString()}) ${label}`);
        }

        console.log(`\n   Bottom 10 metros by vet density:`);
        for (const v of sorted.slice(-10)) {
            console.log(`      ${v.metroName}: ${v.vetDensityPer10k} vets/10K (${v.employment} vets, avg salary $${v.meanWage.toLocaleString()})`);
        }

        console.log(`\n   National average: ${avgDensity.toFixed(2)} vets per 10K residents`);
        return;
    }

    // ── Match shelters to metros and update ──
    const prisma = await createPrismaClient();

    const shelters = await prisma.shelter.findMany({
        where: { latitude: { not: null }, longitude: { not: null } },
        select: { id: true, latitude: true, longitude: true, name: true, state: true },
    });

    console.log(`\n🏠 Matching ${shelters.length} geocoded shelters to metros...`);

    let matched = 0;
    let unmatched = 0;

    for (const shelter of shelters) {
        if (!shelter.latitude || !shelter.longitude) continue;

        const match = findNearestMetro(shelter.latitude, shelter.longitude);
        if (!match) {
            unmatched++;
            continue;
        }

        await prisma.shelter.update({
            where: { id: shelter.id },
            data: {
                vetDensityPer10k: match.vetDensityPer10k,
                metroAvgVetSalary: match.meanWage,
                metroName: match.metroName,
            },
        });

        matched++;
    }

    console.log(`\n🏁 BLS OEWS import complete`);
    console.log(`   ✅ ${matched} shelters matched to metro vet density`);
    console.log(`   ⚪ ${unmatched} shelters not near a metro area (rural)`);

    await prisma.$disconnect();
}

main().catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
});
