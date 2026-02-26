/**
 * Run South Carolina — SCLLR Animal Shelter Reports
 *
 * Usage:
 *   npx tsx scraper/run-south-carolina.ts --dry-run
 *   npx tsx scraper/run-south-carolina.ts --min-intake 100
 */
import 'dotenv/config';
import { createPrismaClient } from './lib/prisma';
import { getSouthCarolinaStats } from './adapters/south-carolina-scllr';

async function main() {
    const dryRun = process.argv.includes('--dry-run');
    const minIntakeIdx = process.argv.indexOf('--min-intake');
    const minIntake = minIntakeIdx >= 0 ? parseInt(process.argv[minIntakeIdx + 1], 10) : 50;

    console.log(`🌴  Golden Years Club — South Carolina SCLLR Stats${dryRun ? ' (DRY RUN)' : ''}`);
    console.log(`   Source: SC Board of Vet Med — Annual Animal Shelter Report`);
    console.log(`   Year: 2023 | Min intake: ${minIntake}\n`);

    const reports = getSouthCarolinaStats();
    const qualifying = reports.filter(r => r.totalIntake >= minIntake);
    const noKill = qualifying.filter(r => r.liveReleaseRate >= 90);
    console.log(`   Total: ${reports.length} | Qualifying: ${qualifying.length} | No-kill: ${noKill.length}\n`);

    if (noKill.length > 0) { console.log(`   🏆 No-Kill:`); noKill.slice(0, 20).forEach(r => console.log(`      ${r.liveReleaseRate}% | ${r.shelterName} (${r.county}) — intake: ${r.totalIntake}, euth: ${r.totalEuthanized}`)); if (noKill.length > 20) console.log(`      ... and ${noKill.length - 20} more`); }
    if (dryRun) { console.log(`\n✅ Dry run complete. ${qualifying.length} shelters ready.`); process.exit(0); }

    const prisma = await createPrismaClient();
    let created = 0, updated = 0;
    for (const r of qualifying) {
        const dbId = `scllr-${r.shelterName.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 60)}`;
        try {
            const existing = await (prisma as any).shelter.findUnique({ where: { id: dbId } });
            const data: Record<string, any> = { totalIntakeAnnual: r.totalIntake, totalEuthanizedAnnual: r.totalEuthanized, dataYear: 2023, dataSourceName: 'SC Board of Vet Med', dataSourceUrl: 'https://llr.sc.gov/vet/AnimalShelter.aspx', lastScrapedAt: new Date() };
            await (prisma as any).shelter.upsert({ where: { id: dbId }, update: data, create: { id: dbId, name: r.shelterName, county: r.county, state: 'SC', shelterType: 'MUNICIPAL', ...data } });
            if (existing) updated++; else created++;
        } catch (err) { console.error(`   ❌ ${r.shelterName}: ${(err as Error).message?.substring(0, 100)}`); }
    }
    console.log(`\n🏁 Done! Created: ${created} | Updated: ${updated}`);
    process.exit(0);
}
main();
