/**
 * Run News Busts — Google News RSS Scraper
 *
 * Searches Google News for animal cruelty busts, dogfighting raids,
 * hoarding cases, and mill seizures. Extracts structured data with
 * pure regex (zero cost, no API keys).
 *
 * Usage:
 *   npx tsx scraper/run-news-busts.ts              # full scrape
 *   npx tsx scraper/run-news-busts.ts --dry-run    # preview only
 */

import 'dotenv/config';
import { createPrismaClient } from './lib/prisma';

const QUERIES = [
    '"dogs seized" OR "animals seized" OR "dogfighting bust"',
    '"puppy mill raid" OR "animal hoarding" OR "cruelty charges animals"',
    '"animals rescued" OR "dogs confiscated" OR "cats seized"',
];

const STATE_MAP: Record<string, string> = {
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
    'wisconsin': 'WI', 'wyoming': 'WY',
};

// Reverse map: abbreviations
for (const [name, abbr] of Object.entries(STATE_MAP)) {
    STATE_MAP[abbr.toLowerCase()] = abbr;
}

interface ParsedArticle {
    title: string;
    link: string;
    pubDate: Date;
    state: string | null;
    animalCount: number;
    species: string[];
    chargeType: string | null;
    narrative: string;
}

function extractState(text: string): string | null {
    const lower = text.toLowerCase();
    // Try state names first (longer matches)
    for (const [name, abbr] of Object.entries(STATE_MAP)) {
        if (name.length > 2 && lower.includes(name)) return abbr;
    }
    // Try 2-letter codes surrounded by non-alpha
    const abbrMatch = text.match(/\b([A-Z]{2})\b/);
    if (abbrMatch && STATE_MAP[abbrMatch[1].toLowerCase()]) {
        return STATE_MAP[abbrMatch[1].toLowerCase()];
    }
    return null;
}

function extractAnimalCount(text: string): number {
    // Match patterns like "48 dogs", "127 animals", "35 cats"
    const patterns = [
        /(\d+)\s+(?:dogs?|cats?|animals?|puppies|kittens|pets?)/gi,
        /(?:seized|rescued|removed|confiscated|found)\s+(\d+)/gi,
        /(?:over|more than|nearly|approximately|about)\s+(\d+)/gi,
    ];
    let max = 0;
    for (const pat of patterns) {
        let m;
        while ((m = pat.exec(text)) !== null) {
            const n = parseInt(m[1], 10);
            if (n > 0 && n < 10000) max = Math.max(max, n);
        }
    }
    return max;
}

function extractSpecies(text: string): string[] {
    const lower = text.toLowerCase();
    const species: string[] = [];
    if (/\bdog|puppy|puppies|canine/i.test(lower)) species.push('DOG');
    if (/\bcat|kitten|feline/i.test(lower)) species.push('CAT');
    return species;
}

function extractChargeType(text: string): string | null {
    const lower = text.toLowerCase();
    if (/dog\s*fight|cockfight|fighting\s*ring/i.test(lower)) return 'FIGHTING';
    if (/hoarding|hoarder/i.test(lower)) return 'HOARDING';
    if (/puppy\s*mill|breeding\s*operation|unlicensed\s*breed/i.test(lower)) return 'CRUELTY';
    if (/neglect|malnourish|starv/i.test(lower)) return 'NEGLECT';
    if (/cruelty|abuse|torture/i.test(lower)) return 'CRUELTY';
    if (/seiz|confiscat|remov/i.test(lower)) return 'CRUELTY';
    return null;
}

function parseRssXml(xml: string): ParsedArticle[] {
    const articles: ParsedArticle[] = [];
    const itemRegex = /<item>([\s\S]*?)<\/item>/g;
    let match;

    while ((match = itemRegex.exec(xml)) !== null) {
        const item = match[1];
        const title = item.match(/<title><!\[CDATA\[(.*?)\]\]><\/title>/)
            || item.match(/<title>(.*?)<\/title>/);
        const link = item.match(/<link>(.*?)<\/link>/);
        const pubDate = item.match(/<pubDate>(.*?)<\/pubDate>/);

        if (!title || !link) continue;

        const titleText = title[1].replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>');
        const fullText = titleText;

        articles.push({
            title: titleText,
            link: link[1],
            pubDate: pubDate ? new Date(pubDate[1]) : new Date(),
            state: extractState(fullText),
            animalCount: extractAnimalCount(fullText),
            species: extractSpecies(fullText),
            chargeType: extractChargeType(fullText),
            narrative: titleText.substring(0, 500),
        });
    }

    return articles;
}

async function main() {
    const dryRun = process.argv.includes('--dry-run');
    console.log(`📰 Golden Years Club — News Busts Scraper${dryRun ? ' (DRY RUN)' : ''}`);

    const prisma = await createPrismaClient();
    const allArticles: ParsedArticle[] = [];

    for (const query of QUERIES) {
        const encoded = encodeURIComponent(query);
        const url = `https://news.google.com/rss/search?q=${encoded}&hl=en-US&gl=US&ceid=US:en`;

        try {
            const res = await fetch(url);
            if (!res.ok) {
                console.log(`   ⚠️  RSS fetch failed for query: ${res.status}`);
                continue;
            }
            const xml = await res.text();
            const articles = parseRssXml(xml);
            console.log(`   📡 "${query.substring(0, 40)}..." → ${articles.length} articles`);
            allArticles.push(...articles);
        } catch (err: any) {
            console.log(`   ❌ Fetch error: ${err.message}`);
        }
    }

    // Dedup by link
    const seen = new Set<string>();
    const unique = allArticles.filter(a => {
        if (seen.has(a.link)) return false;
        seen.add(a.link);
        return true;
    });

    // Filter: must have state + animal count > 0
    const valid = unique.filter(a => a.state && a.animalCount > 0);
    console.log(`\n📊 Found ${unique.length} unique articles, ${valid.length} with extractable data`);

    if (dryRun) {
        for (const a of valid.slice(0, 10)) {
            console.log(`   ${a.state} | ${a.animalCount} animals | ${a.chargeType || '?'} | ${a.title.substring(0, 60)}`);
        }
        await prisma.$disconnect();
        return;
    }

    // Dedup against existing DB entries by sourceUrl
    let created = 0, skipped = 0, errors = 0;

    for (const article of valid) {
        try {
            const existing = await prisma.confiscationEvent.findFirst({
                where: { sourceUrl: article.link },
            });
            if (existing) { skipped++; continue; }

            await prisma.confiscationEvent.create({
                data: {
                    state: article.state!,
                    date: article.pubDate,
                    animalCount: article.animalCount,
                    species: article.species,
                    chargeType: article.chargeType,
                    narrative: article.narrative,
                    sourceUrl: article.link,
                },
            });
            created++;
        } catch (err: any) {
            errors++;
            if (errors <= 3) console.log(`   ❌ ${err.message?.substring(0, 80)}`);
        }
    }

    console.log(`\n🏁 News busts complete — ${created} new, ${skipped} existing, ${errors} errors`);
    await prisma.$disconnect();
}

main().catch(err => { console.error('Fatal:', err); process.exit(1); });
