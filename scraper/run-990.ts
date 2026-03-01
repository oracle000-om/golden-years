/**
 * IRS Form 990 Financial Data Scraper
 *
 * Cross-references existing shelters against ProPublica's Nonprofit
 * Explorer API to pull IRS Form 990 financial data. Only processes
 * non-MUNICIPAL shelters (rescues, no-kills, foster-based) since
 * government-run shelters don't file 990s.
 *
 * Usage:
 *   npx tsx scraper/run-990.ts --dry-run        # preview matches
 *   npx tsx scraper/run-990.ts                  # save to DB
 *   npx tsx scraper/run-990.ts --state=FL       # limit to one state
 */

import 'dotenv/config';
import { readFileSync } from 'fs';
import { join } from 'path';
import { createPrismaClient } from './lib/prisma';
import {
    searchNonprofits,
    getOrganization,
    matchShelterToNonprofit,
    extractFilingHistory,
    type MatchedNonprofit,
} from './adapters/propublica';

const DELAY_MS = 500; // Polite rate limiting between API calls

// ── Load EIN overrides ─────────────────────────────────

function loadOverrides(): Record<string, string> {
    try {
        const raw = readFileSync(join(__dirname, 'config', '990-overrides.json'), 'utf-8');
        return JSON.parse(raw) as Record<string, string>;
    } catch {
        console.log('   ℹ No 990-overrides.json found, using auto-match only');
        return {};
    }
}

const delay = (ms: number) => new Promise(r => setTimeout(r, ms));

// ── Main ───────────────────────────────────────────────

