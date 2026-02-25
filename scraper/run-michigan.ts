/**
 * Run Michigan — MDARD Animal Shelter Annual Reports
 * Requires --file with extracted CSV/XLSX (source is 22MB PDF).
 *
 * Usage:
 *   npx tsx scraper/run-michigan.ts --file /path/to.xlsx --dry-run
 */
import 'dotenv/config';
import { createPrismaClient } from './lib/prisma';
import { parseMichiganExport } from './adapters/michigan-mdard';

async function main() {
    const dryRun = process.argv.includes('--dry-run');
    const minIntakeIdx = process.argv.indexOf('--min-intake');
    const minIntake = minIntakeIdx >= 0 ? parseInt(process.argv[minIntakeIdx + 1], 10) : 50;
    const fileIdx = process.argv.indexOf('--file');
    const localFile = fileIdx >= 0 ? process.argv[fileIdx + 1] : null;

    if (!localFile) {
        console.log(`🌲  Michigan MDARD — Animal Shelter Annual Reports`);
        console.log(`\n   Michigan publishes shelter data as a compiled PDF of individual forms.`);
        console.log(`   Download from: https://www.michigan.gov/mdard/animals/animal-shelters/annual-reports`);
        console.log(`   Extract into CSV/XLSX, then: npx tsx scraper/run-michigan.ts --file /path/to/extracted.xlsx`);
        process.exit(0);
    }

    console.log(`🌲  Golden Years Club — Michigan MDARD Stats${dryRun ? ' (DRY RUN)' : ''}\n`);
    const reports = parseMichiganExport(localFile);
    const qualifying = reports.filter(r => r.totalIntake >= minIntake);
    const noKill = qualifying.filter(r => r.liveReleaseRate >= 90);
    console.log(`   Total: ${reports.length} | Qualifying: ${qualifying.length} | No-kill: ${noKill.length}\n`);

    if (noKill.length > 0) { console.log(`   🏆 No-Kill:`); noKill.slice(0, 20).forEach(r => console.log(`      ${r.liveReleaseRate}% | ${r.shelterName} — intake: ${r.totalIntake}, euth: ${r.totalEuthanized}`)); }
    if (dryRun) { console.log(`\n✅ Dry run complete. ${qualifying.length} shelters ready.`); process.exit(0); }

    const prisma = await createPrismaClient();
    let created = 0, updated = 0;
    for (const r of qualifying) {
        const dbId = r.registrationNumber ? `mdard-${r.registrationNumber}` : `mdard-${r.shelterName.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 60)}`;
        try {
            const existing = await (prisma as any).shelter.findUnique({ where: { id: dbId } });
            const data: Record<string, any> = { totalIntakeAnnual: r.totalIntake, totalEuthanizedAnnual: r.totalEuthanized, dataYear: 2024, dataSourceName: 'Michigan MDARD', dataSourceUrl: 'https://www.michigan.gov/mdard/animals/animal-shelters/annual-reports', lastScrapedAt: new Date() };
            await (prisma as any).shelter.upsert({ where: { id: dbId }, update: data, create: { id: dbId, name: r.shelterName, county: r.city, state: 'MI', shelterType: 'MUNICIPAL', ...data } });
            if (existing) updated++; else created++;
        } catch (err) { console.error(`   ❌ ${r.shelterName}: ${(err as Error).message?.substring(0, 100)}`); }
    }
    console.log(`\n🏁 Done! Created: ${created} | Updated: ${updated}`);
    process.exit(0);
}
main();
