/**
 * Run Best Friends Dashboard Import
 *
 * Attempts to fetch Best Friends lifesaving data (save rate + no-kill status)
 * and match to existing shelters by name + state.
 *
 * Usage:
 *   npx tsx scraper/run-best-friends.ts                    # auto-fetch
 *   npx tsx scraper/run-best-friends.ts --csv path/to.csv  # from CSV file
 *   npx tsx scraper/run-best-friends.ts --dry-run          # preview
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
    const csvIdx = process.argv.indexOf('--csv');
    const csvPath = csvIdx >= 0 ? process.argv[csvIdx + 1] : null;

    console.log(`🐾 Golden Years Club — Best Friends Lifesaving Import${dryRun ? ' (DRY RUN)' : ''}`);

    let records: BestFriendsShelterId[] = [];

    if (csvPath) {
        // Parse from local CSV file
        console.log(`   📄 Loading from CSV: ${csvPath}`);
        const csvText = readFileSync(csvPath, 'utf-8');
        records = parseBestFriendsCsv(csvText);
        console.log(`   ✅ ${records.length} shelters parsed from CSV`);
    } else {
        // Auto-fetch
        records = await fetchBestFriendsData();
    }

    if (records.length === 0) {
        console.log(`\n   ℹ No Best Friends data available yet.`);
        console.log(`   To load data manually:`);
        console.log(`     1. Download the annual national dataset from bestfriends.org`);
        console.log(`     2. Convert to CSV with columns: Name, City, State, SaveRate, LiveIntakes, NonLiveOutcomes, Year`);
        console.log(`     3. Run: npx tsx scraper/run-best-friends.ts --csv path/to/data.csv`);
        return;
    }

    const prisma = await createPrismaClient();

    // ── Load existing shelters for matching ──
    const shelters = await prisma.shelter.findMany({
        select: { id: true, name: true, state: true },
    });

    console.log(`   📋 ${shelters.length} existing shelters to match against`);

    // Build lookup by normalized name + state
    const shelterMap = new Map<string, typeof shelters[0]>();
    for (const s of shelters) {
        const key = `${normalizeName(s.name)}|${s.state.toUpperCase()}`;
        shelterMap.set(key, s);
    }

    // ── Match and update ──
    let matched = 0;
    let unmatched = 0;

    for (const rec of records) {
        const key = `${normalizeName(rec.shelterName)}|${rec.state}`;
        const shelter = shelterMap.get(key);

        if (!shelter) {
            unmatched++;
            if (dryRun && unmatched <= 10) {
                console.log(`   ⚪ No match: "${rec.shelterName}" (${rec.city}, ${rec.state}) — save rate ${(rec.saveRate * 100).toFixed(1)}%`);
            }
            continue;
        }

        matched++;

        if (dryRun) {
            console.log(`   ✅ Match: "${rec.shelterName}" → ${shelter.name} — ${rec.noKillStatus} (${(rec.saveRate * 100).toFixed(1)}%)`);
            continue;
        }

        await prisma.shelter.update({
            where: { id: shelter.id },
            data: {
                bestFriendsSaveRate: Math.round(rec.saveRate * 1000) / 1000,
                noKillStatus: rec.noKillStatus,
                bestFriendsDataYear: rec.dataYear,
            },
        });
    }

    console.log(`\n🏁 Best Friends import complete`);
    console.log(`   ✅ ${matched} shelters matched and updated`);
    console.log(`   ⚪ ${unmatched} unmatched Best Friends entries`);

    await prisma.$disconnect();
}

main().catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
});
