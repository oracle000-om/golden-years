/**
 * Run USDA Research Facility Reports
 *
 * Downloads APHIS research facility annual reports and upserts
 * lab animal usage data (dogs, cats, pain categories).
 *
 * Usage:
 *   npx tsx scraper/run-aphis-research.ts              # full import
 *   npx tsx scraper/run-aphis-research.ts --dry-run    # preview only
 *   npx tsx scraper/run-aphis-research.ts --year=2023  # specific year
 */

import 'dotenv/config';
import { createPrismaClient } from './lib/prisma';
import { fetchResearchFacilities } from './adapters/aphis-research';

async function main() {
    const dryRun = process.argv.includes('--dry-run');
    const backfill = process.argv.includes('--backfill');
    const yearArg = process.argv.find(a => a.startsWith('--year='));
    const year = yearArg ? parseInt(yearArg.split('=')[1], 10) : undefined;

    // Backfill: loop 2016 → current year for historical trend data
    const BACKFILL_START = 2016;
    const currentYear = new Date().getFullYear();
    const years = backfill
        ? Array.from({ length: currentYear - BACKFILL_START + 1 }, (_, i) => BACKFILL_START + i)
        : [year];

    console.log(`🔬 Golden Years Club — USDA Research Facility Reports${backfill ? ` (backfill ${BACKFILL_START}–${currentYear})` : year ? ` (${year})` : ''}${dryRun ? ' (DRY RUN)' : ''}`);

    const prisma = await createPrismaClient();

    let allFacilities: Awaited<ReturnType<typeof fetchResearchFacilities>> = [];
    for (const y of years) {
        console.log(y ? `\n📅 Fetching year ${y}...` : '');
        const batch = await fetchResearchFacilities(y);
        allFacilities.push(...batch);
    }
    const facilities = allFacilities;

    if (facilities.length === 0) {
        console.log(`\n⚠️  No research facility data found.`);
        await prisma.$disconnect();
        return;
    }

    if (dryRun) {
        const byState: Record<string, number> = {};
        let totalDogs = 0, totalCats = 0, painD = 0;
        for (const f of facilities) {
            byState[f.state] = (byState[f.state] || 0) + 1;
            totalDogs += f.totalDogs;
            totalCats += f.totalCats;
            painD += f.painCategoryD;
        }

        console.log(`\n📊 Summary:`);
        console.log(`   Facilities: ${facilities.length}`);
        console.log(`   Total dogs in labs: ${totalDogs.toLocaleString()}`);
        console.log(`   Total cats in labs: ${totalCats.toLocaleString()}`);
        console.log(`   Pain w/o relief (Category D): ${painD.toLocaleString()}`);
        console.log(`\n   Top states by facility count:`);
        Object.entries(byState).sort((a, b) => b[1] - a[1]).slice(0, 10)
            .forEach(([st, n]) => console.log(`      ${st}: ${n}`));

        await prisma.$disconnect();
        return;
    }

    console.log(`\n💾 Upserting ${facilities.length} research facility records...`);
    let created = 0, errors = 0;

    for (const f of facilities) {
        try {
            await prisma.researchFacility.upsert({
                where: { certNumber_reportYear: { certNumber: f.certNumber, reportYear: f.reportYear } },
                update: { totalDogs: f.totalDogs, totalCats: f.totalCats, totalAnimals: f.totalAnimals, painCategoryC: f.painCategoryC, painCategoryD: f.painCategoryD, painCategoryE: f.painCategoryE, lastScrapedAt: new Date() },
                create: { certNumber: f.certNumber, name: f.name, state: f.state, city: f.city, totalDogs: f.totalDogs, totalCats: f.totalCats, totalAnimals: f.totalAnimals, painCategoryC: f.painCategoryC, painCategoryD: f.painCategoryD, painCategoryE: f.painCategoryE, reportYear: f.reportYear },
            });
            created++;
        } catch (err: any) {
            errors++;
            if (errors <= 3) console.log(`   ❌ ${f.certNumber}: ${err.message?.substring(0, 80)}`);
        }
    }

    console.log(`\n🏁 Research facility import complete — ${created} upserted, ${errors} errors`);
    await prisma.$disconnect();
}

main().catch(err => { console.error('Fatal:', err); process.exit(1); });
