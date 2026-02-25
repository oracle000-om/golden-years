/**
 * Discover Adopt-a-Pet Shelters — Sitemap-Based Discovery
 *
 * Downloads Adopt-a-Pet's public shelter sitemap to enumerate all shelters,
 * then probes each via their widget API to get pet counts and metadata.
 * Much faster and more complete than sequential ID probing.
 *
 * Pipeline:
 *   1. Fetch & parse shelter sitemap (8K+ shelters)
 *   2. Probe each shelter's widget for pet count
 *   3. Merge new shelters into adoptapet-config.json
 *
 * Usage:
 *   npx tsx scraper/discover-adoptapet.ts                    # full discovery
 *   npx tsx scraper/discover-adoptapet.ts --dry-run          # preview only
 *   npx tsx scraper/discover-adoptapet.ts --min-pets=5       # min pet threshold
 *   npx tsx scraper/discover-adoptapet.ts --limit=500        # cap new shelters
 */

import { readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { gunzipSync } from 'zlib';

// ── Types ──────────────────────────────────────────────

interface SitemapShelter {
    shelterId: string;
    slug: string;
    lastmod: string;
}

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
const SITEMAP_URL = 'https://www.adoptapet.com/sitemaps/shelter_1.xml.gz';
const CONCURRENCY = 10;
const DELAY_MS = 200;   // between batches
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

// ── US State Abbreviations ─────────────────────────────

const STATE_MAP: Record<string, string> = {
    'alabama': 'AL', 'alaska': 'AK', 'arizona': 'AZ', 'arkansas': 'AR',
    'california': 'CA', 'colorado': 'CO', 'connecticut': 'CT', 'delaware': 'DE',
    'florida': 'FL', 'georgia': 'GA', 'hawaii': 'HI', 'idaho': 'ID',
    'illinois': 'IL', 'indiana': 'IN', 'iowa': 'IA', 'kansas': 'KS',
    'kentucky': 'KY', 'louisiana': 'LA', 'maine': 'ME', 'maryland': 'MD',
    'massachusetts': 'MA', 'michigan': 'MI', 'minnesota': 'MN', 'mississippi': 'MS',
    'missouri': 'MO', 'montana': 'MT', 'nebraska': 'NE', 'nevada': 'NV',
    'new-hampshire': 'NH', 'new-jersey': 'NJ', 'new-mexico': 'NM', 'new-york': 'NY',
    'north-carolina': 'NC', 'north-dakota': 'ND', 'ohio': 'OH', 'oklahoma': 'OK',
    'oregon': 'OR', 'pennsylvania': 'PA', 'rhode-island': 'RI', 'south-carolina': 'SC',
    'south-dakota': 'SD', 'tennessee': 'TN', 'texas': 'TX', 'utah': 'UT',
    'vermont': 'VT', 'virginia': 'VA', 'washington': 'WA', 'west-virginia': 'WV',
    'wisconsin': 'WI', 'wyoming': 'WY', 'district-of-columbia': 'DC',
    // Canadian provinces
    'ontario': 'ON', 'quebec': 'QC', 'british-columbia': 'BC', 'alberta': 'AB',
    'manitoba': 'MB', 'saskatchewan': 'SK', 'nova-scotia': 'NS',
    'new-brunswick': 'NB', 'prince-edward-island': 'PE',
    'newfoundland-and-labrador': 'NL',
};

// ── Step 1: Sitemap Download & Parse ───────────────────

async function fetchSitemap(): Promise<SitemapShelter[]> {
    console.log(`   📥 Fetching sitemap from ${SITEMAP_URL}...`);
    const response = await fetch(SITEMAP_URL, {
        headers: { 'User-Agent': UA },
        signal: AbortSignal.timeout(30_000),
    });
    if (!response.ok) throw new Error(`Sitemap fetch failed: ${response.status}`);

    const gzipped = Buffer.from(await response.arrayBuffer());
    const xml = gunzipSync(gzipped).toString('utf-8');

    const shelters: SitemapShelter[] = [];
    const urlPattern = /<url>\s*[\s\S]*?<loc>(https:\/\/www\.adoptapet\.com\/shelter\/(\d+)-([^<]+))<\/loc>[\s\S]*?(?:<lastmod>([^<]*)<\/lastmod>)?[\s\S]*?<\/url>/g;

    let match;
    while ((match = urlPattern.exec(xml)) !== null) {
        shelters.push({
            shelterId: match[2],
            slug: match[3],
            lastmod: match[4] || '',
        });
    }

    console.log(`   📋 Parsed ${shelters.length} shelters from sitemap`);
    return shelters;
}

// ── Step 2: Shelter Probing via Widget ─────────────────

function parseSlug(slug: string): { name: string; city: string; state: string } {
    // Slug format: "shelter-name-city-state"
    // Last segment is state, second-to-last is city, rest is name
    const parts = slug.split('-');

    // Try to find state from the end
    let state = 'US';
    let stateIdx = parts.length;

    // Check last 1-3 segments for state match
    for (let len = 1; len <= 3 && len < parts.length; len++) {
        const candidate = parts.slice(parts.length - len).join('-');
        if (STATE_MAP[candidate]) {
            state = STATE_MAP[candidate];
            stateIdx = parts.length - len;
            break;
        }
    }

    // City is one segment before state, name is everything before city
    let city = 'Unknown';
    let nameEnd = stateIdx;
    if (stateIdx > 1) {
        // City could be multi-word; take the last segment before state
        city = parts[stateIdx - 1].replace(/-/g, ' ');
        city = city.charAt(0).toUpperCase() + city.slice(1);
        nameEnd = stateIdx - 1;
    }

    const name = parts.slice(0, nameEnd)
        .join(' ')
        .replace(/\b\w/g, c => c.toUpperCase());

    return { name, city, state };
}

async function probeShelter(shelterId: string, slug: string): Promise<DiscoveredShelter | null> {
    const widgetUrl = `https://searchtools.adoptapet.com/cgi-bin/searchtools.cgi/portable_pet_list?shelter_id=${shelterId}&sort_by=pet_name&size=800x600_list`;

    try {
        const response = await fetch(widgetUrl, {
            headers: { 'User-Agent': UA },
            signal: AbortSignal.timeout(10_000),
        });

        if (!response.ok) return null;
        const html = await response.text();

        // Count pet links (widget uses relative paths: /pet/12345-slug)
        const petLinks = html.match(/\/pet\/(\d+)-/g) || [];
        const petCount = new Set(petLinks.map(l => l.match(/(\d+)-/)?.[1])).size;
        if (petCount === 0) return null;

        // Extract shelter name, city, state from slug
        const { name: shelterName, city, state } = parseSlug(slug);

        // Build config-safe ID
        const id = slug.substring(0, 40);

        return {
            id,
            shelterName,
            adoptapetId: shelterId,
            city,
            state,
            petCount,
        };
    } catch {
        return null;
    }
}

// ── Main ───────────────────────────────────────────────

async function main() {
    const args = process.argv.slice(2);
    const dryRun = args.includes('--dry-run');
    const minPetsArg = args.find(a => a.startsWith('--min-pets='));
    const limitArg = args.find(a => a.startsWith('--limit='));
    const minPets = minPetsArg ? parseInt(minPetsArg.split('=')[1], 10) : 1;
    const limit = limitArg ? parseInt(limitArg.split('=')[1], 10) : Infinity;

    console.log(`🔍 Adopt-a-Pet Shelter Discovery (Sitemap)`);
    console.log(`   Dry run: ${dryRun} | Min pets: ${minPets} | Limit: ${limit === Infinity ? 'none' : limit}\n`);

    // Step 1: Fetch sitemap
    const sitemapShelters = await fetchSitemap();

    // Load existing config
    const existingRaw = readFileSync(CONFIG_PATH, 'utf-8');
    const existing: ExistingConfig[] = JSON.parse(existingRaw);
    const existingIds = new Set(existing.map(e => e.adoptapetId));
    console.log(`   Existing config: ${existing.length} shelters`);

    // Filter out already-configured shelters
    const toProbe = sitemapShelters.filter(s => !existingIds.has(s.shelterId));
    console.log(`   New to probe: ${toProbe.length} (${sitemapShelters.length - toProbe.length} already in config)\n`);

    // Step 2: Probe in batches
    const discovered: DiscoveredShelter[] = [];
    let probed = 0;
    let found = 0;
    let errors = 0;
    const startTime = Date.now();

    for (let i = 0; i < toProbe.length; i += CONCURRENCY) {
        const batch = toProbe.slice(i, i + CONCURRENCY);
        const results = await Promise.allSettled(
            batch.map(s => probeShelter(s.shelterId, s.slug))
        );

        for (const result of results) {
            if (result.status === 'fulfilled' && result.value) {
                if (result.value.petCount >= minPets) {
                    discovered.push(result.value);
                    found++;
                }
            } else if (result.status === 'rejected') {
                errors++;
            }
        }

        probed += batch.length;
        if (probed % 200 < CONCURRENCY || probed === toProbe.length) {
            const elapsed = ((Date.now() - startTime) / 1000).toFixed(0);
            const rate = (probed / ((Date.now() - startTime) / 1000)).toFixed(0);
            console.log(`   ... ${probed}/${toProbe.length} probed, ${found} with ≥${minPets} pets (${rate}/s, ${elapsed}s)`);
        }

        // Stop early if we hit the limit
        if (found >= limit) {
            console.log(`   ⏹ Limit of ${limit} reached, stopping.`);
            break;
        }

        await new Promise(r => setTimeout(r, DELAY_MS));
    }

    // Step 3: Results
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(0);
    discovered.sort((a, b) => b.petCount - a.petCount);

    console.log(`\n═══════════════════════════════════════════`);
    console.log(`📋 Discovery Results (${elapsed}s)`);
    console.log(`═══════════════════════════════════════════`);
    console.log(`   Sitemap shelters: ${sitemapShelters.length}`);
    console.log(`   Probed: ${probed} | Errors: ${errors}`);
    console.log(`   With ≥${minPets} pets: ${discovered.length}`);

    // State breakdown
    const byState = new Map<string, number>();
    for (const s of discovered) {
        byState.set(s.state, (byState.get(s.state) || 0) + 1);
    }
    const topStates = [...byState.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10);
    console.log(`\n   Top states: ${topStates.map(([s, n]) => `${s}(${n})`).join(', ')}`);

    // Top 30
    console.log(`\n   Top shelters by pet count:`);
    for (const s of discovered.slice(0, 30)) {
        console.log(`     ${s.adoptapetId.padStart(6)}: ${s.shelterName.substring(0, 45).padEnd(45)} ${s.city.padEnd(15)} ${s.state} — ${s.petCount} pets`);
    }

    if (dryRun) {
        console.log(`\n✅ Dry run complete. ${discovered.length} shelters found.`);
        process.exit(0);
    }

    // Merge into config
    const newConfigs = discovered.slice(0, limit === Infinity ? undefined : limit).map(s => ({
        id: s.id,
        shelterName: s.shelterName,
        adoptapetId: s.adoptapetId,
        city: s.city,
        state: s.state,
    }));
    const merged = [...existing, ...newConfigs];

    writeFileSync(CONFIG_PATH, JSON.stringify(merged, null, 4) + '\n');
    console.log(`\n✅ Config updated: ${merged.length} total shelters (+${newConfigs.length} new)`);

    process.exit(0);
}

main().catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
});