async function main() {
    const args = process.argv.slice(2);
    const dryRun = args.includes('--dry-run');
    const stateArg = args.find(a => a.startsWith('--state='));
    const filterState = stateArg ? stateArg.split('=')[1]?.toUpperCase() : null;

    console.log('💰 Golden Years Club — IRS 990 Financial Data Scraper');
    console.log(`   Mode: ${dryRun ? 'DRY RUN' : 'LIVE'}`);
    if (filterState) console.log(`   State filter: ${filterState}`);
    console.log();

    const overrides = loadOverrides();
    const overrideCount = Object.keys(overrides).length;
    if (overrideCount > 0) {
        console.log(`   📋 Loaded ${overrideCount} EIN override(s)\n`);
    }

    const prisma = await createPrismaClient();

    // Load all non-municipal shelters
    const shelters = await prisma.shelter.findMany({
        where: {
            shelterType: { in: ['RESCUE', 'NO_KILL', 'FOSTER_BASED'] },
            ...(filterState ? { state: filterState } : {}),
        },
        select: {
            id: true,
            name: true,
            state: true,
            county: true,  // often stores city
            financials: { select: { id: true, ein: true, lastScrapedAt: true } },
        },
    });

    console.log(`   Found ${shelters.length} non-municipal shelter(s) to process\n`);

    let matched = 0;
    let created = 0;
    let updated = 0;
    let skipped = 0;
    let unmatched = 0;
    const unmatchedList: string[] = [];

    for (const shelter of shelters) {
        const label = `${shelter.name} (${shelter.state})`;

        // Skip if already has financials scraped in the last 30 days
        if (shelter.financials?.lastScrapedAt) {
            const daysSince = (Date.now() - new Date(shelter.financials.lastScrapedAt).getTime()) / 86400000;
            if (daysSince < 30) {
                skipped++;
                continue;
            }
        }

        let ein: string | null = null;
        let matchInfo: MatchedNonprofit | null = null;

        // Check overrides first
        if (overrides[shelter.id]) {
            ein = overrides[shelter.id];
            console.log(`   📋 ${label}: using override EIN ${ein}`);
        } else {
            // Search ProPublica
            try {
                const results = await searchNonprofits(shelter.name, shelter.state);
                await delay(DELAY_MS);

                matchInfo = matchShelterToNonprofit(
                    shelter.name,
                    shelter.county, // county field often stores city
                    results,
                );

                if (matchInfo) {
                    ein = matchInfo.ein;
                    console.log(`   ✅ ${label} → "${matchInfo.name}" (EIN: ${ein}, sim: ${matchInfo.similarity.toFixed(2)})`);
                } else {
                    unmatched++;
                    unmatchedList.push(`   ❌ ${label} — no match (${results.length} candidates)`);
                    if (dryRun) console.log(unmatchedList[unmatchedList.length - 1]);
                    continue;
                }
            } catch (err) {
                console.error(`   ⚠ ${label}: search failed — ${(err as Error).message?.substring(0, 80)}`);
                continue;
            }
        }

        matched++;

        // Fetch full organization data
        try {
            const orgData = await getOrganization(ein!);
            await delay(DELAY_MS);

            const filings = orgData.filings_with_data;
            if (filings.length === 0) {
                console.log(`   ⚠ ${label}: EIN ${ein} has no filing data`);
                continue;
            }

            const latest = filings[0];
            const filingHistory = extractFilingHistory(filings);

            const financialData = {
                ein: ein!,
                nteeCode: orgData.organization.ntee_code || null,
                taxPeriod: latest.tax_prd_yr,
                totalRevenue: latest.totrevenue,
                totalExpenses: latest.totfuncexpns,
                totalAssets: latest.totassetsend,
                totalLiabilities: latest.totliabend,
                netAssets: latest.totnetassetend,
                contributions: latest.totcntrbgfts,
                programRevenue: latest.totprgmrevnue,
                fundraisingExpense: latest.profndraising,
                officerCompensation: latest.compnsatncurrofcr,
                filingHistory: filingHistory,
                proPublicaUrl: `https://projects.propublica.org/nonprofits/organizations/${String(ein!).replace(/-/g, '')}`,
                lastScrapedAt: new Date(),
            };

            if (dryRun) {
                const pctProgram = latest.totfuncexpns > 0
                    ? Math.round((latest.totprgmrevnue / latest.totfuncexpns) * 100)
                    : 0;
                console.log([
                    `      📊 Tax year: ${latest.tax_prd_yr}`,
                    `         Revenue:  $${latest.totrevenue?.toLocaleString()}`,
                    `         Expenses: $${latest.totfuncexpns?.toLocaleString()}`,
                    `         Assets:   $${latest.totassetsend?.toLocaleString()}`,
                    `         Program %: ${pctProgram}%`,
                    `         Filings:  ${filings.length} years of data`,
                ].join('\n'));
            } else {
                await prisma.shelterFinancials.upsert({
                    where: { shelterId: shelter.id },
                    create: {
                        shelterId: shelter.id,
                        ...financialData,
                    },
                    update: financialData,
                });

                if (shelter.financials) {
                    updated++;
                } else {
                    created++;
                }
                console.log(`      💾 Saved: $${latest.totrevenue?.toLocaleString()} revenue, ${filings.length} years`);
            }
        } catch (err) {
            console.error(`   ⚠ ${label}: org fetch failed — ${(err as Error).message?.substring(0, 80)}`);
        }
    }

    // ── Summary ────────────────────────────────────────

    console.log('\n═══════════════════════════════════════════');
    console.log('📊 Results');
    console.log('═══════════════════════════════════════════');
    console.log(`   Shelters processed: ${shelters.length}`);
    console.log(`   Matched to 990:     ${matched}`);
    console.log(`   Unmatched:          ${unmatched}`);
    console.log(`   Skipped (fresh):    ${skipped}`);
    if (!dryRun) {
        console.log(`   Created:            ${created}`);
        console.log(`   Updated:            ${updated}`);
    }

    if (unmatchedList.length > 0 && !dryRun) {
        console.log('\n── Unmatched Shelters (add to 990-overrides.json) ──');
        for (const line of unmatchedList) {
            console.log(line);
        }
    }

    console.log('\n✅ Done!');
    await prisma.$disconnect();
    process.exit(0);
}

main().catch(async (err) => {
    console.error('Fatal:', err);
    process.exit(1);
});
