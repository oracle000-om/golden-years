/**
 * Discover ShelterLuv Organizations — Sequential ID Probing
 *
 * Scans ShelterLuv's public API by sequential org ID to discover
 * shelters with animals available for adoption.
 *
 * API: https://new.shelterluv.com/api/v3/available-animals/{orgId}
 *   - Valid org → 200 + {"animals": [...], "show": {...}}
 *   - Invalid org → 404 + []
 *
 * Usage:
 *   npx tsx scraper/discover-shelterluv.ts --dry-run                 # batch 1 (1-500)
 *   npx tsx scraper/discover-shelterluv.ts --start=500 --end=5000    # batch 2
 *   npx tsx scraper/discover-shelterluv.ts --start=5000 --end=15000  # batch 3
 */

import { readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

// ── Types ──────────────────────────────────────────────

interface DiscoveredOrg {
    orgId: string;
    shelterName: string;
    city: string;
    state: string;
    animalCount: number;
    dogs: number;
    cats: number;
}

interface ExistingConfig {
    id: string;
    shelterName: string;
    orgId: string;
    city: string;
    state: string;
}

interface ShelterLuvAnimal {
    name?: string;
    species?: string;
    location?: string;
    [key: string]: unknown;
}

// ── Config ─────────────────────────────────────────────

const CONFIG_PATH = join(__dirname, 'config/shelterluv-config.json');
const API_BASE = 'https://new.shelterluv.com/api/v3/available-animals';
const CONCURRENCY = 10;
const BATCH_DELAY_MS = 200;

// ── Probe ──────────────────────────────────────────────

async function probeOrg(orgId: number): Promise<DiscoveredOrg | null> {
    try {
        const response = await fetch(`${API_BASE}/${orgId}`, {
            headers: { 'Accept': 'application/json' },
            signal: AbortSignal.timeout(8_000),
        });

        if (response.status === 404) return null;
        if (!response.ok) return null;

        const data = await response.json() as {
            animals?: ShelterLuvAnimal[];
            show?: Record<string, unknown>;
        };

        const animals = data.animals || [];
        if (animals.length === 0) return null;

        // Extract shelter name from first animal's location or from show config
        let shelterName = 'Unknown';
        let city = 'Unknown';
        let state = 'US';

        // Try to get location from animals
        const locations = animals
            .map(a => a.location)
            .filter((l): l is string => !!l && l.length > 2);

        if (locations.length > 0) {
            // Most common location = shelter name
            const freq = new Map<string, number>();
            for (const l of locations) freq.set(l, (freq.get(l) || 0) + 1);
            shelterName = [...freq.entries()].sort((a, b) => b[1] - a[1])[0][0];
        }

        // Try to parse city/state from shelter name or embedded page
        // Some locations include city info like "Main Building - City, ST"
        const cityStateMatch = shelterName.match(/[-–]\s*([A-Za-z\s]+),\s*([A-Z]{2})\s*$/);
        if (cityStateMatch) {
            city = cityStateMatch[1].trim();
            state = cityStateMatch[2];
        }

        // Count species
        const dogs = animals.filter(a => a.species?.toLowerCase() === 'dog').length;
        const cats = animals.filter(a => a.species?.toLowerCase() === 'cat').length;

        return {
            orgId: String(orgId),
            shelterName,
            city,
            state,
            animalCount: animals.length,
            dogs,
            cats,
        };
    } catch {
        return null;
    }
}

// ── Main ───────────────────────────────────────────────

async function main() {
    const args = process.argv.slice(2);
    const dryRun = args.includes('--dry-run');

    const startArg = args.find(a => a.startsWith('--start='));
    const endArg = args.find(a => a.startsWith('--end='));
    const start = startArg ? parseInt(startArg.split('=')[1], 10) : 1;
    const end = endArg ? parseInt(endArg.split('=')[1], 10) : (dryRun ? 500 : 15000);

    console.log(`🔍 ShelterLuv Org Discovery`);
    console.log(`   Range: ${start} → ${end} (${end - start} IDs)`);
    console.log(`   Concurrency: ${CONCURRENCY}`);
    console.log(`   Dry run: ${dryRun}\n`);

    // Load existing
    const existingRaw = readFileSync(CONFIG_PATH, 'utf-8');
    const existing: ExistingConfig[] = JSON.parse(existingRaw);
    const existingIds = new Set(existing.map(e => e.orgId));
    console.log(`   Existing: ${existing.length} orgs\n`);

    const discovered: DiscoveredOrg[] = [];
    let probed = 0;
    const total = end - start;

    for (let i = start; i <= end; i += CONCURRENCY) {
        const batch = Array.from(
            { length: Math.min(CONCURRENCY, end - i + 1) },
            (_, j) => i + j,
        );

        const results = await Promise.all(batch.map(id => probeOrg(id)));

        for (const result of results) {
            if (result && !existingIds.has(result.orgId)) {
                discovered.push(result);
                console.log(
                    `   ✅ #${result.orgId}: ${result.shelterName} — ` +
                    `${result.animalCount} animals (${result.dogs}D/${result.cats}C)`,
                );
            }
        }

        probed += batch.length;
        if (probed % 500 === 0 || probed === total) {
            const pct = Math.round((probed / total) * 100);
            console.log(`   ... ${probed}/${total} probed (${pct}%), ${discovered.length} found`);
        }

        await new Promise(r => setTimeout(r, BATCH_DELAY_MS));
    }

    // ── Results ────────────────────────────────────────
    console.log(`\n═══════════════════════════════════════════`);
    console.log(`📋 Discovery Results`);
    console.log(`═══════════════════════════════════════════`);
    console.log(`   Probed: ${probed} IDs`);
    console.log(`   Discovered: ${discovered.length} new orgs`);
    console.log(`   Already in config: ${existingIds.size}`);

    // Sort by animal count descending
    discovered.sort((a, b) => b.animalCount - a.animalCount);

    const totalAnimals = discovered.reduce((s, d) => s + d.animalCount, 0);
    const totalDogs = discovered.reduce((s, d) => s + d.dogs, 0);
    const totalCats = discovered.reduce((s, d) => s + d.cats, 0);
    console.log(`   Total animals across new orgs: ${totalAnimals} (${totalDogs}D/${totalCats}C)\n`);

    console.log(`   Top 30 by animal count:`);
    for (const s of discovered.slice(0, 30)) {
        console.log(`     #${s.orgId}: ${s.shelterName} — ${s.animalCount} (${s.dogs}D/${s.cats}C)`);
    }

    if (dryRun) {
        console.log(`\n✅ Dry run complete. Use without --dry-run to save.`);
        process.exit(0);
    }

    // ── Merge ──────────────────────────────────────────
    const newConfigs = discovered.map(d => {
        const slug = d.shelterName
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-|-$/g, '')
            .substring(0, 40);
        return {
            id: `${slug}-${d.orgId}`,
            shelterName: d.shelterName,
            orgId: d.orgId,
            city: d.city,
            state: d.state,
        };
    });

    const merged = [...existing, ...newConfigs];
    writeFileSync(CONFIG_PATH, JSON.stringify(merged, null, 4) + '\n');
    console.log(`\n✅ Config updated: ${merged.length} total orgs (+${newConfigs.length} new)`);

    process.exit(0);
}

main();
