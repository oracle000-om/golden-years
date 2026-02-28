/**
 * Run Best Friends Dashboard Import
 *
 * Scrapes the Best Friends Pet Lifesaving Dashboard (Tableau)
 * to extract save rates for ~10,000 shelters across all 51 state pages,
 * then matches them to existing shelters in the database.
 *
 * Uses Playwright for headless browser automation against the
 * Tableau dashboard at 10ay.bestfriends.org.
 *
 * Usage:
 *   npx tsx scraper/run-best-friends.ts                    # all states
 *   npx tsx scraper/run-best-friends.ts --state WY         # single state
 *   npx tsx scraper/run-best-friends.ts --dry-run          # preview
 *   npx tsx scraper/run-best-friends.ts --headful          # show browser
 *   npx tsx scraper/run-best-friends.ts --csv path/to.csv  # from CSV file
 */

import 'dotenv/config';
import { createPrismaClient } from './lib/prisma';
import { fetchBestFriendsData, parseBestFriendsCsv, type BestFriendsShelterId } from './adapters/best-friends';
import { readFileSync } from 'fs';

/** Normalize shelter name for fuzzy matching */
function normalizeName(name: string): string {
    return name
        .toLowerCase()
        .replace(/['']/g, '')
        .replace(/\b(the|of|and|for|at|in)\b/g, '')
        .replace(/\b(animal|shelter|humane|society|county|city|rescue|services|center|centre|spca)\b/g, match => match)
        .replace(/[^a-z0-9 ]/g, '')
        .replace(/\s+/g, ' ')
        .trim();
}

async function main() {
    const dryRun = process.argv.includes('--dry-run');
    const headful = process.argv.includes('--headful');
    const csvIdx = process.argv.indexOf('--csv');
    const csvPath = csvIdx >= 0 ? process.argv[csvIdx + 1] : null;
    const stateIdx = process.argv.indexOf('--state');
    const stateFilter = stateIdx >= 0 ? process.argv[stateIdx + 1] : undefined;

    console.log(`🐾 Golden Years Club — Best Friends Lifesaving Import${dryRun ? ' (DRY RUN)' : ''}`);
    if (stateFilter) console.log(`   🗺️  State filter: ${stateFilter.toUpperCase()}`);

    let records: BestFriendsShelterId[] = [];

    if (csvPath) {
        // ── CSV import path (manual fallback) ──
        console.log(`   📄 Loading from CSV: ${csvPath}`);
        const csvText = readFileSync(csvPath, 'utf-8');
        records = parseBestFriendsCsv(csvText);
        console.log(`   ✅ ${records.length} shelters parsed from CSV`);
    } else {
        // ── Tableau dashboard scrape ──
        let chromium;
        try {
            const pw = await import('playwright-core');
            chromium = pw.chromium;
        } catch {
            console.error(`   ❌ Playwright not available. Install with: npx playwright install chromium`);
            console.error(`   Alternatively, use --csv path/to/data.csv for manual import.`);
            process.exit(1);
        }

        console.log(`   🌐 Launching ${headful ? 'visible' : 'headless'} browser...`);
        const browser = await chromium.launch({ headless: !headful });

        try {
            records = await fetchBestFriendsData(browser, stateFilter);
        } finally {
            await browser.close();
            console.log(`   🌐 Browser closed`);
        }
    }

    if (records.length === 0) {
        console.log(`\n   ℹ No Best Friends data extracted.`);
        console.log(`   Troubleshooting:`);
        console.log(`     1. Ensure Playwright is installed: npx playwright install chromium`);
        console.log(`     2. Try with --headful to see what the browser sees`);
        console.log(`     3. Try a single state: --state WY`);
        console.log(`     4. Use manual CSV: --csv path/to/data.csv`);
        process.exit(0);
    }

    const prisma = await createPrismaClient();

    // ── Load existing shelters for matching ──
    const shelters = await prisma.shelter.findMany({
        select: { id: true, name: true, state: true },
    });

    console.log(`\n   📋 ${shelters.length} existing shelters to match against`);

    // Build lookup by normalized name + state
    const shelterMap = new Map<string, typeof shelters[0]>();
    for (const s of shelters) {
        const key = `${normalizeName(s.name)}|${s.state.toUpperCase()}`;
        shelterMap.set(key, s);
    }

    // ── Match and update ──
    let matched = 0;
    let unmatched = 0;
    let withRate = 0;

    for (const rec of records) {
        const key = `${normalizeName(rec.shelterName)}|${rec.state}`;
        const shelter = shelterMap.get(key);

        if (!shelter) {
            unmatched++;
            if (dryRun && unmatched <= 10) {
                const rateStr = rec.saveRate > 0 ? ` — save rate ${(rec.saveRate * 100).toFixed(1)}%` : '';
                console.log(`   ⚪ No match: "${rec.shelterName}" (${rec.city}, ${rec.state})${rateStr}`);
            }
            continue;
        }

        matched++;
        if (rec.saveRate > 0) withRate++;

        if (dryRun) {
            const rateStr = rec.saveRate > 0 ? `${(rec.saveRate * 100).toFixed(1)}%` : 'N/A';
            console.log(`   ✅ Match: "${rec.shelterName}" → ${shelter.name} — ${rec.noKillStatus} (${rateStr})`);
            continue;
        }

        // Only update if we have rate data
        if (rec.saveRate > 0) {
            await prisma.shelter.update({
                where: { id: shelter.id },
                data: {
                    bestFriendsSaveRate: Math.round(rec.saveRate * 1000) / 1000,
                    noKillStatus: rec.noKillStatus,
                    bestFriendsDataYear: rec.dataYear,
                },
            });
        }
    }

    console.log(`\n🏁 Best Friends import complete`);
    console.log(`   📊 ${records.length} total shelters scraped from dashboard`);
    console.log(`   ✅ ${matched} shelters matched to database (${withRate} with save rates)`);
    console.log(`   ⚪ ${unmatched} unmatched Best Friends entries`);

    await prisma.$disconnect();
}

main().catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
});
