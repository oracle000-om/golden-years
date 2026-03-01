/**
 * Run New Jersey — NJDOH Annual Shelter/Pound Survey
 *
 * Usage:
 *   npx tsx scraper/run-new-jersey.ts --dry-run
 *   npx tsx scraper/run-new-jersey.ts --min-intake 100
 */
import 'dotenv/config';
import { createPrismaClient } from './lib/prisma';
import { getNewJerseyStats } from './adapters/new-jersey-njdoh';

async function main() {
    const dryRun = process.argv.includes('--dry-run');
    const minIntakeIdx = process.argv.indexOf('--min-intake');
    const minIntake = minIntakeIdx >= 0 ? parseInt(process.argv[minIntakeIdx + 1], 10) : 50;

    console.log(`🗽  Golden Years Club — New Jersey NJDOH Stats${dryRun ? ' (DRY RUN)' : ''}`);
    console.log(`   Source: NJ Dept. of Health — Annual Pound/Shelter Survey`);
    console.log(`   Year: 2024 | Min intake: ${minIntake}\n`);

    const reports = getNewJerseyStats();
    const qualifying = reports.filter(r => r.totalIntake >= minIntake);
    const noKill = qualifying.filter(r => r.liveReleaseRate >= 90);
    console.log(`   Total: ${reports.length} | Qualifying: ${qualifying.length} | No-kill: ${noKill.length}\n`);

    if (noKill.length > 0) { console.log(`   🏆 No-Kill:`); noKill.slice(0, 20).forEach(r => console.log(`      ${r.liveReleaseRate}% | ${r.shelterName} (${r.county}) — intake: ${r.totalIntake}, euth: ${r.totalEuthanized}`)); if (noKill.length > 20) console.log(`      ... and ${noKill.length - 20} more`); }
    if (dryRun) { console.log(`\n✅ Dry run complete. ${qualifying.length} shelters ready.`); process.exit(0); }

    const prisma = await createPrismaClient();
    let created = 0, updated = 0;
    for (const r of qualifying) {
        const dbId = `njdoh-${r.shelterName.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 60)}`;
        try {
            const existing = await prisma.shelter.findUnique({ where: { id: dbId } });
            const data: Record<string, any> = { totalIntakeAnnual: r.totalIntake, totalEuthanizedAnnual: r.totalEuthanized, dataYear: 2024, dataSourceName: 'NJ Dept. of Health', dataSourceUrl: 'https://www.nj.gov/health/vph/documents/shelter_pound_county_detailed_2024.pdf', lastScrapedAt: new Date() };
            await prisma.shelter.upsert({ where: { id: dbId }, update: data, create: { id: dbId, name: r.shelterName, county: r.county, state: 'NJ', shelterType: 'MUNICIPAL', ...data } });
            if (existing) updated++; else created++;
        } catch (err) { console.error(`   ❌ ${r.shelterName}: ${(err as Error).message?.substring(0, 100)}`); }
    }
    console.log(`\n🏁 Done! Created: ${created} | Updated: ${updated}`);
    process.exit(0);
}
main();
