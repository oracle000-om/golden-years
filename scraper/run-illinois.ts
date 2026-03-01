/**
 * Run Illinois — IDOA Animal Shelter Statistics
 *
 * Usage:
 *   npx tsx scraper/run-illinois.ts --dry-run
 *   npx tsx scraper/run-illinois.ts --min-intake 100
 */
import 'dotenv/config';
import { createPrismaClient } from './lib/prisma';
import { getIllinoisStats } from './adapters/illinois-idoa';

async function main() {
    const dryRun = process.argv.includes('--dry-run');
    const minIntakeIdx = process.argv.indexOf('--min-intake');
    const minIntake = minIntakeIdx >= 0 ? parseInt(process.argv[minIntakeIdx + 1], 10) : 50;

    console.log(`🌽  Golden Years Club — Illinois IDOA Stats${dryRun ? ' (DRY RUN)' : ''}`);
    console.log(`   Source: Illinois Dept. of Agriculture — Animal Welfare Act (225 ILCS 605/7)`);
    console.log(`   Year: FY 2024 | Min intake: ${minIntake}\n`);

    const reports = getIllinoisStats();
    const qualifying = reports.filter(r => r.totalIntake >= minIntake);
    const noKill = qualifying.filter(r => r.liveReleaseRate >= 90);
    console.log(`   Total: ${reports.length} | Qualifying (≥${minIntake}): ${qualifying.length} | No-kill: ${noKill.length}\n`);

    if (noKill.length > 0) { console.log(`   🏆 No-Kill:`); noKill.slice(0, 20).forEach(r => console.log(`      ${r.liveReleaseRate}% | ${r.facilityName} (${r.city}) — intake: ${r.totalIntake}, euth: ${r.totalEuthanized}`)); if (noKill.length > 20) console.log(`      ... and ${noKill.length - 20} more`); }
    const below = qualifying.filter(r => r.liveReleaseRate < 90);
    if (below.length > 0) { console.log(`\n   📊 Below 90%:`); below.slice(0, 10).forEach(r => console.log(`      ${r.liveReleaseRate}% | ${r.facilityName} (${r.city}) — intake: ${r.totalIntake}, euth: ${r.totalEuthanized}`)); }
    if (dryRun) { console.log(`\n✅ Dry run complete. ${qualifying.length} shelters ready.`); process.exit(0); }

    const prisma = await createPrismaClient();
    let created = 0, updated = 0;
    for (const r of qualifying) {
        const dbId = `il-idoa-${r.facilityName.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 60)}`;
        try {
            const existing = await prisma.shelter.findUnique({ where: { id: dbId }, select: { totalIntakeAnnual: true, totalEuthanizedAnnual: true, dataYear: true } });
            const data: Record<string, any> = {
                totalIntakeAnnual: r.totalIntake, totalEuthanizedAnnual: r.totalEuthanized,
                totalReturnedToOwner: r.totalReturnedToOwner, totalTransferred: r.totalTransferred,
                dataYear: 2024, dataSourceName: 'Illinois IDOA',
                dataSourceUrl: 'https://agr.illinois.gov/animals/animal-welfare.html',
                lastScrapedAt: new Date(),
            };
            if (existing?.dataYear && existing.dataYear !== 2024 && existing.totalIntakeAnnual > 0) {
                data.priorYearIntake = existing.totalIntakeAnnual;
                data.priorYearEuthanized = existing.totalEuthanizedAnnual;
                data.priorDataYear = existing.dataYear;
            }
            await prisma.shelter.upsert({
                where: { id: dbId }, update: data,
                create: {
                    id: dbId, name: r.facilityName, county: r.city, state: 'IL',
                    shelterType: r.liveReleaseRate >= 90 ? 'NO_KILL' : 'MUNICIPAL', ...data,
                },
            });
            if (existing) updated++; else created++;
        } catch (err) { console.error(`   ❌ ${r.facilityName}: ${(err as Error).message?.substring(0, 100)}`); }
    }
    console.log(`\n🏁 Done! Created: ${created} | Updated: ${updated}`);
    process.exit(0);
}
main();
