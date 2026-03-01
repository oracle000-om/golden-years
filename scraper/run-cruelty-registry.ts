/**
 * Run Cruelty Registry Scraper
 *
 * Fetches aggregate counts from state animal cruelty registries.
 * NO PII is stored — only counts by jurisdiction and offense type.
 *
 * Sources:
 *   - Tennessee Bureau of Investigation (TBI) registry
 *   - NYC Health Department Animal Abuse Registry
 *   - Albany, Suffolk, Rockland county registries
 *
 * Usage:
 *   npx tsx scraper/run-cruelty-registry.ts              # full scrape
 *   npx tsx scraper/run-cruelty-registry.ts --dry-run    # preview only
 */

import 'dotenv/config';
import { createPrismaClient } from './lib/prisma';

interface RegistryData {
    state: string;
    jurisdiction: string | null;
    registrySource: string;
    offenseType: string;
    count: number;
    isActive: boolean;
}

async function scrapeTennessee(): Promise<RegistryData[]> {
    console.log(`   📡 Fetching Tennessee TBI registry...`);
    try {
        const res = await fetch('https://www.tn.gov/tbi/general-information/tennessee-animal-abuse-registry.html', {
            headers: { 'User-Agent': 'Mozilla/5.0 (compatible; GoldenYearsBot/1.0)' },
        });
        if (!res.ok) throw new Error(`TN fetch: ${res.status}`);
        const html = await res.text();

        // Count entries on the page by looking for rows/entries
        // TN registry lists name + photo + offense — we only count
        const entryRegex = /class="[^"]*registry[^"]*entry|<tr[^>]*>\s*<td/gi;
        const matches = html.match(entryRegex);
        const count = matches ? matches.length : 0;

        // Try to extract offense type counts from page content
        const fightingCount = (html.match(/fight/gi) || []).length;
        const crueltyCount = (html.match(/cruel|aggravat/gi) || []).length;

        const entries: RegistryData[] = [];
        if (fightingCount > 0) {
            entries.push({
                state: 'TN', jurisdiction: null, registrySource: 'TN_TBI',
                offenseType: 'FIGHTING', count: Math.max(1, Math.floor(fightingCount / 2)),
                isActive: true,
            });
        }
        if (crueltyCount > 0 || count > 0) {
            entries.push({
                state: 'TN', jurisdiction: null, registrySource: 'TN_TBI',
                offenseType: 'AGGRAVATED_CRUELTY', count: Math.max(count, crueltyCount),
                isActive: true,
            });
        }

        console.log(`      TN: ${entries.reduce((s, e) => s + e.count, 0)} entries found`);
        return entries;
    } catch (err: any) {
        console.log(`      ⚠️  TN scrape failed: ${err.message}`);
        return [];
    }
}

async function scrapeNycRegistry(): Promise<RegistryData[]> {
    console.log(`   📡 Fetching NYC Health Dept registry info...`);
    try {
        const res = await fetch('https://www.nyc.gov/site/doh/health/health-topics/animal-abuse-registry.page', {
            headers: { 'User-Agent': 'Mozilla/5.0 (compatible; GoldenYearsBot/1.0)' },
        });
        if (!res.ok) throw new Error(`NYC fetch: ${res.status}`);
        const html = await res.text();

        // NYC doesn't expose the full list publicly — extract what we can
        const countMatch = html.match(/(\d+)\s*(?:individuals?|people|persons?|registr)/i);
        const count = countMatch ? parseInt(countMatch[1], 10) : 0;

        const entries: RegistryData[] = [];
        if (count > 0) {
            entries.push({
                state: 'NY', jurisdiction: 'New York City', registrySource: 'NYC_HEALTH',
                offenseType: 'CRUELTY', count, isActive: true,
            });
        }

        console.log(`      NYC: ${count} entries found`);
        return entries;
    } catch (err: any) {
        console.log(`      ⚠️  NYC scrape failed: ${err.message}`);
        return [];
    }
}

// Known registries we can't scrape but can track existence of
function getKnownRegistries(): RegistryData[] {
    return [
        { state: 'NY', jurisdiction: 'Albany County', registrySource: 'ALBANY_COUNTY', offenseType: 'CRUELTY', count: 0, isActive: true },
        { state: 'NY', jurisdiction: 'Suffolk County', registrySource: 'SUFFOLK_COUNTY', offenseType: 'CRUELTY', count: 0, isActive: true },
        { state: 'NY', jurisdiction: 'Rockland County', registrySource: 'ROCKLAND_COUNTY', offenseType: 'CRUELTY', count: 0, isActive: true },
        { state: 'NY', jurisdiction: 'Livingston County', registrySource: 'LIVINGSTON_COUNTY', offenseType: 'CRUELTY', count: 0, isActive: true },
    ];
}

async function main() {
    const dryRun = process.argv.includes('--dry-run');
    console.log(`🔍 Golden Years Club — Cruelty Registry Scraper${dryRun ? ' (DRY RUN)' : ''}`);
    console.log(`   ⚠️  No PII stored — aggregate counts only\n`);

    const allEntries: RegistryData[] = [];
    allEntries.push(...await scrapeTennessee());
    allEntries.push(...await scrapeNycRegistry());
    allEntries.push(...getKnownRegistries());

    console.log(`\n📊 Total: ${allEntries.length} registry entries across ${new Set(allEntries.map(e => e.state)).size} states`);

    if (dryRun) {
        for (const e of allEntries) {
            console.log(`   ${e.state}${e.jurisdiction ? ` (${e.jurisdiction})` : ''} — ${e.registrySource} — ${e.offenseType}: ${e.count}`);
        }
        return;
    }

    const prisma = await createPrismaClient();
    let created = 0, errors = 0;

    for (const entry of allEntries) {
        try {
            // Use findFirst + create/update since we don't have a natural unique key
            const existing = await prisma.crueltyRegistryEntry.findFirst({
                where: {
                    state: entry.state,
                    jurisdiction: entry.jurisdiction,
                    registrySource: entry.registrySource,
                    offenseType: entry.offenseType,
                },
            });

            if (existing) {
                await prisma.crueltyRegistryEntry.update({
                    where: { id: existing.id },
                    data: {
                        count: entry.count,
                        isActive: entry.isActive,
                        lastScrapedAt: new Date(),
                    },
                });
            } else {
                await prisma.crueltyRegistryEntry.create({
                    data: {
                        state: entry.state,
                        jurisdiction: entry.jurisdiction,
                        registrySource: entry.registrySource,
                        offenseType: entry.offenseType,
                        count: entry.count,
                        isActive: entry.isActive,
                    },
                });
            }
            created++;
        } catch (err: any) {
            errors++;
            if (errors <= 3) console.log(`   ❌ ${entry.state}: ${err.message?.substring(0, 80)}`);
        }
    }

    console.log(`\n🏁 Cruelty registry scrape complete — ${created} upserted, ${errors} errors`);
    await prisma.$disconnect();
}

main().catch(err => { console.error('Fatal:', err); process.exit(1); });
