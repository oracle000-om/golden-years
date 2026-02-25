/**
 * Run Maryland — MDA Animal Shelter Statistics
 * Requires --file with extracted CSV/XLSX (source is annual report on maryland.gov).
 *
 * Usage:
 *   npx tsx scraper/run-maryland.ts --file /path/to.xlsx --dry-run
 */
import 'dotenv/config';
import { createPrismaClient } from './lib/prisma';
import * as XLSX from 'xlsx';

async function main() {
    const dryRun = process.argv.includes('--dry-run');
    const minIntakeIdx = process.argv.indexOf('--min-intake');
    const minIntake = minIntakeIdx >= 0 ? parseInt(process.argv[minIntakeIdx + 1], 10) : 50;
    const fileIdx = process.argv.indexOf('--file');
    const localFile = fileIdx >= 0 ? process.argv[fileIdx + 1] : null;
    if (!localFile) {
        console.log(`🦀  Maryland MDA — Animal Shelter Statistics`);
        console.log(`\n   Download from: https://mda.maryland.gov/AnimalHealth/Pages/Shelter-and-Rescue-Statistics.aspx`);
        console.log(`   Extract into CSV/XLSX with columns: Shelter Name, County, Dogs Intake, Cats Intake, Dogs Euthanized, Cats Euthanized, Dogs Adopted, Cats Adopted`);
        console.log(`   Run: npx tsx scraper/run-maryland.ts --file /path/to/extracted.xlsx`);
        process.exit(0);
    }
    console.log(`🦀  Golden Years Club — Maryland MDA Stats${dryRun ? ' (DRY RUN)' : ''}\n`);
    const wb = XLSX.readFile(localFile);
    const data = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]]) as Record<string, any>[];
    const n = (r: any, ...k: string[]) => { for (const key of k) for (const col of Object.keys(r)) if (col.toLowerCase().includes(key.toLowerCase())) return Number(r[col]) || 0; return 0; };
    const s = (r: any, ...k: string[]) => { for (const key of k) for (const col of Object.keys(r)) if (col.toLowerCase().includes(key.toLowerCase())) return String(r[col] || '').trim(); return ''; };
    const reports = data.map(r => { const name = s(r, 'shelter', 'facility', 'name'); if (!name) return null; const intake = n(r, 'dog intake', 'dogs intake') + n(r, 'cat intake', 'cats intake') || n(r, 'total intake', 'intake'); const euth = n(r, 'dog euth', 'dogs euth') + n(r, 'cat euth', 'cats euth') || n(r, 'total euth', 'euth'); return { name, county: s(r, 'county'), intake, euth, lrr: intake > 0 ? Math.round(((intake - euth) / intake) * 100) : 0 }; }).filter(Boolean).sort((a, b) => b!.lrr - a!.lrr) as any[];
    const qualifying = reports.filter((r: any) => r.intake >= minIntake);
    const noKill = qualifying.filter((r: any) => r.lrr >= 90);
    console.log(`   Total: ${reports.length} | Qualifying: ${qualifying.length} | No-kill: ${noKill.length}\n`);
    if (dryRun) { console.log(`✅ Dry run complete.`); process.exit(0); }
    const prisma = await createPrismaClient();
    let created = 0, updated = 0;
    for (const r of qualifying) {
        const dbId = `md-mda-${r.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 60)}`;
        try { const existing = await (prisma as any).shelter.findUnique({ where: { id: dbId } }); const d = { totalIntakeAnnual: r.intake, totalEuthanizedAnnual: r.euth, dataYear: 2024, dataSourceName: 'Maryland MDA', dataSourceUrl: 'https://mda.maryland.gov/AnimalHealth/Pages/Shelter-and-Rescue-Statistics.aspx', lastScrapedAt: new Date() }; await (prisma as any).shelter.upsert({ where: { id: dbId }, update: d, create: { id: dbId, name: r.name, county: r.county, state: 'MD', shelterType: 'MUNICIPAL', ...d } }); if (existing) updated++; else created++; } catch (err) { console.error(`   ❌ ${r.name}: ${(err as Error).message?.substring(0, 80)}`); }
    }
    console.log(`\n🏁 Done! Created: ${created} | Updated: ${updated}`);
    process.exit(0);
}
main();
