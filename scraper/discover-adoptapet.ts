/**
 * Discover Adopt-a-Pet Shelters — Sequential ID Probing
 *
 * Scans Adopt-a-Pet shelter profile pages by sequential ID to discover
 * shelters with senior animals available for adoption.
 *
 * Approach:
 *   1. Probe shelter profile URLs: https://www.adoptapet.com/shelter/{id}
 *   2. Extract shelter name, city, state from the page
 *   3. Check the portable pet list widget for pet count
 *   4. Output new configs to merge into adoptapet-config.json
 *
 * Usage:
 *   npx tsx scraper/discover-adoptapet.ts                     # default range
 *   npx tsx scraper/discover-adoptapet.ts --start=1000 --end=6000   # custom range
 *   npx tsx scraper/discover-adoptapet.ts --dry-run           # preview only
 */

import { readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

// ── Types ──────────────────────────────────────────────

interface DiscoveredShelter {
    id: string;
    shelterName: string;
    adoptapetId: string;
    city: string;
    state: string;
    petCount: number;
}

interface ExistingConfig {
    id: string;
    shelterName: string;
    adoptapetId: string;
    city: string;
    state: string;
}

// ── Configuration ──────────────────────────────────────

const CONFIG_PATH = join(__dirname, 'config/adoptapet-config.json');
const CONCURRENCY = 5;  // parallel probes
const DELAY_MS = 300;   // between batches

// ── Probe Functions ────────────────────────────────────

async function probeShelter(shelterId: number): Promise<DiscoveredShelter | null> {
    const url = `https://www.adoptapet.com/shelter/${shelterId}`;

    try {
        const response = await fetch(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
                'Accept': 'text/html',
            },
            redirect: 'follow',
            signal: AbortSignal.timeout(10_000),
        });

        if (!response.ok) return null;

        const html = await response.text();

        // Check if this is a real shelter page (not an error/redirect)
        if (html.includes('Something went wrong') || html.includes('Page not found')) return null;

        // Extract shelter name from <title> or <h1>
        const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
        const title = titleMatch?.[1]?.trim() || '';
        if (!title || title.includes('Something went wrong')) return null;

        // Extract shelter name — title format varies:
        // "Shelter Name - Adopt-a-Pet"
        // "Dogs and Cats for Adoption at Shelter Name | Adopt-a-Pet.com"
        let shelterName = '';
        const nameMatch1 = title.match(/(?:at|from)\s+(.+?)(?:\s*\||\s*[-–])/i);
        const nameMatch2 = title.match(/^(.+?)(?:\s*[-–]\s*Adopt)/i);
        if (nameMatch1) {
            shelterName = nameMatch1[1].trim();
        } else if (nameMatch2) {
            shelterName = nameMatch2[1].trim();
        }
        if (!shelterName || shelterName.length < 3) return null;

        // Extract city/state — look for location text in the page
        // Pattern: "City, ST" or structured address
        let city = 'Unknown';
        let state = 'US';

        // Try meta description first
        const metaDesc = html.match(/name="description"\s+content="([^"]+)"/i)?.[1] || '';
        const locationMatch = metaDesc.match(/in\s+([A-Za-z\s]+),\s*([A-Z]{2})/);
        if (locationMatch) {
            city = locationMatch[1].trim();
            state = locationMatch[2];
        } else {
            // Try og:description
            const ogDesc = html.match(/property="og:description"\s+content="([^"]+)"/i)?.[1] || '';
            const ogLocMatch = ogDesc.match(/in\s+([A-Za-z\s]+),\s*([A-Z]{2})/);
            if (ogLocMatch) {
                city = ogLocMatch[1].trim();
                state = ogLocMatch[2];
            }
        }

        // Count pets by checking for pet links
        const petLinks = html.match(/adoptapet\.com\/pet\/\d+-/g) || [];
        const uniquePets = new Set(petLinks.map(l => l.match(/(\d+)-/)?.[1])).size;

        if (uniquePets === 0) return null;

        // Build a slug-safe ID
        const slug = shelterName
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-|-$/g, '')
            .substring(0, 40);

        return {
            id: slug,
            shelterName,
            adoptapetId: String(shelterId),
            city,
            state,
            petCount: uniquePets,
        };
    } catch {
        return null;
    }
}

// ── Main ───────────────────────────────────────────────

async function main() {
    const args = process.argv.slice(2);
    const dryRun = args.includes('--dry-run');

    // Parse range
    const startArg = args.find(a => a.startsWith('--start='));
    const endArg = args.find(a => a.startsWith('--end='));
    const start = startArg ? parseInt(startArg.split('=')[1], 10) : 1000;
    const end = endArg ? parseInt(endArg.split('=')[1], 10) : 6000;

    console.log(`🔍 Adopt-a-Pet Shelter Discovery`);
    console.log(`   Range: ${start} → ${end} (${end - start} shelter IDs)`);
    console.log(`   Dry run: ${dryRun}\n`);

    // Load existing config
    const existingRaw = readFileSync(CONFIG_PATH, 'utf-8');
    const existing: ExistingConfig[] = JSON.parse(existingRaw);
    const existingIds = new Set(existing.map(e => e.adoptapetId));
    console.log(`   Existing shelters: ${existing.length}`);
    console.log(`   Existing IDs: ${[...existingIds].join(', ')}\n`);

    // Probe in batches
    const discovered: DiscoveredShelter[] = [];
    let probed = 0;
    let found = 0;

    for (let i = start; i <= end; i += CONCURRENCY) {
        const batch = Array.from(
            { length: Math.min(CONCURRENCY, end - i + 1) },
            (_, j) => i + j
        );

        const results = await Promise.all(batch.map(id => probeShelter(id)));

        for (const result of results) {
            if (result && !existingIds.has(result.adoptapetId)) {
                discovered.push(result);
                found++;
                console.log(`   ✅ #${result.adoptapetId}: ${result.shelterName} (${result.city}, ${result.state}) — ${result.petCount} pets`);
            }
        }

        probed += batch.length;
        if (probed % 100 === 0) {
            console.log(`   ... probed ${probed}/${end - start}, found ${found} new shelters`);
        }

        // Rate limit between batches
        await new Promise(r => setTimeout(r, DELAY_MS));
    }

    console.log(`\n═══════════════════════════════════════════`);
    console.log(`📋 Discovery Results`);
    console.log(`═══════════════════════════════════════════`);
    console.log(`   Probed: ${probed} shelter IDs`);
    console.log(`   Discovered: ${discovered.length} new shelters`);
    console.log(`   Skipped: ${[...existingIds].length} already in config\n`);

    // Sort by pet count (descending) — prioritize high-volume shelters
    discovered.sort((a, b) => b.petCount - a.petCount);

    // Show top 50
    console.log(`   Top shelters by pet count:`);
    for (const s of discovered.slice(0, 50)) {
        console.log(`     ${s.adoptapetId}: ${s.shelterName} (${s.city}, ${s.state}) — ${s.petCount} pets`);
    }

    if (dryRun) {
        console.log(`\n✅ Dry run complete. ${discovered.length} shelters found.`);
        process.exit(0);
    }

    // Merge into config
    const newConfigs = discovered.map(s => ({
        id: s.id,
        shelterName: s.shelterName,
        adoptapetId: s.adoptapetId,
        city: s.city,
        state: s.state,
    }));
    const merged = [...existing, ...newConfigs];

    writeFileSync(CONFIG_PATH, JSON.stringify(merged, null, 4) + '\n');
    console.log(`\n✅ Config updated: ${merged.length} total shelters (${newConfigs.length} new)`);

    process.exit(0);
}

main();
