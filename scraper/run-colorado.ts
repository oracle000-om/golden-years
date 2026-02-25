/**
 * Run Colorado — PACFA Animal Shelter & Rescue Statistics
 *
 * Usage:
 *   npx tsx scraper/run-colorado.ts --dry-run
 *   npx tsx scraper/run-colorado.ts --file /path/to.xlsx
 *   npx tsx scraper/run-colorado.ts --min-intake 100
 */
import 'dotenv/config';
import { createPrismaClient } from './lib/prisma';
import { parseColoradoExport } from './adapters/colorado-pacfa';
import { writeFileSync, existsSync } from 'fs';

const SHEET_ID = '1qn6KDN2e0mpDxUY9j7sYG-f254q620xwFq95gD7Udn8';
const EXPORT_URL = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/export?format=xlsx`;

async function main() {
    const dryRun = process.argv.includes('--dry-run');
    const minIntakeIdx = process.argv.indexOf('--min-intake');
    const minIntake = minIntakeIdx >= 0 ? parseInt(process.argv[minIntakeIdx + 1], 10) : 50;
    const fileIdx = process.argv.indexOf('--file');
    const localFile = fileIdx >= 0 ? process.argv[fileIdx + 1] : null;

    console.log(`🏔️  Golden Years Club — Colorado PACFA Stats${dryRun ? ' (DRY RUN)' : ''}`);
    console.log(`   Source: Colorado Dept. of Agriculture — PACFA Program`);
    console.log(`   Year: 2024 | Min intake: ${minIntake}\n`);

    let filePath: string;
    if (localFile && existsSync(localFile)) {
        filePath = localFile;
        console.log(`📁 Using local file: ${localFile}`);
    } else {
        console.log(`📥 Downloading PACFA statistics...`);
        try {
            const resp = await fetch(EXPORT_URL, { signal: AbortSignal.timeout(30000), headers: { 'User-Agent': 'GoldenYearsClub/1.0' } });
            if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
            const buffer = Buffer.from(await resp.arrayBuffer());
            filePath = '/tmp/colorado_pacfa_2024.xlsx';
            writeFileSync(filePath, buffer);
            console.log(`   Downloaded ${(buffer.length / 1024).toFixed(0)}KB\n`);
        } catch (err) {
            if (existsSync('/tmp/colorado_pacfa_2024.xlsx')) { filePath = '/tmp/colorado_pacfa_2024.xlsx'; console.log(`   Using cached file\n`); }
            else { console.error(`   ❌ Download failed: ${(err as Error).message}`); process.exit(1); }
        }
    }

    console.log(`📊 Parsing PACFA statistics...`);
    const reports = parseColoradoExport(filePath);
    const qualifying = reports.filter(r => r.totalIntake >= minIntake);
    const noKill = qualifying.filter(r => r.liveReleaseRate >= 90);
    console.log(`   Total: ${reports.length} | Qualifying (≥${minIntake}): ${qualifying.length} | No-kill: ${noKill.length}\n`);

    if (noKill.length > 0) { console.log(`   🏆 No-Kill:`); noKill.slice(0, 20).forEach(r => console.log(`      ${r.liveReleaseRate}% | ${r.facilityName} — intake: ${r.totalIntake}, euth: ${r.totalEuthanized}`)); if (noKill.length > 20) console.log(`      ... and ${noKill.length - 20} more`); }
    const below = qualifying.filter(r => r.liveReleaseRate < 90);
    if (below.length > 0) { console.log(`\n   📊 Below 90%:`); below.slice(0, 10).forEach(r => console.log(`      ${r.liveReleaseRate}% | ${r.facilityName} — intake: ${r.totalIntake}, euth: ${r.totalEuthanized}`)); }
    if (dryRun) { console.log(`\n✅ Dry run complete. ${qualifying.length} shelters ready.`); process.exit(0); }

    const prisma = await createPrismaClient();
    let created = 0, updated = 0;
    for (const r of qualifying) {
        const dbId = `co-pacfa-${r.facilityName.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 60)}`;
        try {
            const existing = await (prisma as any).shelter.findUnique({ where: { id: dbId }, select: { totalIntakeAnnual: true, totalEuthanizedAnnual: true, dataYear: true } });
            const data: Record<string, any> = { totalIntakeAnnual: r.totalIntake, totalEuthanizedAnnual: r.totalEuthanized, dataYear: 2024, dataSourceName: 'Colorado PACFA', dataSourceUrl: `https://docs.google.com/spreadsheets/d/${SHEET_ID}`, lastScrapedAt: new Date() };
            if (existing?.dataYear && existing.dataYear !== 2024 && existing.totalIntakeAnnual > 0) { data.priorYearIntake = existing.totalIntakeAnnual; data.priorYearEuthanized = existing.totalEuthanizedAnnual; data.priorDataYear = existing.dataYear; }
            const county = r.facilityName.match(/^(.+?)\s+County\b/i)?.[1]?.trim() || '';
            await (prisma as any).shelter.upsert({ where: { id: dbId }, update: data, create: { id: dbId, name: r.facilityName, county, state: 'CO', shelterType: r.liveReleaseRate >= 90 ? 'NO_KILL' : 'MUNICIPAL', ...data } });
            if (existing) updated++; else created++;
        } catch (err) { console.error(`   ❌ ${r.facilityName}: ${(err as Error).message?.substring(0, 100)}`); }
    }
    console.log(`\n🏁 Done! Created: ${created} | Updated: ${updated}`);
    process.exit(0);
}
main();
