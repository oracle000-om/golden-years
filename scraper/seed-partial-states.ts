/**
 * Seed Partial Data States — Update StatePolicy records for states
 * with limited or no standardized animal shelter data availability.
 *
 * Usage:
 *   npx tsx scraper/seed-partial-states.ts
 *   npx tsx scraper/seed-partial-states.ts --dry-run
 */
import 'dotenv/config';
import { createPrismaClient } from './lib/prisma';

interface PartialStateInfo {
    state: string;
    stateName: string;
    mandatoryReporting: boolean;
    reportingBody: string | null;
    reportingUrl: string | null;
    policyNotes: string;
}

const PARTIAL_DATA_STATES: PartialStateInfo[] = [
    {
        state: 'MN',
        stateName: 'Minnesota',
        mandatoryReporting: false,
        reportingBody: null,
        reportingUrl: null,
        policyNotes: 'Dog and Cat Data Transparency Bill was in 2024 legislative session. If passed, data may now be publicly available through a state portal. No confirmed public data source as of Feb 2025.',
    },
    {
        state: 'PA',
        stateName: 'Pennsylvania',
        mandatoryReporting: false,
        reportingBody: 'PA Dept. of Agriculture',
        reportingUrl: 'https://www.agriculture.pa.gov',
        policyNotes: 'No statewide intake/outcome reporting mandate. Kennel licensing data available through Bureau of Dog Law Enforcement, but does not include shelter statistics. Individual shelters report voluntarily.',
    },
    {
        state: 'OH',
        stateName: 'Ohio',
        mandatoryReporting: false,
        reportingBody: null,
        reportingUrl: null,
        policyNotes: 'No statewide mandate for shelter data reporting. Individual shelters report voluntarily. County-level dog wardens maintain records but no centralized state database.',
    },
    {
        state: 'WA',
        stateName: 'Washington',
        mandatoryReporting: false,
        reportingBody: null,
        reportingUrl: null,
        policyNotes: '2024 state assessment found "lack of regulatory oversight" for animal shelters. No standardized data reporting system. Individual shelters and municipalities maintain their own records.',
    },
    {
        state: 'MA',
        stateName: 'Massachusetts',
        mandatoryReporting: false,
        reportingBody: 'MA Dept. of Agricultural Resources',
        reportingUrl: 'https://www.mass.gov/orgs/department-of-agricultural-resources',
        policyNotes: 'Ollie\'s Law (2024) established licensing requirements for animal shelters but does NOT mandate intake/outcome reporting. Licensing data available but no shelter statistics.',
    },
    {
        state: 'WI',
        stateName: 'Wisconsin',
        mandatoryReporting: false,
        reportingBody: 'WI Dept. of Agriculture',
        reportingUrl: 'https://datcp.wi.gov',
        policyNotes: 'Licensed shelters maintain records per state requirements, but there is no public reporting mandate. No centralized state database of shelter statistics.',
    },
    {
        state: 'CA',
        stateName: 'California',
        mandatoryReporting: false,
        reportingBody: null,
        reportingUrl: null,
        policyNotes: 'AB 631 (proposed statewide shelter data reporting) was introduced but NOT passed. Shelter data remains voluntary. Some counties (LA, Orange, Sacramento) publish data on open data portals (Socrata) — already integrated via opendata pipeline.',
    },
];

async function main() {
    const dryRun = process.argv.includes('--dry-run');

    console.log(`📊  Golden Years Club — Partial Data States Policy Update${dryRun ? ' (DRY RUN)' : ''}`);
    console.log(`   Updating StatePolicy records for ${PARTIAL_DATA_STATES.length} states with limited data\n`);

    for (const s of PARTIAL_DATA_STATES) {
        console.log(`   📋 ${s.state} (${s.stateName})`);
        console.log(`      Mandatory: ${s.mandatoryReporting ? '✅' : '❌'} | Body: ${s.reportingBody || 'None'}`);
        console.log(`      Notes: ${s.policyNotes.substring(0, 100)}...`);
    }

    if (dryRun) {
        console.log(`\n✅ Dry run complete. ${PARTIAL_DATA_STATES.length} states ready to update.`);
        process.exit(0);
    }

    const prisma = await createPrismaClient();
    let created = 0, updated = 0;

    for (const s of PARTIAL_DATA_STATES) {
        try {
            const existing = await (prisma as any).statePolicy.findUnique({ where: { state: s.state } });
            const data: Record<string, any> = {
                mandatoryReporting: s.mandatoryReporting,
                reportingBody: s.reportingBody,
                reportingUrl: s.reportingUrl,
                policyNotes: s.policyNotes,
                lastScrapedAt: new Date(),
            };

            await (prisma as any).statePolicy.upsert({
                where: { state: s.state },
                update: data,
                create: {
                    state: s.state,
                    stateName: s.stateName,
                    ...data,
                },
            });

            if (existing) updated++; else created++;
        } catch (err) {
            console.error(`   ❌ ${s.state}: ${(err as Error).message?.substring(0, 100)}`);
        }
    }

    console.log(`\n🏁 Done! Created: ${created} | Updated: ${updated}`);
    process.exit(0);
}

main();
