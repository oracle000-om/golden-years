/**
 * ALDF State Rankings Scraper
 *
 * Scrapes the Animal Legal Defense Fund's annual U.S. Animal Protection
 * Laws Rankings and populates the StatePolicy table.
 *
 * Data source: https://aldf.org/project/us-state-rankings/
 * Per-state:   https://aldf.org/state/{slug}
 *
 * Usage:
 *   npx tsx scraper/run-aldf.ts --dry-run    # preview
 *   npx tsx scraper/run-aldf.ts              # save to DB
 */

import 'dotenv/config';
import { createPrismaClient } from './lib/prisma';

const RANKINGS_URL = 'https://aldf.org/project/us-state-rankings/';
const STATE_URL_BASE = 'https://aldf.org/state/';
const DELAY_MS = 800;

// ── State data ─────────────────────────────────────────

interface StateRanking {
    state: string;       // 2-letter code
    stateName: string;   // Full name
    slug: string;        // ALDF URL slug
    rank: number;
    tier: string;        // "Top Tier", "Middle Tier", "Bottom Tier"
}

const STATE_CODES: Record<string, string> = {
    'alabama': 'AL', 'alaska': 'AK', 'arizona': 'AZ', 'arkansas': 'AR',
    'california': 'CA', 'colorado': 'CO', 'connecticut': 'CT', 'delaware': 'DE',
    'florida': 'FL', 'georgia': 'GA', 'hawaii': 'HI', 'idaho': 'ID',
    'illinois': 'IL', 'indiana': 'IN', 'iowa': 'IA', 'kansas': 'KS',
    'kentucky': 'KY', 'louisiana': 'LA', 'maine': 'ME', 'maryland': 'MD',
    'massachusetts': 'MA', 'michigan': 'MI', 'minnesota': 'MN', 'mississippi': 'MS',
    'missouri': 'MO', 'montana': 'MT', 'nebraska': 'NE', 'nevada': 'NV',
    'new hampshire': 'NH', 'new jersey': 'NJ', 'new mexico': 'NM', 'new york': 'NY',
    'north carolina': 'NC', 'north dakota': 'ND', 'ohio': 'OH', 'oklahoma': 'OK',
    'oregon': 'OR', 'pennsylvania': 'PA', 'rhode island': 'RI', 'south carolina': 'SC',
    'south dakota': 'SD', 'tennessee': 'TN', 'texas': 'TX', 'utah': 'UT',
    'vermont': 'VT', 'virginia': 'VA', 'washington': 'WA', 'west virginia': 'WV',
    'wisconsin': 'WI', 'wyoming': 'WY', 'district of columbia': 'DC',
};

// ── Scraper ────────────────────────────────────────────

async function fetchPage(url: string): Promise<string> {
    const resp = await fetch(url, {
        headers: {
            'User-Agent': 'GoldenYearsClub/1.0 (animal welfare research)',
            'Accept': 'text/html',
        },
        signal: AbortSignal.timeout(15_000),
    });
    if (!resp.ok) throw new Error(`HTTP ${resp.status} for ${url}`);
    return resp.text();
}

/**
 * Parse the ALDF rankings page to extract the ordered list of states by tier.
 * The page has three ordered lists: Top, Middle, Bottom.
 */
