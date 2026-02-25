/**
 * Run Georgia GDA — Government Shelter Data Import
 *
 * Downloads and imports shelter statistics from Georgia Department of Agriculture.
 * All government-run shelters must report monthly under the Animal Protection Act.
 *
 * Usage:
 *   npx tsx scraper/run-georgia.ts                    # full run (latest year)
 *   npx tsx scraper/run-georgia.ts --dry-run           # preview only
 *   npx tsx scraper/run-georgia.ts --year 2024         # specific year
 *   npx tsx scraper/run-georgia.ts --min-intake 50     # filter small shelters
 *   npx tsx scraper/run-georgia.ts --file /path/to.xlsx # use local file
 */

import 'dotenv/config';
import { createPrismaClient } from './lib/prisma';
import { parseGeorgiaExport } from './adapters/georgia-gda';
import { writeFileSync, existsSync } from 'fs';

const EXPORT_URL = 'https://agr.georgia.gov/sites/default/files/documents/pets-and-livestock/shelter-report-data-export-february-2026.xlsx';

async function main() {
    const dryRun = process.argv.includes('--dry-run');
    const yearArg = process.argv.find(a => a.startsWith('--year'));
    const year = yearArg
        ? parseInt(process.argv[process.argv.indexOf(yearArg) + 1], 10)
        : 2025; // Default to most recent full year
    const minIntakeArg = process.argv.find(a => a.startsWith('--min-intake'));
    const minIntake = minIntakeArg
        ? parseInt(process.argv[process.argv.indexOf(minIntakeArg) + 1], 10)
        : 50;
    const fileArg = process.argv.find(a => a.startsWith('--file'));
    const localFile = fileArg ? process.argv[process.argv.indexOf(fileArg) + 1] : null;

    console.log(`🍑  Golden Years Club — Georgia GDA Stats${dryRun ? ' (DRY RUN)' : ''}`);
    console.log(`   Source: Georgia Dept. of Agriculture`);
    console.log(`   Year: ${year} | Min intake: ${minIntake}\n`);

    // Step 1: Get the XLSX file
    let filePath: string;
    if (localFile && existsSync(localFile)) {
        filePath = localFile;
        console.log(`📁 Using local file: ${localFile}`);
    } else {
        console.log(`📥 Downloading shelter data export...`);
        try {
            const resp = await fetch(EXPORT_URL, {
                signal: AbortSignal.timeout(30000),
                headers: { 'User-Agent': 'GoldenYearsClub/1.0 (animal welfare research)' },
            });
            if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
            const buffer = Buffer.from(await resp.arrayBuffer());
            filePath = '/tmp/georgia_shelter_data.xlsx';
            writeFileSync(filePath, buffer);
            console.log(`   Downloaded ${(buffer.length / 1024).toFixed(0)}KB\n`);
        } catch (err) {
            console.error(`   ❌ Download failed: ${(err as Error).message}`);
            if (existsSync('/tmp/georgia_shelter_data.xlsx')) {
                filePath = '/tmp/georgia_shelter_data.xlsx';
                console.log(`   Using cached file instead\n`);
            } else {
                process.exit(1);
            }
        }
    }

    // Step 2: Parse XLSX
    console.log(`📊 Parsing XLSX for year ${year}...`);
    const reports = parseGeorgiaExport(filePath, year);
    const qualifying = reports.filter(r => r.totalIntake >= minIntake);
    const noKill = qualifying.filter(r => r.liveReleaseRate >= 90);

    console.log(`   Total shelters reporting: ${reports.length}`);
    console.log(`   Qualifying (intake ≥ ${minIntake}): ${qualifying.length}`);
    console.log(`   No-kill (≥90% LRR): ${noKill.length}\n`);

    // Show stats
    console.log(`═══════════════════════════════════════════`);
    console.log(`📈 Georgia Shelter Statistics — ${year}`);
    console.log(`═══════════════════════════════════════════`);

    if (noKill.length > 0) {
        console.log(`\n   🏆 No-Kill Shelters:`);
        for (const r of noKill.slice(0, 20)) {
            console.log(`      ${r.liveReleaseRate}% | ${r.shelterName} — intake: ${r.totalIntake}, euth: ${r.totalEuthanized} (${r.monthsReported}mo)`);
        }
        if (noKill.length > 20) console.log(`      ... and ${noKill.length - 20} more`);
    }

    const below = qualifying.filter(r => r.liveReleaseRate < 90);
    if (below.length > 0) {
        console.log(`\n   📊 Sample below 90%:`);
        for (const r of below.slice(0, 10)) {
            console.log(`      ${r.liveReleaseRate}% | ${r.shelterName} — intake: ${r.totalIntake}, euth: ${r.totalEuthanized}`);
        }
    }

    if (dryRun) {
        console.log(`\n✅ Dry run complete. ${qualifying.length} shelters ready to import.`);
        process.exit(0);
    }

    // Step 3: Upsert into DB
    console.log(`\n💾 Writing ${qualifying.length} shelter stats to database...`);
    const prisma = await createPrismaClient();
    let created = 0;
    let updated = 0;

    for (const report of qualifying) {
        const dbId = `gda-${report.licenseNumber}`;
        try {
            const existing = await (prisma as any).shelter.findUnique({
                where: { id: dbId },
                select: { totalIntakeAnnual: true, totalEuthanizedAnnual: true, dataYear: true },
            });

            // Annualize if not 12 months
            const annualIntake = report.monthsReported < 12
                ? Math.round(report.totalIntake * (12 / report.monthsReported))
                : report.totalIntake;
            const annualEuth = report.monthsReported < 12
                ? Math.round(report.totalEuthanized * (12 / report.monthsReported))
                : report.totalEuthanized;

            const data: Record<string, any> = {
                totalIntakeAnnual: annualIntake,
                totalEuthanizedAnnual: annualEuth,
                dataYear: report.year,
                dataSourceName: 'Georgia Dept. of Agriculture',
                dataSourceUrl: 'https://agr.georgia.gov/government-shelter-data-reporting',
                lastScrapedAt: new Date(),
            };

            await (prisma as any).shelter.upsert({
                where: { id: dbId },
                update: data,
                create: {
                    id: dbId,
                    name: report.shelterName,
                    county: report.county || '',
                    state: 'GA',
                    shelterType: report.liveReleaseRate >= 90 ? 'NO_KILL' : 'MUNICIPAL',
                    ...data,
                },
            });

            if (existing) updated++;
            else created++;
        } catch (err) {
            console.error(`   ❌ ${report.shelterName}: ${(err as Error).message?.substring(0, 100)}`);
        }
    }

    console.log(`\n🏁 Done!`);
    console.log(`   Created: ${created} | Updated: ${updated}`);
    console.log(`   No-kill shelters: ${noKill.length}`);
    console.log(`   Total with data: ${qualifying.length}`);
    process.exit(0);
}

main();
