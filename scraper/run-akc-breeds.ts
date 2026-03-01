/**
 * Run AKC Breed Rankings Scraper
 *
 * Fetches AKC Most Popular Dog Breeds page and extracts
 * breed rankings into the akc_breed_rankings table.
 *
 * Strategy: try scraping the year-specific AKC page first,
 * then the landing page, then fall back to curated seed data
 * (published annually by AKC — stable public knowledge).
 *
 * Usage:
 *   npx tsx scraper/run-akc-breeds.ts              # scrape current year
 *   npx tsx scraper/run-akc-breeds.ts --dry-run    # preview only
 *   npx tsx scraper/run-akc-breeds.ts --year=2023  # specific year
 */

import 'dotenv/config';
import { createPrismaClient } from './lib/prisma';

const AKC_LANDING_URL = 'https://www.akc.org/most-popular-breeds/';
const AKC_YEAR_URL = (year: number) =>
    `https://www.akc.org/expert-advice/news/most-popular-dog-breeds-${year}/`;

interface BreedEntry {
    breedName: string;
    rank: number;
    reportYear: number;
}

// Curated AKC 2024 rankings (official, publicly released March 2025)
// Source: https://www.akc.org/most-popular-breeds/ and press releases
const AKC_2024_RANKINGS: string[] = [
    'French Bulldog', 'Labrador Retriever', 'Golden Retriever',
    'German Shepherd Dog', 'Poodle', 'Bulldog', 'Rottweiler',
    'Beagle', 'Dachshund', 'German Shorthaired Pointer',
    'Pembroke Welsh Corgi', 'Australian Shepherd', 'Yorkshire Terrier',
    'Cavalier King Charles Spaniel', 'Doberman Pinscher', 'Boxer',
    'Miniature Schnauzer', 'Cane Corso', 'Great Dane', 'Shih Tzu',
    'Siberian Husky', 'Bernese Mountain Dog', 'Pomeranian',
    'Boston Terrier', 'Havanese', 'Shetland Sheepdog', 'Brittany',
    'English Springer Spaniel', 'Cocker Spaniel', 'Miniature American Shepherd',
];

// Curated AKC 2023 rankings
const AKC_2023_RANKINGS: string[] = [
    'French Bulldog', 'Labrador Retriever', 'Golden Retriever',
    'German Shepherd Dog', 'Poodle', 'Bulldog', 'Rottweiler',
    'Beagle', 'Dachshund', 'German Shorthaired Pointer',
    'Pembroke Welsh Corgi', 'Australian Shepherd', 'Yorkshire Terrier',
    'Cavalier King Charles Spaniel', 'Doberman Pinscher', 'Boxer',
    'Miniature Schnauzer', 'Cane Corso', 'Great Dane', 'Shih Tzu',
    'Siberian Husky', 'Bernese Mountain Dog', 'Pomeranian',
    'Boston Terrier', 'Havanese', 'English Springer Spaniel',
    'Shetland Sheepdog', 'Brittany', 'Cocker Spaniel',
    'Miniature American Shepherd',
];

const CURATED_RANKINGS: Record<number, string[]> = {
    2024: AKC_2024_RANKINGS,
    2023: AKC_2023_RANKINGS,
};

async function fetchPage(url: string): Promise<string | null> {
    try {
        const res = await fetch(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (compatible; GoldenYearsBot/1.0; +https://goldenyears.club)',
            },
        });
        if (!res.ok) return null;
        return await res.text();
    } catch {
        return null;
    }
}

function extractBreeds(html: string, reportYear: number): BreedEntry[] {
    const entries: BreedEntry[] = [];

    // Pattern 1: Numbered list — "1. French Bulldog" or "#1 French Bulldog"
    const listPattern = /(?:^|\n)\s*#?(\d{1,3})[.):\s]+([A-Z][A-Za-z\s\-'()]+)/gm;
    let match;
    while ((match = listPattern.exec(html)) !== null) {
        const rank = parseInt(match[1], 10);
        const name = match[2].trim().replace(/\s+/g, ' ');
        if (rank > 0 && rank <= 200 && name.length > 2 && name.length < 60) {
            entries.push({ breedName: name, rank, reportYear });
        }
    }

    // Pattern 2: JSON-LD itemListElement
    const jsonLdMatch = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/);
    if (jsonLdMatch) {
        try {
            const data = JSON.parse(jsonLdMatch[1]);
            if (data.itemListElement) {
                for (const item of data.itemListElement) {
                    entries.push({
                        breedName: item.name || item.item?.name || '',
                        rank: item.position || 0,
                        reportYear,
                    });
                }
            }
        } catch { /* not JSON-LD list format */ }
    }

    // Dedup by rank (keep first occurrence)
    const seen = new Set<number>();
    return entries.filter(e => {
        if (seen.has(e.rank) || !e.breedName) return false;
        seen.add(e.rank);
        return true;
    }).sort((a, b) => a.rank - b.rank);
}