async function scrapeRankings(): Promise<StateRanking[]> {
    console.log('📜 Fetching ALDF rankings page...');
    const html = await fetchPage(RANKINGS_URL);

    const rankings: StateRanking[] = [];

    // Extract all state links from the page: /state/{slug}
    // The page lists states in three groups (top, middle, bottom)
    // Each group is an ordered list
    const linkRegex = /href="(?:https?:\/\/aldf\.org)?\/state\/([a-z-]+)"/gi;
    const slugsSeen = new Set<string>();
    const orderedSlugs: string[] = [];

    let match;
    while ((match = linkRegex.exec(html)) !== null) {
        const slug = match[1].toLowerCase();
        if (!slugsSeen.has(slug)) {
            slugsSeen.add(slug);
            orderedSlugs.push(slug);
        }
    }

    console.log(`   Found ${orderedSlugs.length} state slugs`);

    // Now fetch each state page to get rank + tier
    let rank = 0;
    for (const slug of orderedSlugs) {
        const stateName = slug
            .split('-')
            .map(w => w.charAt(0).toUpperCase() + w.slice(1))
            .join(' ');
        const stateCode = STATE_CODES[stateName.toLowerCase()];
        if (!stateCode) {
            console.log(`   ⚠ Skipping unknown slug: ${slug} (${stateName})`);
            continue;
        }

        try {
            const stateHtml = await fetchPage(`${STATE_URL_BASE}${slug}`);

            // Extract: "Overall Rank: <strong><span class="state-rank--top">#1 (Top Tier)</span></strong>"
            // Strip HTML tags to normalize before matching
            const stripped = stateHtml.replace(/<[^>]+>/g, '');
            const rankMatch = stripped.match(
                /Overall\s+Rank:\s*#(\d+)\s*\(([^)]+)\)/i
            );

            if (rankMatch) {
                rank = parseInt(rankMatch[1], 10);
                const tier = rankMatch[2].trim();
                rankings.push({
                    state: stateCode,
                    stateName,
                    slug,
                    rank,
                    tier,
                });
                console.log(`   ${rank}. ${stateName} (${stateCode}) — ${tier}`);
            } else {
                rank++;
                rankings.push({
                    state: stateCode,
                    stateName,
                    slug,
                    rank,
                    tier: 'Unknown',
                });
                console.log(`   ${rank}. ${stateName} (${stateCode}) — rank not found on page, using position`);
            }
        } catch (err) {
            rank++;
            rankings.push({
                state: stateCode,
                stateName,
                slug,
                rank,
                tier: 'Unknown',
            });
            console.log(`   ⚠ ${stateName}: ${(err as Error).message?.substring(0, 80)}`);
        }

        await new Promise(r => setTimeout(r, DELAY_MS));
    }

    return rankings;
}

// ── Main ───────────────────────────────────────────────

async function main() {
    const args = process.argv.slice(2);
    const dryRun = args.includes('--dry-run');

    console.log('🏛️  ALDF State Animal Protection Laws Scraper');
    console.log(`   Mode: ${dryRun ? 'DRY RUN' : 'LIVE'}\n`);

    const rankings = await scrapeRankings();

    // Summary
    console.log(`\n═══════════════════════════════════════════`);
    console.log(`📊 Results`);
    console.log(`═══════════════════════════════════════════`);
    console.log(`   States scraped: ${rankings.length}`);

    const tiers = new Map<string, number>();
    for (const r of rankings) tiers.set(r.tier, (tiers.get(r.tier) || 0) + 1);
    for (const [tier, count] of tiers) console.log(`   ${tier}: ${count}`);

    if (dryRun) {
        console.log(`\n✅ Dry run complete.`);
        process.exit(0);
    }

    // Upsert into DB
    console.log(`\n💾 Saving to database...`);
    const prisma = await createPrismaClient();
    let created = 0;
    let updated = 0;

    for (const r of rankings) {
        const existing = await prisma.statePolicy.findUnique({ where: { state: r.state } });

        await prisma.statePolicy.upsert({
            where: { state: r.state },
            create: {
                state: r.state,
                stateName: r.stateName,
                aldfRank: r.rank,
                aldfTier: r.tier,
                aldfYear: new Date().getFullYear(),
                aldfUrl: `${STATE_URL_BASE}${r.slug}`,
                lastScrapedAt: new Date(),
            },
            update: {
                aldfRank: r.rank,
                aldfTier: r.tier,
                aldfYear: new Date().getFullYear(),
                aldfUrl: `${STATE_URL_BASE}${r.slug}`,
                lastScrapedAt: new Date(),
            },
        });

        if (existing) updated++;
        else created++;
    }

    console.log(`   Created: ${created}, Updated: ${updated}`);
    console.log(`\n✅ Done!`);

    await prisma.$disconnect();
    process.exit(0);
}

main().catch(async (err) => {
    console.error('Fatal:', err);
    process.exit(1);
});

