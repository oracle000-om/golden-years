/**
 * Trupanion Breed Conditions Adapter
 *
 * Scrapes breed-specific health condition data from Trupanion's
 * breed pages (trupanion.com/breeds/).
 *
 * Data includes: common conditions per life stage (puppy, adult, senior),
 * average cost ranges, and claim frequency relative to average pets.
 *
 * Requires Playwright (browser scraping — bot protected).
 */

import { chromium, type Browser, type Page } from 'playwright';

const BASE_URL = 'https://www.trupanion.com/breeds';
const DELAY_MS = 2500; // Trupanion has stricter bot protection

export interface TrupanionCondition {
    condition: string;
    costRange: string | null;      // e.g., "$400 - $800"
    frequency: string | null;       // e.g., "2.3x more likely" or claim count
    lifeStage: string | null;       // "puppy", "adult", "senior", or null
    description: string | null;
}

export interface TrupanionBreedData {
    breed: string;
    conditions: TrupanionCondition[];
    sourceUrl: string;
}

function sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Convert a breed name to the Trupanion URL slug.
 * "Golden Retriever" → "golden-retriever"
 */
function breedToSlug(breed: string): string {
    return breed
        .toLowerCase()
        .replace(/[^a-z0-9\s-]/g, '')
        .replace(/\s+/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '');
}

/**
 * Scrape a single breed page from Trupanion.
 */
async function scrapeBreedPage(page: Page, breed: string, species: string): Promise<TrupanionBreedData | null> {
    const speciesPath = species === 'DOG' ? 'dogs' : 'cats';
    const slug = breedToSlug(breed);
    const url = `${BASE_URL}/${speciesPath}/${slug}`;

    try {
        const response = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15000 });
        if (!response || response.status() !== 200) {
            return null;
        }

        // Wait for content to render (SPA-like)
        await sleep(2000);

        // Extract condition data from the page
        const conditions = await page.evaluate(() => {
            const results: Array<{
                condition: string;
                costRange: string | null;
                frequency: string | null;
                lifeStage: string | null;
                description: string | null;
            }> = [];

            // Determine current life stage context
            let currentLifeStage: string | null = null;

            // Strategy 1: Look for condition cards/sections
            const conditionElements = Array.from(document.querySelectorAll(
                '[class*="condition"], [class*="claim"], [class*="health-issue"], [class*="medical"]'
            ));

            for (const el of conditionElements) {
                const heading = el.querySelector('h2, h3, h4, strong, [class*="title"]');
                if (!heading?.textContent?.trim()) continue;

                const text = el.textContent || '';
                const cost = (text.match(/\$[\d,]+\s*[-–to]\s*\$[\d,]+/) || [])[0] || null;
                const freq = (text.match(/(\d+\.?\d*)\s*x\s*more/i) || [])[0] || null;
                const desc = el.querySelector('p')?.textContent?.trim() || null;

                // Detect life stage from surrounding context
                const parentText = el.closest('section')?.querySelector('h2')?.textContent?.toLowerCase() || '';
                if (parentText.includes('puppy') || parentText.includes('kitten')) currentLifeStage = 'puppy';
                else if (parentText.includes('senior') || parentText.includes('older')) currentLifeStage = 'senior';
                else if (parentText.includes('adult')) currentLifeStage = 'adult';

                results.push({
                    condition: heading.textContent.trim(),
                    costRange: cost,
                    frequency: freq,
                    lifeStage: currentLifeStage,
                    description: desc,
                });
            }

            // Strategy 2: Look for table-like structures with claim data
            if (results.length === 0) {
                const rows = Array.from(document.querySelectorAll('table tr, [class*="table"] [class*="row"]'));
                for (const row of rows) {
                    const cells = Array.from(row.querySelectorAll('td, [class*="cell"]'));
                    if (cells.length >= 2) {
                        const condition = cells[0]?.textContent?.trim();
                        if (!condition || condition.length < 3) continue;

                        const otherText = cells.slice(1).map(c => c.textContent?.trim()).join(' ');
                        const cost = (otherText.match(/\$[\d,]+\s*[-–to]\s*\$[\d,]+/) || [])[0] || null;
                        const freq = (otherText.match(/(\d+\.?\d*)\s*x/i) || [])[0] || null;

                        results.push({
                            condition,
                            costRange: cost,
                            frequency: freq,
                            lifeStage: null,
                            description: null,
                        });
                    }
                }
            }

            // Strategy 3: Extract from body text
            if (results.length === 0) {
                const bodyText = document.body?.innerText || '';
                const conditionMatches = bodyText.match(/(?:hip dysplasia|cancer|heart disease|eye problems|allergies|bloat|thyroid|diabetes|kidney|arthritis|obesity|dental disease|seizures|skin conditions|cataracts|pancreatitis|cruciate|luxating patella|elbow dysplasia|ear infections|respiratory)[^.]*\./gi);
                if (conditionMatches) {
                    for (const match of conditionMatches.slice(0, 10)) {
                        const condition = match.split(/\s*[-–:,]\s*/)[0].trim();
                        const cost = (match.match(/\$[\d,]+\s*[-–to]\s*\$[\d,]+/) || [])[0] || null;
                        results.push({
                            condition: condition.substring(0, 100),
                            costRange: cost,
                            frequency: null,
                            lifeStage: null,
                            description: match.trim().substring(0, 300),
                        });
                    }
                }
            }

            return results;
        });

        if (conditions.length === 0) return null;

        return {
            breed,
            conditions,
            sourceUrl: url,
        };
    } catch {
        return null;
    }
}

/**
 * Scrape Trupanion breed pages for multiple breeds.
 */
export async function scrapeTrupanionBreeds(
    breeds: Array<{ name: string; species: string }>,
    onProgress?: (breed: string, idx: number, total: number, result: TrupanionBreedData | null) => void,
): Promise<TrupanionBreedData[]> {
    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({
        userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
    });
    const page = await context.newPage();
    const results: TrupanionBreedData[] = [];

    try {
        for (let i = 0; i < breeds.length; i++) {
            const breed = breeds[i];
            const data = await scrapeBreedPage(page, breed.name, breed.species);

            if (onProgress) {
                onProgress(breed.name, i, breeds.length, data);
            }

            if (data) {
                results.push(data);
            }

            await sleep(DELAY_MS);
        }
    } finally {
        await browser.close();
    }

    return results;
}