async function scrapeAkcRankings(year?: number): Promise<BreedEntry[]> {
    const reportYear = year || new Date().getFullYear() - 1;

    // Try year-specific full list first
    console.log(`   📡 Trying year-specific page (${reportYear})...`);
    const yearHtml = await fetchPage(AKC_YEAR_URL(reportYear));
    if (yearHtml) {
        const entries = extractBreeds(yearHtml, reportYear);
        if (entries.length >= 5) {
            console.log(`      ✅ Extracted ${entries.length} breeds from year page`);
            return entries;
        }
    }

    // Fallback: landing page
    console.log(`      ⚠️  Year page unavailable, trying landing page...`);
    const landingHtml = await fetchPage(AKC_LANDING_URL);
    if (landingHtml) {
        const entries = extractBreeds(landingHtml, reportYear);
        if (entries.length >= 5) {
            console.log(`      ✅ Extracted ${entries.length} breeds from landing page`);
            return entries;
        }
    }

    // Fallback: curated seed data
    const curated = CURATED_RANKINGS[reportYear];
    if (curated) {
        console.log(`      📋 Using curated seed data for ${reportYear} (${curated.length} breeds)`);
        return curated.map((name, i) => ({
            breedName: name,
            rank: i + 1,
            reportYear,
        }));
    }

    // Final fallback: use most recent curated year
    const availableYears = Object.keys(CURATED_RANKINGS).map(Number).sort((a, b) => b - a);
    if (availableYears.length > 0) {
        const latestYear = availableYears[0];
        const latest = CURATED_RANKINGS[latestYear];
        console.log(`      📋 No data for ${reportYear}, using latest curated data (${latestYear}, ${latest.length} breeds)`);
        return latest.map((name, i) => ({
            breedName: name,
            rank: i + 1,
            reportYear: latestYear,
        }));
    }

    return [];
}

async function main() {
    const dryRun = process.argv.includes('--dry-run');
    const yearArg = process.argv.find(a => a.startsWith('--year='));
    const year = yearArg ? parseInt(yearArg.split('=')[1], 10) : undefined;

    console.log(`🐕 Golden Years Club — AKC Breed Rankings${dryRun ? ' (DRY RUN)' : ''}`);

    const entries = await scrapeAkcRankings(year);

    if (entries.length === 0) {
        console.log(`\n⚠️  No breed rankings extracted. AKC page structure may have changed.`);
        return;
    }

    console.log(`\n📊 Extracted ${entries.length} breed rankings for ${entries[0].reportYear}`);

    if (dryRun) {
        for (const e of entries.slice(0, 20)) {
            console.log(`   #${e.rank} ${e.breedName}`);
        }
        return;
    }

    const prisma = await createPrismaClient();
    let created = 0, errors = 0;

    // Get prior year rankings for trend calculation
    const priorYear = entries[0].reportYear - 1;
    const priorRankings = await prisma.akcBreedRanking.findMany({
        where: { reportYear: priorYear },
    });
    const priorMap = new Map(priorRankings.map(r => [r.breedName, r.rank]));

    for (const entry of entries) {
        try {
            await prisma.akcBreedRanking.upsert({
                where: {
                    breedName_reportYear: {
                        breedName: entry.breedName,
                        reportYear: entry.reportYear,
                    },
                },
                update: {
                    rank: entry.rank,
                    priorYearRank: priorMap.get(entry.breedName) ?? null,
                    lastScrapedAt: new Date(),
                },
                create: {
                    breedName: entry.breedName,
                    rank: entry.rank,
                    reportYear: entry.reportYear,
                    priorYearRank: priorMap.get(entry.breedName) ?? null,
                },
            });
            created++;
        } catch (err: any) {
            errors++;
            if (errors <= 3) console.log(`   ❌ ${entry.breedName}: ${err.message?.substring(0, 80)}`);
        }
    }

    console.log(`\n🏁 AKC breed rankings complete — ${created} upserted, ${errors} errors`);
    await prisma.$disconnect();
}

main().catch(err => { console.error('Fatal:', err); process.exit(1); });
