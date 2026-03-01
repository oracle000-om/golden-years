/**
 * Run VDACS — Virginia Animal Custody Records Stats
 *
 * Scrapes shelter statistics from Virginia's VDACS mandatory reporting system.
 * All releasing agencies in Virginia must report annually.
 *
 * Usage:
 *   npx tsx scraper/run-vdacs.ts              # full run (all agencies)
 *   npx tsx scraper/run-vdacs.ts --dry-run     # preview stats
 *   npx tsx scraper/run-vdacs.ts --year 2023   # specific year
 *   npx tsx scraper/run-vdacs.ts --public-only  # only public shelters
 *   npx tsx scraper/run-vdacs.ts --min-intake 100  # filter small agencies
 */

import 'dotenv/config';
import { createPrismaClient } from './lib/prisma';
import { fetchAgencyList, fetchAgencyReport, type VdacsShelterReport } from './adapters/vdacs';

async function main() {
    const dryRun = process.argv.includes('--dry-run');
    const publicOnly = process.argv.includes('--public-only');
    const yearArg = process.argv.find(a => a.startsWith('--year'))
    const year = yearArg
        ? parseInt(process.argv[process.argv.indexOf(yearArg) + 1], 10)
        : 2024;
    const minIntakeArg = process.argv.find(a => a.startsWith('--min-intake'));
    const minIntake = minIntakeArg
        ? parseInt(process.argv[process.argv.indexOf(minIntakeArg) + 1], 10)
        : 50; // Default: exclude tiny agencies

    console.log(`🏛️  Golden Years Club — Virginia VDACS Stats${dryRun ? ' (DRY RUN)' : ''}`);
    console.log(`   Source: Virginia Dept. of Agriculture & Consumer Services`);
    console.log(`   Year: ${year} | Min intake: ${minIntake}${publicOnly ? ' | Public shelters only' : ''}\n`);

    // Step 1: Get list of all agencies
    console.log('📋 Fetching agency list...');
    const agencies = await fetchAgencyList(year);
    console.log(`   Found ${agencies.length} agencies for ${year}\n`);

    // Step 2: Fetch individual reports
    const reports: VdacsShelterReport[] = [];
    let fetched = 0;
    let errors = 0;

    for (const agency of agencies) {
        try {
            const report = await fetchAgencyReport(agency.sysFacNo, year);
            fetched++;

            if (report) {
                // Filter by type if requested
                if (publicOnly && !report.agencyType.toLowerCase().includes('public')) {
                    continue;
                }

                // Filter by minimum intake
                if (report.totalIntake < minIntake) continue;

                reports.push(report);
            }

            // Progress
            if (fetched % 50 === 0) {
                console.log(`   ... ${fetched}/${agencies.length} fetched, ${reports.length} qualifying`);
            }

            // Rate limit — be polite
            await new Promise(r => setTimeout(r, 200));
        } catch (err) {
            errors++;
            if (errors <= 5) {
                console.error(`   ❌ ${agency.name} (${agency.sysFacNo}): ${(err as Error).message?.substring(0, 80)}`);
            }
        }
    }

    console.log(`\n📊 Fetched ${fetched} reports, ${reports.length} qualifying (intake ≥ ${minIntake})\n`);

    // Sort by live release rate desc
    reports.sort((a, b) => b.liveReleaseRate - a.liveReleaseRate);

    // Show stats
    const noKill = reports.filter(r => r.liveReleaseRate >= 90);
    console.log(`═══════════════════════════════════════════`);
    console.log(`📈 Virginia Shelter Statistics — ${year}`);
    console.log(`═══════════════════════════════════════════`);
    console.log(`   Qualifying agencies: ${reports.length}`);
    console.log(`   No-kill (≥90% LRR): ${noKill.length}`);
    console.log(`   Below 90%: ${reports.length - noKill.length}\n`);

    if (noKill.length > 0) {
        console.log(`   🏆 No-Kill Shelters:`);
        for (const r of noKill.slice(0, 20)) {
            console.log(`      ${r.liveReleaseRate}% | ${r.agencyName} (${r.city || r.county}) — intake: ${r.totalIntake}, euth: ${r.totalEuthanized}`);
        }
        if (noKill.length > 20) console.log(`      ... and ${noKill.length - 20} more`);
    }

    console.log(`\n   📊 Sample below 90%:`);
    const below90 = reports.filter(r => r.liveReleaseRate < 90);
    for (const r of below90.slice(0, 10)) {
        console.log(`      ${r.liveReleaseRate}% | ${r.agencyName} (${r.city || r.county}) — intake: ${r.totalIntake}, euth: ${r.totalEuthanized}`);
    }

    if (dryRun) {
        console.log(`\n✅ Dry run complete. ${reports.length} agencies ready to import.`);
        process.exit(0);
    }

    // Step 3: Upsert into DB
    console.log(`\n💾 Writing ${reports.length} shelter stats to database...`);
    const prisma = await createPrismaClient();
    let created = 0;
    let updated = 0;

    for (const report of reports) {
        const dbId = `vdacs-${report.sysFacNo}`;
        try {
            // Store prior year data before updating
            const existing = await prisma.shelter.findUnique({
                where: { id: dbId },
                select: { totalIntakeAnnual: true, totalEuthanizedAnnual: true, dataYear: true },
            });

            const data: Record<string, any> = {
                totalIntakeAnnual: report.totalIntake,
                totalEuthanizedAnnual: report.totalEuthanized,
                dataYear: report.reportYear,
                dataSourceName: 'Virginia VDACS',
                dataSourceUrl: `https://arr.vdacs.virginia.gov/PublicReports/ViewReport?SysFacNo=${report.sysFacNo}&Calendar_Year=${report.reportYear}`,
                lastScrapedAt: new Date(),
            };

            // If existing has different year data, save as prior year
            if (existing && existing.dataYear && existing.dataYear !== report.reportYear && existing.totalIntakeAnnual > 0) {
                data.priorYearIntake = existing.totalIntakeAnnual;
                data.priorYearEuthanized = existing.totalEuthanizedAnnual;
                data.priorDataYear = existing.dataYear;
            }

            const result = await prisma.shelter.upsert({
                where: { id: dbId },
                update: data,
                create: {
                    id: dbId,
                    name: report.agencyName,
                    county: report.city || report.county,
                    state: 'VA',
                    shelterType: report.liveReleaseRate >= 90 ? 'NO_KILL' : 'MUNICIPAL',
                    ...data,
                },
            });

            if (existing) updated++;
            else created++;
        } catch (err) {
            console.error(`   ❌ ${report.agencyName}: ${(err as Error).message?.substring(0, 100)}`);
        }
    }

    console.log(`\n🏁 Done!`);
    console.log(`   Created: ${created} | Updated: ${updated}`);
    console.log(`   No-kill shelters: ${noKill.length}`);
    console.log(`   Total with data: ${reports.length}`);
    process.exit(0);
}

main();
