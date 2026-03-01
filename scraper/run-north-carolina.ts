/**
 * Run North Carolina — NCDA&CS Public Animal Shelter Report
 *
 * Usage:
 *   npx tsx scraper/run-north-carolina.ts --dry-run
 *   npx tsx scraper/run-north-carolina.ts --file /path/to.xlsx
 */
import 'dotenv/config';
import { createPrismaClient } from './lib/prisma';
import { parseNorthCarolinaExport } from './adapters/north-carolina-ncda';
import { writeFileSync, existsSync } from 'fs';

const EXPORT_URL = 'https://www.ncagr.gov/2024-public-animal-shelter-report-excel-1/download?attachment';

async function main() {
    const dryRun = process.argv.includes('--dry-run');
    const minIntakeIdx = process.argv.indexOf('--min-intake');
    const minIntake = minIntakeIdx >= 0 ? parseInt(process.argv[minIntakeIdx + 1], 10) : 50;
    const fileIdx = process.argv.indexOf('--file');
    const localFile = fileIdx >= 0 ? process.argv[fileIdx + 1] : null;
    const yearIdx = process.argv.indexOf('--year');
    const year = yearIdx >= 0 ? parseInt(process.argv[yearIdx + 1], 10) : 2024;

    console.log(`🌲  Golden Years Club — North Carolina NCDA Stats${dryRun ? ' (DRY RUN)' : ''}`);
    console.log(`   Source: NC Dept. of Agriculture & Consumer Services`);
    console.log(`   Year: ${year} | Min intake: ${minIntake}\n`);

    let filePath: string;
    if (localFile && existsSync(localFile)) { filePath = localFile; console.log(`📁 Using local file: ${localFile}`); }
    else {
        console.log(`📥 Downloading shelter report...`);
        try {
            const resp = await fetch(EXPORT_URL, { signal: AbortSignal.timeout(30000), headers: { 'User-Agent': 'GoldenYearsClub/1.0' } });
            if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
            const buffer = Buffer.from(await resp.arrayBuffer());
            filePath = '/tmp/nc_shelter_2024.xlsx';
            writeFileSync(filePath, buffer);
            console.log(`   Downloaded ${(buffer.length / 1024).toFixed(0)}KB\n`);
        } catch (err) {
            if (existsSync('/tmp/nc_shelter_2024.xlsx')) { filePath = '/tmp/nc_shelter_2024.xlsx'; console.log(`   Using cached file\n`); }
            else { console.error(`   ❌ Download failed: ${(err as Error).message}`); process.exit(1); }
        }
    }

    const reports = parseNorthCarolinaExport(filePath, year);
    const qualifying = reports.filter(r => r.totalIntake >= minIntake);
    const noKill = qualifying.filter(r => r.liveReleaseRate >= 90);
    console.log(`   Total: ${reports.length} | Qualifying: ${qualifying.length} | No-kill: ${noKill.length}\n`);

    if (noKill.length > 0) { console.log(`   🏆 No-Kill:`); noKill.slice(0, 20).forEach(r => console.log(`      ${r.liveReleaseRate}% | ${r.facilityName} (${r.county}) — intake: ${r.totalIntake}, euth: ${r.totalEuthanized}`)); }
    if (dryRun) { console.log(`\n✅ Dry run complete. ${qualifying.length} shelters ready.`); process.exit(0); }

    const prisma = await createPrismaClient();
    let created = 0, updated = 0;
    for (const r of qualifying) {
        const dbId = `ncda-${r.licenseNumber}`;
        try {
            const existing = await prisma.shelter.findUnique({ where: { id: dbId }, select: { totalIntakeAnnual: true, totalEuthanizedAnnual: true, dataYear: true } });
            const data: Record<string, any> = { totalIntakeAnnual: r.totalIntake, totalEuthanizedAnnual: r.totalEuthanized, dataYear: r.year, dataSourceName: 'North Carolina NCDA&CS (LRR excludes deaths-in-care)', dataSourceUrl: 'https://www.ncagr.gov/divisions/veterinary/spay-and-neuter-reports', lastScrapedAt: new Date() };
            await prisma.shelter.upsert({ where: { id: dbId }, update: data, create: { id: dbId, name: r.facilityName, county: r.county, state: 'NC', shelterType: r.liveReleaseRate >= 90 ? 'NO_KILL' : 'MUNICIPAL', ...data } });
            if (existing) updated++; else created++;
        } catch (err) { console.error(`   ❌ ${r.facilityName}: ${(err as Error).message?.substring(0, 100)}`); }
    }
    console.log(`\n🏁 Done! Created: ${created} | Updated: ${updated}`);
    process.exit(0);
}
main();
