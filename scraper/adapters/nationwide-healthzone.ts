/**
 * Nationwide Pet HealthZone Adapter
 *
 * Scrapes breed-specific health condition data from Nationwide's
 * Pet HealthZone (petinsurance.com/healthzone/pet-breeds/).
 *
 * Data includes: health conditions, risk levels, estimated costs,
 * and prevention tips per breed.
 *
 * Requires Playwright (browser scraping — Cloudflare protected).
 */

import { chromium, type Browser, type Page } from 'playwright';

const BASE_URL = 'https://www.petinsurance.com/healthzone/pet-breeds';
const DELAY_MS = 2000; // be respectful — Cloudflare protected

export interface NationwideCondition {
    condition: string;
    description: string | null;
    riskLevel: string | null;    // e.g., "High Risk", "Moderate Risk"
    costRange: string | null;     // e.g., "$1,000 - $5,000"
    prevention: string | null;
}

export interface NationwideBreedData {
    breed: string;
    conditions: NationwideCondition[];
    sourceUrl: string;
}

function sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Convert a breed name to the Nationwide URL slug.
 * "Golden Retriever" → "golden-retriever"
 * "German Shepherd Dog" → "german-shepherd-dog"
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
 * Scrape a single breed page from Nationwide Pet HealthZone.
 */
async function scrapeBreedPage(page: Page, breed: string, species: string): Promise<NationwideBreedData | null> {
    const speciesPath = species === 'DOG' ? 'dog-breeds' : 'cat-breeds';
    const slug = breedToSlug(breed);
    const url = `${BASE_URL}/${speciesPath}/${slug}/`;

    try {
        const response = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15000 });
        if (!response || response.status() !== 200) {
            return null;
        }

        // Wait for content to render
        await sleep(1500);

        // Extract health conditions from the page
        // Page structure: tabbed interface with .tab-content, health section has h3 headings
        const conditions = await page.evaluate(() => {
            const results: Array<{
                condition: string;
                description: string | null;
                riskLevel: string | null;
                costRange: string | null;
                prevention: string | null;
            }> = [];

            // Get all text content — health data is in the DOM even if tab not active
            const bodyText = document.body?.innerText || '';

            // Find the health section — look for "Health Concerns" heading
            const healthSection = bodyText.match(/Health Concerns?\s*\n([\s\S]*?)(?=\n(?:History|Personality|Appearance|Related)\s*\n|$)/i);
            if (healthSection && healthSection[1]) {
                const healthText = healthSection[1].trim();

                // Extract individual conditions (bolded terms in the paragraph)
                const strongElements = Array.from(document.querySelectorAll('strong, b'));
                for (const el of strongElements) {
                    const condText = el.textContent?.trim();
                    if (!condText || condText.length < 3 || condText.length > 100) continue;

                    // Check if it's a health-related term
                    if (/dysplasia|cancer|disease|infection|allergy|tumor|arthritis|cataract|atrophy|bloat|thyroid|diabetes|seizure|obesity|luxat|stenos/i.test(condText)) {
                        // Get surrounding paragraph text as description
                        const parent = el.closest('p, div, li');
                        const desc = parent?.textContent?.trim()?.substring(0, 300) || null;
                        const cost = (desc?.match(/\$[\d,]+\s*[-–]\s*\$[\d,]+/) || [])[0] || null;

                        results.push({
                            condition: condText,
                            description: desc,
                            riskLevel: null,
                            costRange: cost,
                            prevention: null,
                        });
                    }
                }

                // Fallback: extract from the health text directly
                if (results.length === 0) {
                    const conditionMatches = healthText.match(/(?:hip dysplasia|elbow dysplasia|cancer|heart disease|eye problems|allergies|bloat|thyroid|diabetes|kidney|arthritis|obesity|ear infections|skin conditions|cataracts|progressive retinal atrophy|retinal dysplasia|pancreatitis|seizures|luxating patella|fatty tumors?)[^,.]*[,.]/gi);
                    if (conditionMatches) {
                        for (const match of conditionMatches.slice(0, 10)) {
                            results.push({
                                condition: match.replace(/[,.]$/, '').trim().substring(0, 100),
                                description: healthText.substring(0, 300),
                                riskLevel: null,
                                costRange: null,
                                prevention: null,
                            });
                        }
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
 * Scrape Nationwide Pet HealthZone for multiple breeds.
 */
export async function scrapeNationwideBreeds(
    breeds: Array<{ name: string; species: string }>,
    onProgress?: (breed: string, idx: number, total: number, result: NationwideBreedData | null) => void,
): Promise<NationwideBreedData[]> {
    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({
        userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
    });
    const page = await context.newPage();
    const results: NationwideBreedData[] = [];

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
