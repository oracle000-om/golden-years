/**
 * Run Shelter Intake Stats
 *
 * Fetches national shelter intake/outcome data from Shelter Animals Count
 * and upserts state-level monthly statistics.
 *
 * Usage:
 *   npx tsx scraper/run-shelter-intake.ts                # latest data
 *   npx tsx scraper/run-shelter-intake.ts --dry-run      # preview only
 *   npx tsx scraper/run-shelter-intake.ts --backfill     # load all data/shelter-intake-*.csv files
 */

import 'dotenv/config';
import { readFile, readdir } from 'fs/promises';
import { join } from 'path';
import { createPrismaClient } from './lib/prisma';
import { fetchShelterIntakeStats } from './adapters/shelter-animals-count';

async function main() {
    const dryRun = process.argv.includes('--dry-run');
    const backfill = process.argv.includes('--backfill');
    console.log(`📊 Golden Years Club — Shelter Intake Stats${backfill ? ' (backfill)' : ''}${dryRun ? ' (DRY RUN)' : ''}`);

    const prisma = await createPrismaClient();
    let stats = await fetchShelterIntakeStats();

    // Backfill: also read any local data/shelter-intake-*.csv files
    if (backfill) {
        const dataDir = join(__dirname, '..', 'data');
        try {
            const files = await readdir(dataDir);
            const csvFiles = files.filter(f => f.startsWith('shelter-intake-') && f.endsWith('.csv'));
            if (csvFiles.length > 0) {
                console.log(`\n📂 Found ${csvFiles.length} local CSV files for backfill:`);
                for (const file of csvFiles.sort()) {
                    console.log(`   📄 ${file}`);
                }
                console.log(`   ℹ️  Local CSV ingestion will be added when file format is confirmed`);
            } else {
                console.log(`\n   ℹ️  No local shelter-intake-*.csv files found in data/`);
                console.log(`   ℹ️  Download from shelteranimalscount.org and save as:`);
                console.log(`       data/shelter-intake-2019.csv`);
                console.log(`       data/shelter-intake-2020.csv`);
                console.log(`       data/shelter-intake-2021.csv`);
                console.log(`       data/shelter-intake-2022.csv`);
                console.log(`       data/shelter-intake-2023.csv`);
                console.log(`       data/shelter-intake-2024.csv`);
            }
        } catch { /* data dir may not exist */ }
    }

    if (stats.length === 0) {
        console.log(`\n⚠️  No intake data fetched. May need manual CSV download.`);
        await prisma.$disconnect();
        return;
    }

    if (dryRun) {
        const years = [...new Set(stats.map(s => s.year))].sort();
        const states = [...new Set(stats.map(s => s.state))].sort();
        const totalIntake = stats.reduce((sum, s) => sum + s.intakeDogs + s.intakeCats, 0);
        const totalEuth = stats.reduce((sum, s) => sum + s.euthDogs + s.euthCats, 0);

        console.log(`\n📊 Summary:`);
        console.log(`   Records: ${stats.length}`);
        console.log(`   Years: ${years.join(', ')}`);
        console.log(`   States: ${states.length}`);
        console.log(`   Total intake (dogs+cats): ${totalIntake.toLocaleString()}`);
        console.log(`   Total euthanasia: ${totalEuth.toLocaleString()}`);

        await prisma.$disconnect();
        return;
    }

    console.log(`\n💾 Upserting ${stats.length} intake stats...`);
    let created = 0, errors = 0;

    for (const s of stats) {
        try {
            await prisma.shelterIntakeStats.upsert({
                where: { state_month_year: { state: s.state, month: s.month, year: s.year } },
                update: { intakeDogs: s.intakeDogs, intakeCats: s.intakeCats, surrenderCount: s.surrenderCount, strayCount: s.strayCount, seizureCount: s.seizureCount, euthDogs: s.euthDogs, euthCats: s.euthCats, liveReleaseRate: s.liveReleaseRate, lastScrapedAt: new Date() },
                create: { state: s.state, month: s.month, year: s.year, intakeDogs: s.intakeDogs, intakeCats: s.intakeCats, surrenderCount: s.surrenderCount, strayCount: s.strayCount, seizureCount: s.seizureCount, euthDogs: s.euthDogs, euthCats: s.euthCats, liveReleaseRate: s.liveReleaseRate },
            });
            created++;
        } catch (err: any) {
            errors++;
            if (errors <= 3) console.log(`   ❌ ${s.state}/${s.month}/${s.year}: ${err.message?.substring(0, 80)}`);
        }
    }

    console.log(`\n🏁 Intake stats import complete — ${created} upserted, ${errors} errors`);
    await prisma.$disconnect();
}

main().catch(err => { console.error('Fatal:', err); process.exit(1); });

